"""Serve CourtVision's local NBA stat-tracker corpus and query API."""

from __future__ import annotations

import argparse
import csv
import json
import os
import sqlite3
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


STATS = ("PTS", "REB", "AST", "STL", "BLK")
COLUMNS = ("PLAYER_NAME", "PLAYER_ID", "GAME_ID", "GAME_DATE", "SEASON", "SEASON_TYPE", *STATS)


class Corpus:
    def __init__(self, source: Path, database: Path):
        self.source, self.database = source, database

    def ensure_index(self) -> None:
        if not self.source.exists():
            raise FileNotFoundError(f"Corpus not found: {self.source}")
        if self.database.exists() and self.database.stat().st_mtime >= self.source.stat().st_mtime:
            return
        self.database.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.database.with_suffix(".building")
        if temporary.exists():
            temporary.unlink()
        connection = sqlite3.connect(temporary)
        connection.execute("CREATE TABLE games (player_name TEXT, player_id TEXT, game_id TEXT, game_date TEXT, season TEXT, season_type TEXT, pts INTEGER, reb INTEGER, ast INTEGER, stl INTEGER, blk INTEGER)")
        skipped, batch = 0, []
        with self.source.open(encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            if not reader.fieldnames or not set(COLUMNS).issubset(reader.fieldnames):
                raise ValueError("Corpus is missing required player-game columns.")
            for row in reader:
                try:
                    batch.append((row["PLAYER_NAME"], row.get("PLAYER_ID", ""), row.get("GAME_ID", ""), row.get("GAME_DATE", ""), row.get("SEASON", ""), row.get("SEASON_TYPE", ""), *(int(float(row[stat])) for stat in STATS)))
                except (TypeError, ValueError):
                    skipped += 1
                    continue
                if len(batch) >= 10_000:
                    connection.executemany("INSERT INTO games VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", batch)
                    batch.clear()
        if batch:
            connection.executemany("INSERT INTO games VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", batch)
        for stat in STATS:
            connection.execute(f"CREATE INDEX games_{stat.lower()} ON games ({stat.lower()})")
        connection.execute("CREATE INDEX games_season ON games (season)")
        connection.execute("CREATE INDEX games_player ON games (player_name)")
        connection.commit()
        connection.close()
        os.replace(temporary, self.database)
        print(f"Indexed corpus; {skipped:,} malformed rows skipped.")

    def connection(self) -> sqlite3.Connection:
        return sqlite3.connect(f"file:{self.database.resolve()}?mode=ro", uri=True)

    def metadata(self) -> dict[str, object]:
        with self.connection() as connection:
            rows = connection.execute("SELECT COUNT(*) FROM games").fetchone()[0]
            seasons = [item[0] for item in connection.execute("SELECT DISTINCT season FROM games WHERE season != '' ORDER BY season DESC")]
        return {"rows": rows, "seasons": seasons, "source": self.source.name, "stats": STATS}

    def query(self, values: dict[str, list[str]]) -> dict[str, object]:
        stat = values.get("stat", ["PTS"])[0].upper()
        if stat not in STATS:
            stat = "PTS"
        try:
            minimum = max(0, int(values.get("min_value", ["0"])[0]))
            maximum = int(values.get("max_value", ["999"])[0])
        except ValueError:
            minimum, maximum = 0, 999
        if maximum < minimum:
            minimum, maximum = maximum, minimum
        season_type = values.get("game_type", ["all"])[0]
        player = values.get("player", [""])[0].casefold()
        start, end = values.get("start_season", [""])[0], values.get("end_season", [""])[0]
        clauses, parameters = [f"{stat.lower()} BETWEEN ? AND ?"], [minimum, maximum]
        if season_type != "all":
            clauses.append("season_type = ?"); parameters.append(season_type)
        if start:
            clauses.append("season >= ?"); parameters.append(start)
        if end:
            clauses.append("season <= ?"); parameters.append(end)
        if player:
            clauses.append("LOWER(player_name) LIKE ?"); parameters.append(f"%{player}%")
        where = " WHERE " + " AND ".join(clauses)
        with self.connection() as connection:
            total, unique_players = connection.execute(f"SELECT COUNT(*), COUNT(DISTINCT player_id) FROM games{where}", parameters).fetchone()
            leaders = [{"PLAYER_NAME": row[0], "COUNT": row[1]} for row in connection.execute(f"SELECT player_name, COUNT(*) AS count FROM games{where} GROUP BY player_name ORDER BY count DESC, player_name LIMIT 500", parameters)]
            rows = connection.execute(f"SELECT player_name, player_id, game_id, game_date, season, season_type, pts, reb, ast, stl, blk, {stat.lower()} AS selected_value FROM games{where} ORDER BY game_date DESC, player_name LIMIT 500", parameters).fetchall()
        games = [dict(zip(("PLAYER_NAME", "PLAYER_ID", "GAME_ID", "GAME_DATE", "SEASON", "SEASON_TYPE", *STATS, "SELECTED_VALUE"), row)) for row in rows]
        return {"stat": stat, "minimum": minimum, "maximum": maximum, "total": total, "unique_players": unique_players, "top_player": leaders[0] if leaders else None, "player_totals": leaders, "games": games}


def handler_factory(corpus: Corpus, static_directory: Path):
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(static_directory), **kwargs)

        def send_json(self, data: object) -> None:
            payload = json.dumps(data).encode("utf-8")
            self.send_response(200); self.send_header("Content-Type", "application/json; charset=utf-8"); self.send_header("Content-Length", str(len(payload))); self.end_headers(); self.wfile.write(payload)

        def do_GET(self) -> None:
            request = urlparse(self.path)
            if request.path == "/api/meta": self.send_json(corpus.metadata())
            elif request.path == "/api/query": self.send_json(corpus.query(parse_qs(request.query)))
            else: super().do_GET()
    return Handler


def main() -> None:
    root = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=root.parent / "nba_player_game_logs.csv")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    corpus = Corpus(args.data.resolve(), root / ".courtvision" / "corpus.sqlite3")
    print(f"Preparing local stat index from {corpus.source.name} ...", flush=True)
    corpus.ensure_index()
    print(f"Ready: {corpus.metadata()['rows']:,} player-game rows. Open http://127.0.0.1:{args.port}")
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler_factory(corpus, root / "dist"))
    try: server.serve_forever()
    except KeyboardInterrupt: print("\nCourtVision server stopped.")


if __name__ == "__main__": main()
