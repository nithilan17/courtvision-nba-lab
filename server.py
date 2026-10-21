"""Serve CourtVision and query the local NBA player-game corpus.

The default dataset is ../nba_player_game_logs.csv relative to this file.
Use --data to point at another compatible CSV.
"""

from __future__ import annotations

import argparse
import csv
import json
from collections import Counter
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

CORE_STATS = ("PTS", "REB", "AST")
REQUIRED_COLUMNS = {"PLAYER_NAME", *CORE_STATS, "STL", "BLK"}


def stat(row: dict[str, str], key: str) -> int:
    return int(float(row[key]))


class Corpus:
    def __init__(self, path: Path):
        self.path, self.rows, self.invalid_rows, self.seasons, self.games = path, 0, 0, set(), []

    def load(self) -> None:
        if not self.path.exists():
            raise FileNotFoundError(f"Corpus not found: {self.path}")
        with self.path.open(encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            if not reader.fieldnames or not REQUIRED_COLUMNS.issubset(set(reader.fieldnames)):
                raise ValueError("Corpus is missing required player-game columns.")
            for row in reader:
                self.rows += 1
                if row.get("SEASON"):
                    self.seasons.add(row["SEASON"])
                try:
                    reached = [key for key in CORE_STATS if stat(row, key) >= 10]
                    missed = next(key for key in CORE_STATS if stat(row, key) < 10) if len(reached) == 2 else None
                    defense = stat(row, "STL") + stat(row, "BLK")
                except (TypeError, ValueError):
                    self.invalid_rows += 1
                    continue
                if len(reached) != 2:
                    continue
                if missed and stat(row, missed) + defense >= 10:
                    self.games.append({**row, "MISSED_STAT": missed, "DEFENSIVE_STATS": defense, "ADJUSTED_VALUE": stat(row, missed) + defense})

    def query(self, values: dict[str, list[str]]) -> dict[str, object]:
        season = values.get("season", ["all"])[0]
        game_type = values.get("game_type", ["all"])[0]
        player = values.get("player", [""])[0].casefold()
        try:
            min_defense = max(0, int(values.get("min_defense", ["0"])[0]))
        except ValueError:
            min_defense = 0
        games = [game for game in self.games if (season == "all" or game.get("SEASON") == season) and (game_type == "all" or game.get("SEASON_TYPE") == game_type) and (not player or player in str(game["PLAYER_NAME"]).casefold()) and int(game["DEFENSIVE_STATS"]) >= min_defense]
        games.sort(key=lambda game: (str(game.get("GAME_DATE", "")), str(game["PLAYER_NAME"])), reverse=True)
        players = Counter(str(game["PLAYER_NAME"]) for game in games)
        top = sorted(players.items(), key=lambda item: (-item[1], item[0]))[0] if players else None
        return {"games": games, "total": len(games), "unique_players": len(players), "top_player": {"name": top[0], "count": top[1]} if top else None}


def handler_factory(corpus: Corpus, static_directory: Path):
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(static_directory), **kwargs)

        def send_json(self, data: object) -> None:
            payload = json.dumps(data).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def do_GET(self) -> None:
            request = urlparse(self.path)
            if request.path == "/api/meta":
                self.send_json({"rows": corpus.rows, "invalid_rows": corpus.invalid_rows, "seasons": sorted(corpus.seasons, reverse=True), "candidate_games": len(corpus.games), "source": corpus.path.name})
            elif request.path == "/api/query":
                self.send_json(corpus.query(parse_qs(request.query)))
            else:
                super().do_GET()
    return Handler


def main() -> None:
    root = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=root.parent / "nba_player_game_logs.csv")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    corpus = Corpus(args.data.resolve())
    print(f"Loading {corpus.path.name} ...", flush=True)
    corpus.load()
    print(f"Ready: {corpus.rows:,} player-games; {len(corpus.games):,} qualifying games; {corpus.invalid_rows:,} malformed rows skipped.")
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler_factory(corpus, root / "dist"))
    print(f"Open http://127.0.0.1:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nCourtVision server stopped.")


if __name__ == "__main__":
    main()
