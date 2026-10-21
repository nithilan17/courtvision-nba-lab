# CourtVision NBA Stat Tracker

CourtVision is a local NBA player-game stat tracker. Query how many games and
how many distinct players fall inside a selected minimum/maximum stat range,
then inspect the games or aggregate them by player.

## Run

The app reads the stored sibling corpus automatically; no browser upload is
needed.

```powershell
cd C:\Users\nithi\Projects\sports-sandbox\courtvision-nba-lab
& ..\.venv\Scripts\python.exe server.py
```

Open <http://127.0.0.1:8765>. The first run creates a local SQLite index under
`.courtvision/`; later launches reuse it for fast queries.

## Query features

- Choose points, rebounds, assists, steals, or blocks.
- Set inclusive minimum and maximum values.
- Restrict to regular season, playoffs, a player name, or a season range.
- View matching game logs or aggregate matching games by player.
- Export the active view to CSV.

## Corpus

By default the server uses `../nba_player_game_logs.csv`. It must contain:

```text
PLAYER_NAME,PLAYER_ID,GAME_ID,GAME_DATE,SEASON,SEASON_TYPE,PTS,REB,AST,STL,BLK
```

To use another compatible corpus:

```powershell
& ..\.venv\Scripts\python.exe server.py --data C:\path\to\nba_player_game_logs.csv
```
