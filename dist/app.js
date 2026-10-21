const required = ["PLAYER_NAME", "PTS", "REB", "AST", "STL", "BLK"];
const state = { rows: [], results: [] };
const $ = (id) => document.getElementById(id);

const demoCsv = `PLAYER_NAME,PLAYER_ID,GAME_ID,GAME_DATE,SEASON,SEASON_TYPE,PTS,REB,AST,STL,BLK
Ada Guard,1,100,2025-01-01,2024-25,Regular Season,20,10,7,2,1
Already Official,2,101,2025-01-02,2024-25,Regular Season,10,10,10,4,3
Only One Core,3,102,2025-01-03,2024-25,Regular Season,10,5,5,6,0
Bea Big,4,103,2025-01-04,2024-25,Playoffs,8,10,10,1,1
Not Enough,5,104,2025-01-05,2024-25,Regular Season,10,10,9,0,0`;

function parseCsv(text) {
  const rows = []; let row = []; let cell = ""; let quote = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]; const next = text[i + 1];
    if (char === '"' && quote && next === '"') { cell += '"'; i += 1; }
    else if (char === '"') quote = !quote;
    else if (char === ',' && !quote) { row.push(cell); cell = ""; }
    else if ((char === '\n' || char === '\r') && !quote) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(cell); if (row.some(value => value.trim())) rows.push(row); row = []; cell = "";
    } else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows.shift().map(header => header.trim().toUpperCase());
  const missing = required.filter(column => !headers.includes(column));
  if (missing.length) throw new Error(`Missing required columns: ${missing.join(", ")}`);
  return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, (values[index] || "").trim()]))).filter(row => row.PLAYER_NAME);
}

function number(row, key) { const value = Number(row[key]); return Number.isFinite(value) ? value : 0; }
function candidate(row) {
  const core = ["PTS", "REB", "AST"]; const reached = core.filter(key => number(row, key) >= 10);
  if (reached.length !== 2) return null;
  const missed = core.find(key => number(row, key) < 10);
  const defense = number(row, "STL") + number(row, "BLK");
  if (number(row, missed) + defense < 10) return null;
  return { ...row, MISSED_STAT: missed, DEFENSIVE_STATS: defense, ADJUSTED_VALUE: number(row, missed) + defense };
}

function formatNumber(value) { return new Intl.NumberFormat().format(value); }
function loadRows(rows, label) {
  state.rows = rows; state.results = [];
  const seasons = [...new Set(rows.map(row => row.SEASON).filter(Boolean))].sort().reverse();
  $("seasonFilter").innerHTML = '<option value="all">All seasons</option>' + seasons.map(season => `<option value="${escapeHtml(season)}">${escapeHtml(season)}</option>`).join("");
  $("datasetStatus").textContent = `${formatNumber(rows.length)} rows · ${label}`;
  runAnalysis(); showToast(`Loaded ${formatNumber(rows.length)} player-game rows`);
}

function runAnalysis() {
  const season = $("seasonFilter").value; const type = $("typeFilter").value;
  const player = $("playerFilter").value.trim().toLowerCase(); const minDefense = Number($("defenseFilter").value) || 0;
  state.results = state.rows.map(candidate).filter(Boolean).filter(row =>
    (season === "all" || row.SEASON === season) &&
    (type === "all" || row.SEASON_TYPE === type) &&
    (!player || row.PLAYER_NAME.toLowerCase().includes(player)) &&
    row.DEFENSIVE_STATS >= minDefense
  );
  state.results.sort((a, b) => String(b.GAME_DATE).localeCompare(String(a.GAME_DATE)) || a.PLAYER_NAME.localeCompare(b.PLAYER_NAME));
  render();
}

