const state = { results: [], meta: null };
const $ = (id) => document.getElementById(id);
const formatNumber = (value) => new Intl.NumberFormat().format(value);

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[char]);
}

function setEmpty(message, detail) {
  $("resultsBody").innerHTML = `<tr class="empty"><td colspan="11"><div class="empty-glyph">⌁</div><strong>${escapeHtml(message)}</strong><br>${escapeHtml(detail)}</td></tr>`;
}

async function loadCorpus() {
  try {
    const response = await fetch("/api/meta");
    if (!response.ok) throw new Error("The local analytics server is unavailable.");
    state.meta = await response.json();
    $("seasonFilter").innerHTML = '<option value="all">All seasons</option>' + state.meta.seasons.map(season => `<option value="${escapeHtml(season)}">${escapeHtml(season)}</option>`).join("");
    $("datasetStatus").textContent = `${formatNumber(state.meta.rows)} rows · ${state.meta.source}`;
    $("coverage").textContent = `${state.meta.seasons.length} seasons`;
    $("coverageDetail").textContent = `${formatNumber(state.meta.rows)} player-games in corpus`;
    await runAnalysis();
  } catch (error) {
    $("datasetStatus").textContent = "Corpus unavailable";
    $("resultMeta").textContent = "Start the local server to query the corpus";
    setEmpty("CourtVision needs its local server.", "Run: python server.py");
  }
}

async function runAnalysis() {
  if (!state.meta) return;
  const params = new URLSearchParams({
    season: $("seasonFilter").value,
    game_type: $("typeFilter").value,
    player: $("playerFilter").value.trim(),
    min_defense: $("defenseFilter").value || "0",
  });
  $("runButton").disabled = true;
  $("runButton").textContent = "Querying...";
  try {
    const response = await fetch(`/api/query?${params}`);
    if (!response.ok) throw new Error("Query failed.");
    const data = await response.json();
    state.results = data.games;
    $("qualifyingCount").textContent = formatNumber(data.total);
    $("playerCount").textContent = formatNumber(data.unique_players);
    $("topPlayer").textContent = data.top_player?.name ?? "—";
    $("topPlayerDetail").textContent = data.top_player ? `${data.top_player.count} qualifying game${data.top_player.count === 1 ? "" : "s"}` : "no matching games";
    $("resultMeta").textContent = `${formatNumber(data.total)} results from stored corpus`;
    $("downloadButton").disabled = !data.total;
    renderRows();
  } catch (error) {
    setEmpty("The query could not be completed.", "Check that server.py is still running.");
  } finally {
    $("runButton").disabled = false;
    $("runButton").innerHTML = 'Run analysis <span>→</span>';
  }
}

function renderRows() {
  if (!state.results.length) {
    setEmpty("No games match this query.", "Adjust the filters and run the analysis again.");
    return;
  }
  $("resultsBody").innerHTML = state.results.slice(0, 500).map(row => `<tr><td>${escapeHtml(row.PLAYER_NAME)}</td><td>${escapeHtml(row.GAME_DATE || "—")}</td><td>${escapeHtml(row.SEASON || "—")}</td><td><span class="pill">${escapeHtml(row.SEASON_TYPE || "—")}</span></td><td>${row.PTS}</td><td>${row.REB}</td><td>${row.AST}</td><td>${row.STL}</td><td>${row.BLK}</td><td>${row.MISSED_STAT}</td><td class="adjusted">${row.ADJUSTED_VALUE}</td></tr>`).join("");
  if (state.results.length > 500) $("resultMeta").textContent += " · showing first 500";
}

function exportResults() {
  const columns = ["PLAYER_NAME","PLAYER_ID","GAME_ID","GAME_DATE","SEASON","SEASON_TYPE","PTS","REB","AST","STL","BLK","MISSED_STAT","DEFENSIVE_STATS","ADJUSTED_VALUE"];
  const escapeCsv = value => /[",\n]/.test(String(value ?? "")) ? `"${String(value).replace(/"/g, '""')}"` : String(value ?? "");
  const csv = [columns.join(","), ...state.results.map(row => columns.map(column => escapeCsv(row[column])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], {type: "text/csv"}));
  const link = document.createElement("a"); link.href = url; link.download = "courtvision-counterfactual-triple-doubles.csv"; link.click(); URL.revokeObjectURL(url);
}

$("runButton").addEventListener("click", runAnalysis);
$("downloadButton").addEventListener("click", exportResults);
["seasonFilter", "typeFilter", "playerFilter", "defenseFilter"].forEach(id => $(id).addEventListener(id === "playerFilter" ? "input" : "change", runAnalysis));
document.querySelectorAll(".nav-item").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll(".nav-item").forEach(item => item.classList.remove("active")); button.classList.add("active");
  const lab = button.dataset.view === "lab"; $("labView").hidden = !lab; $("placeholderView").hidden = lab;
  const labels = {dashboard:["Overview","A high-level readout of the stored NBA corpus will live here."],players:["Player Explorer","Compare player-level results and drill into game-by-game evidence."],seasons:["Season Trends","Track custom-stat frequency across eras, teams, and game types."],data:["Data Library","Review corpus coverage and manage saved query exports."]};
  $("pageTitle").textContent = lab ? "Triple-Double Lab" : labels[button.dataset.view][0];
  if (!lab) { $("placeholderTitle").textContent = labels[button.dataset.view][0]; $("placeholderCopy").textContent = labels[button.dataset.view][1]; }
}));
document.querySelectorAll(".switch-to-lab").forEach(button => button.addEventListener("click", () => document.querySelector('[data-view="lab"]').click()));
loadCorpus();
