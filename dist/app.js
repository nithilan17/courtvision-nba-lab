const state = { meta: null, games: [], playerTotals: [], view: "games", stat: "PTS" };
const $ = id => document.getElementById(id);
const number = value => new Intl.NumberFormat().format(value);
const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[char]);

function updateTimeline() {
  let start = Number($("startSeasonRange").value), end = Number($("endSeasonRange").value);
  if (start > end) { [start, end] = [end, start]; $("startSeasonRange").value = start; $("endSeasonRange").value = end; }
  $("startSeasonLabel").textContent = state.meta?.seasons[start] || "—";
  $("endSeasonLabel").textContent = state.meta?.seasons[end] || "—";
}

async function initialize() {
  try {
    const response = await fetch("/api/meta"); if (!response.ok) throw new Error();
    state.meta = await response.json(); state.meta.seasons.sort();
    [$("startSeasonRange"), $("endSeasonRange")].forEach(range => { range.min = 0; range.max = state.meta.seasons.length - 1; });
    $("startSeasonRange").value = 0; $("endSeasonRange").value = state.meta.seasons.length - 1; updateTimeline();
    $("datasetStatus").textContent = `${number(state.meta.rows)} rows · ${state.meta.source}`;
    $("coverage").textContent = `${state.meta.seasons.length} seasons`; $("coverageDetail").textContent = `${number(state.meta.rows)} stored player-games`;
    await runQuery();
  } catch { $("datasetStatus").textContent = "Corpus unavailable"; empty("CourtVision needs its local server.", "Run: python server.py"); }
}

async function runQuery() {
  if (!state.meta) return;
  const params = new URLSearchParams({ stat: $("statFilter").value, min_value: $("minFilter").value || "0", max_value: $("maxFilter").value || "999", game_type: $("typeFilter").value, player: $("playerFilter").value.trim(), start_season: state.meta.seasons[Number($("startSeasonRange").value)], end_season: state.meta.seasons[Number($("endSeasonRange").value)] });
  $("runButton").disabled = true; $("runButton").textContent = "Querying...";
  try {
    const response = await fetch(`/api/query?${params}`); if (!response.ok) throw new Error();
    const data = await response.json(); state.games = data.games; state.playerTotals = data.player_totals; state.stat = data.stat;
    $("gameCount").textContent = number(data.total); $("playerCount").textContent = number(data.unique_players);
    $("topPlayer").textContent = data.top_player?.PLAYER_NAME ?? "—"; $("topPlayerDetail").textContent = data.top_player ? `${data.top_player.COUNT} matching game${data.top_player.COUNT === 1 ? "" : "s"}` : "no matching players";
    $("resultMeta").textContent = `${number(data.total)} matching games · ${data.minimum}–${data.maximum} ${data.stat}`; $("downloadButton").disabled = !data.total; render();
  } catch { empty("The query could not be completed.", "Check that server.py is still running."); }
  finally { $("runButton").disabled = false; $("runButton").innerHTML = 'Run query <span>→</span>'; }
}

function empty(title, detail) { $("resultsBody").innerHTML = `<tr class="empty"><td colspan="12"><div class="empty-glyph">⌁</div><strong>${escapeHtml(title)}</strong><br>${escapeHtml(detail)}</td></tr>`; }
function render() {
  const players = state.view === "players", rows = players ? state.playerTotals : state.games;
  $("resultsTitle").textContent = players ? `Player counts: ${state.stat}` : `Matching player-games: ${state.stat}`;
  if (!rows.length) { empty("No games match this query.", "Adjust the stat range, timeline, or filters."); return; }
  if (players) {
    $("tableHead").innerHTML = "<tr><th>Rank</th><th>Player</th><th>Matching games</th></tr>";
    $("resultsBody").innerHTML = rows.map((row, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(row.PLAYER_NAME)}</td><td class="adjusted">${row.COUNT}</td></tr>`).join("");
  } else {
    $("tableHead").innerHTML = `<tr><th>Player</th><th>Date</th><th>Season</th><th>Type</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>${state.stat}</th></tr>`;
    $("resultsBody").innerHTML = rows.map(row => `<tr><td>${escapeHtml(row.PLAYER_NAME)}</td><td>${escapeHtml(row.GAME_DATE)}</td><td>${escapeHtml(row.SEASON)}</td><td><span class="pill">${escapeHtml(row.SEASON_TYPE)}</span></td><td>${row.PTS}</td><td>${row.REB}</td><td>${row.AST}</td><td>${row.STL}</td><td>${row.BLK}</td><td class="adjusted">${row.SELECTED_VALUE}</td></tr>`).join("");
  }
  if (rows.length === 500) $("resultMeta").textContent += " · showing first 500";
}

function exportResults() {
  const players = state.view === "players", rows = players ? state.playerTotals : state.games;
  const columns = players ? ["PLAYER_NAME", "COUNT"] : ["PLAYER_NAME","PLAYER_ID","GAME_ID","GAME_DATE","SEASON","SEASON_TYPE","PTS","REB","AST","STL","BLK","SELECTED_VALUE"];
  const quote = value => /[",\n]/.test(String(value ?? "")) ? `"${String(value).replace(/"/g, '""')}"` : String(value ?? "");
  const url = URL.createObjectURL(new Blob([[columns.join(","), ...rows.map(row => columns.map(column => quote(row[column])).join(","))].join("\n")], {type:"text/csv"}));
  const link = document.createElement("a"); link.href = url; link.download = `courtvision-${state.stat.toLowerCase()}-${players ? "player-counts" : "games"}.csv`; link.click(); URL.revokeObjectURL(url);
}

$("runButton").addEventListener("click", runQuery); $("downloadButton").addEventListener("click", exportResults);
["statFilter", "minFilter", "maxFilter", "typeFilter", "playerFilter"].forEach(id => $(id).addEventListener(id === "playerFilter" ? "input" : "change", runQuery));
[$("startSeasonRange"), $("endSeasonRange")].forEach(range => range.addEventListener("input", () => { updateTimeline(); runQuery(); }));
document.querySelectorAll("[data-result-view]").forEach(button => button.addEventListener("click", () => { state.view = button.dataset.resultView; document.querySelectorAll("[data-result-view]").forEach(item => item.classList.toggle("active", item === button)); render(); }));
initialize();
