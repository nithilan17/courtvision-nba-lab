# CourtVision NBA Lab

CourtVision is a browser-local NBA analytics workspace. Its first module,
**Triple-Double Lab**, finds player-games that would qualify as a custom
triple-double when a player's steals and blocks are pooled into the one
traditional category they missed.

## Run locally

CourtVision runs a dependency-free local analytics server. It loads the stored
NBA corpus automatically; there is no CSV upload step. From this repository's
directory:

```powershell
python server.py
```

Open <http://127.0.0.1:8765> in your browser. The first startup loads the
corpus into memory, so allow a moment for the server to report that it is ready.

If you use a project virtual environment stored one level above this directory,
run:

```powershell
& ..\.venv\Scripts\python.exe server.py
```

## Stored corpus

By default, the server reads the sibling file
`../nba_player_game_logs.csv`. It holds the player-game corpus used by every
query. To use another compatible corpus, provide its path:

```powershell
python server.py --data C:\path\to\nba_player_game_logs.csv
```

Required columns:

```text
PLAYER_NAME,PTS,REB,AST,STL,BLK
```

Recommended columns:

```text
PLAYER_ID,GAME_ID,GAME_DATE,SEASON,SEASON_TYPE
```

`SEASON_TYPE` should use `Regular Season` or `Playoffs` to enable the game-type
filter. The included Python downloader in the parent analytics project produces
this schema.

## Triple-double rule

A player-game is returned when:

1. Exactly two of points, rebounds, and assists are at least 10.
2. The remaining traditional category is below 10.
3. That missed category plus steals plus blocks reaches 10.

For example: 20 points, 10 rebounds, 7 assists, 2 steals, and 1 block becomes
20 points, 10 rebounds, and 10 adjusted assists. Existing official
triple-doubles are intentionally excluded.

## Features

- Season, game-type, player-name, and defensive-stat filters
- Query results with adjusted values and missed category
- Summary metrics and player leaderboard signal
- Exportable qualifying-game CSV
- Responsive layout and scaffolded tabs for future NBA analyses

## Privacy and scope

The included demo data is illustrative only. Use a validated NBA player-game
dataset for real results. This is a custom counterfactual metric, not an
official NBA statistic.