function render() {
  const counts = new Map(); state.results.forEach(row => counts.set(row.PLAYER_NAME, (counts.get(row.PLAYER_NAME) || 0) + 1));
  const leader = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  $("qualifyingCount").textContent = formatNumber(state.results.length);
  $("playerCount").textContent = formatNumber(counts.size);
  $("topPlayer").textContent = leader ? leader[0] : "—";
  $("topPlayerDetail").textContent = leader ? `${leader[1]} qualifying game${leader[1] === 1 ? "" : "s"}` : "no matching games";
  const seasons = new Set(state.rows.map(row => row.SEASON).filter(Boolean));
  $("coverage").textContent = state.rows.length ? `${seasons.size} seasons` : "—";
  $("coverageDetail").textContent = state.rows.length ? `${formatNumber(state.rows.length)} imported player-games` : "no rows available";
  $("resultMeta").textContent = state.rows.length ? `${formatNumber(state.results.length)} results from ${formatNumber(state.rows.length)} rows` : "Import a CSV to query your data";
  $("downloadButton").disabled = !state.results.length;
  const body = $("resultsBody");
  if (!state.results.length) {
    body.innerHTML = `<tr class="empty"><td colspan="11"><div class="empty-glyph">${state.rows.length ? "∅" : "⌁"}</div><strong>${state.rows.length ? "No games match this query." : "Your analysis canvas is ready."}</strong><br>${state.rows.length ? "Adjust filters or select a different season." : "Import <code>nba_player_game_logs.csv</code> or explore the demo data."}</td></tr>`;
    return;
  }
  body.innerHTML = state.results.slice(0, 500).map(row => `<tr><td>${escapeHtml(row.PLAYER_NAME)}</td><td>${escapeHtml(row.GAME_DATE || "—")}</td><td>${escapeHtml(row.SEASON || "—")}</td><td><span class="pill">${escapeHtml(row.SEASON_TYPE || "—")}</span></td><td>${number(row,"PTS")}</td><td>${number(row,"REB")}</td><td>${number(row,"AST")}</td><td>${number(row,"STL")}</td><td>${number(row,"BLK")}</td><td>${row.MISSED_STAT}</td><td class="adjusted">${row.ADJUSTED_VALUE}</td></tr>`).join("");
  if (state.results.length > 500) $("resultMeta").textContent += " · showing first 500";
}

function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[char]); }
function csvValue(value) { const string = String(value ?? ""); return /[",\n]/.test(string) ? `"${string.replace(/"/g, '""')}"` : string; }
function exportResults() {
  const columns = ["PLAYER_NAME","PLAYER_ID","GAME_ID","GAME_DATE","SEASON","SEASON_TYPE","PTS","REB","AST","STL","BLK","MISSED_STAT","DEFENSIVE_STATS","ADJUSTED_VALUE"];
  const csv = [columns.join(","), ...state.results.map(row => columns.map(column => csvValue(row[column])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); const link = document.createElement("a");
  link.href = url; link.download = "courtvision-counterfactual-triple-doubles.csv"; link.click(); URL.revokeObjectURL(url);
}
function showToast(message) { const toast = $("toast"); toast.textContent = message; toast.classList.add("show"); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove("show"), 2800); }

$("fileInput").addEventListener("change", async event => {
  const file = event.target.files[0]; if (!file) return;
  try { loadRows(parseCsv(await file.text()), file.name); } catch (error) { showToast(error.message); }
  event.target.value = "";
});
$("runButton").addEventListener("click", runAnalysis); $("downloadButton").addEventListener("click", exportResults);
["seasonFilter","typeFilter","playerFilter","defenseFilter"].forEach(id => $(id).addEventListener(id === "playerFilter" ? "input" : "change", runAnalysis));
document.querySelectorAll(".nav-item").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll(".nav-item").forEach(item => item.classList.remove("active")); button.classList.add("active");
  const lab = button.dataset.view === "lab"; $("labView").hidden = !lab; $("placeholderView").hidden = lab;
  const labels = {dashboard:["Overview","A high-level readout of your loaded NBA data will live here."],players:["Player Explorer","Compare player-level results and drill into game-by-game evidence."],seasons:["Season Trends","Track custom-stat frequency across eras, teams, and game types."],data:["Data Library","Import data sets, review coverage, and manage saved query exports."]};
  $("pageTitle").textContent = lab ? "Triple-Double Lab" : labels[button.dataset.view][0]; if (!lab) { $("placeholderTitle").textContent = labels[button.dataset.view][0]; $("placeholderCopy").textContent = labels[button.dataset.view][1]; }
}));
document.querySelectorAll(".switch-to-lab").forEach(button => button.addEventListener("click", () => document.querySelector('[data-view="lab"]').click()));
window.addEventListener("keydown", event => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); runAnalysis(); showToast("Analysis refreshed"); } });
loadRows(parseCsv(demoCsv), "demo data");
