/**
 * @fileoverview Real-time HTML dashboard generator for the Antigravity Token &
 * Cost Tracker. Builds the DashboardPayload (single source of truth), renders a
 * single-file offline-capable dashboard.html (inline CSS/JS + SVG chart +
 * script-tag polling + SSE auto-upgrade), and writes all artifacts atomically.
 * Zero dependencies (Node core: fs, path only).
 *
 * Transport constraints honored here:
 * - C3: file:// pages cannot use fetch()/XHR (CORS) -> classic <script src>
 *   injection polling is the sanctioned refresh transport.
 * - C5: all writes are atomic (tmp + rename, mirroring cache-manager saveCache),
 *   with a 100ms retry and direct-write fallback for Windows EPERM/EBUSY (E2).
 */

const fs = require('fs');
const path = require('path');
const {
  DASHBOARD_DIR,
  DASHBOARD_HTML_FILE,
  DASHBOARD_DATA_JS,
  DASHBOARD_DATA_JSON,
  DASHBOARD_DEFAULT_PORT,
  DASHBOARD_WRITE_THROTTLE_MS,
  CURRENCIES,
  calculateCostUsd,
  calculateCacheSavingsUsd
} = require('./config');
const { formatLocalDate, summarizeTurns } = require('./aggregator');
const { t } = require('./i18n');

const DASHBOARD_PAYLOAD_VERSION = 2;
const DASHBOARD_DEFAULT_REFRESH_SEC = 5;

/**
 * Module-level write throttle state (content-hash skip + minimum interval).
 * Reset via resetDashboardWriteState() (used by tests).
 */
let lastWriteAt = 0;
let lastDataHash = null;

/**
 * Rounds a number to 6 decimal places to keep the payload compact.
 * @param {number} n
 * @returns {number}
 */
function round6(n) {
  return Math.round(Number(n) * 1e6) / 1e6;
}

/**
 * Normalizes one aggregator daily row into the DailyRow schema (report §1.4).
 * @param {object} row - Aggregator day summary.
 * @returns {object} DailyRow.
 */
function toDailyRow(row) {
  return {
    date: row.date,
    sessions: row.sessions || 0,
    turns: row.totalTurns || 0,
    inputTokens: row.inputTokens || 0,
    cachedTokens: row.cachedTokens || 0,
    outputTokens: row.outputTokens || 0,
    totalTokens: row.totalTokens || 0,
    cacheHitRate: round6(row.cacheHitRate || 0),
    costUsd: round6(row.costUsd || 0),
    cacheSavingsUsd: round6(row.cacheSavingsUsd || 0)
  };
}

/**
 * Builds the DashboardPayload from a pre-synced sessions array.
 * Reuses the SAME syncSessions() result as the badge (C4 — no second sync).
 *
 * Performance: buckets every turn into per-date maps in ONE pass over the
 * sessions array (single Date parse per turn), then derives today/yesterday/
 * 7d/30d summaries from the buckets — equivalent to four aggregator passes
 * at a quarter of the Date-parsing cost (statusline <20ms script-work budget).
 * @param {Array<object>} sessions - Parsed session objects.
 * @param {object} [opts]
 * @param {string} [opts.currency='usd'] - Currency code.
 * @param {string} [opts.lang] - UI language code.
 * @param {boolean} [opts.isFree=false] - Free quota mode.
 * @param {string} [opts.model] - Active model display id.
 * @param {string} [opts.modelName] - Model name used for pricing lookups.
 * @param {Date} [opts.refDate] - Reference date (defaults to now).
 * @param {number} [opts.parsedCount=0] - Cache stats: freshly parsed sessions.
 * @param {number} [opts.cachedCount=0] - Cache stats: reused cached sessions.
 * @param {number} [opts.elapsedMs=0] - Cache stats: sync duration.
 * @returns {object} DashboardPayload per report §1.4.
 */
function buildDashboardPayload(sessions, opts = {}) {
  const refDate = opts.refDate || new Date();
  const modelName = opts.modelName || null;
  const list = Array.isArray(sessions) ? sessions : [];

  // Date keys for the 30-day window (oldest -> newest)
  const dateKeys = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(refDate);
    d.setDate(d.getDate() - i);
    dateKeys.push(formatLocalDate(d));
  }
  const todayKey = dateKeys[29];
  const yesterdayKey = dateKeys[28];
  const last7Keys = new Set(dateKeys.slice(23));

  // One pass: bucket turns per date + track session membership
  const turnsByDate = new Map();
  const sessionIdsByDate = new Map();
  for (const key of dateKeys) {
    turnsByDate.set(key, []);
    sessionIdsByDate.set(key, new Set());
  }

  // Per-model accumulators (W4/REQ-107): each session is costed with its OWN
  // modelName (session.modelName), never the global active model.
  const modelsMap = new Map();

  for (const session of list) {
    if (!session || !Array.isArray(session.turns)) continue;
    const sessionModel = session.modelName || modelName || 'unknown';
    let modelRow = modelsMap.get(sessionModel);
    if (!modelRow) {
      modelRow = {
        model: sessionModel,
        displayName: sessionModel,
        totalTokens: 0,
        inputTokens: 0,
        cachedTokens: 0,
        outputTokens: 0,
        cacheHitRate: 0,
        costUsd: 0,
        cacheSavingsUsd: 0,
        sessions: 0,
        turns: 0
      };
      modelsMap.set(sessionModel, modelRow);
    }
    modelRow.sessions += 1;
    modelRow.turns += session.turns.length;

    for (const turn of session.turns) {
      const key = formatLocalDate(new Date(turn.createdAt));
      if (turnsByDate.has(key)) {
        turnsByDate.get(key).push(turn);
        sessionIdsByDate.get(key).add(session.sessionId);
      }
      modelRow.inputTokens += turn.inputTokens || 0;
      modelRow.cachedTokens += turn.cachedTokens || 0;
      modelRow.outputTokens += turn.outputTokens || 0;
    }

    // Cost with the session's own model (per-session/per-turn accuracy).
    modelRow.costUsd += calculateCostUsd(
      session.inputTokens || 0,
      session.cachedTokens || 0,
      session.outputTokens || 0,
      sessionModel
    );
    modelRow.cacheSavingsUsd += calculateCacheSavingsUsd(session.cachedTokens || 0, sessionModel);
  }

  // Finalize per-model rows: totals + cache hit rate, sorted by cost desc.
  const models = Array.from(modelsMap.values())
    .map(row => {
      row.totalTokens = row.inputTokens + row.cachedTokens + row.outputTokens;
      row.cacheHitRate = row.inputTokens + row.cachedTokens > 0
        ? (row.cachedTokens / (row.inputTokens + row.cachedTokens)) * 100
        : 0;
      row.costUsd = round6(row.costUsd);
      row.cacheSavingsUsd = round6(row.cacheSavingsUsd);
      return row;
    })
    .sort((a, b) => b.costUsd - a.costUsd || b.totalTokens - a.totalTokens);

  // Per-day summaries (DailyRow schema)
  const daily = dateKeys.map(key => {
    const row = summarizeTurns(turnsByDate.get(key), modelName);
    row.date = key;
    row.sessions = sessionIdsByDate.get(key).size;
    return toDailyRow(row);
  });

  // Period summaries derived from the same buckets
  const todaySummary = summarizeTurns(turnsByDate.get(todayKey), modelName);
  todaySummary.totalSessions = sessionIdsByDate.get(todayKey).size;
  todaySummary.period = 'today';
  todaySummary.dateStr = todayKey;

  const yesterdaySummary = summarizeTurns(turnsByDate.get(yesterdayKey), modelName);
  yesterdaySummary.totalSessions = sessionIdsByDate.get(yesterdayKey).size;
  yesterdaySummary.period = 'yesterday';
  yesterdaySummary.dateStr = yesterdayKey;

  const summarizeRange = (keys, period) => {
    const allTurns = [];
    const allSessionIds = new Set();
    for (const key of keys) {
      for (const turn of turnsByDate.get(key)) allTurns.push(turn);
      for (const id of sessionIdsByDate.get(key)) allSessionIds.add(id);
    }
    const summary = summarizeTurns(allTurns, modelName);
    summary.totalSessions = allSessionIds.size;
    summary.period = period;
    summary.dateRange = `${keys[0]}..${keys[keys.length - 1]}`;
    return summary;
  };

  const last7dSummary = summarizeRange(dateKeys.slice(23), '7d');
  const last30dSummary = summarizeRange(dateKeys, '30d');

  return {
    version: DASHBOARD_PAYLOAD_VERSION,
    generatedAt: new Date().toISOString(),
    currency: opts.currency || 'usd',
    lang: opts.lang || 'en',
    isFree: Boolean(opts.isFree),
    model: opts.model || '',
    models,
    summaries: {
      today: todaySummary,
      yesterday: yesterdaySummary,
      last7d: last7dSummary,
      last30d: last30dSummary
    },
    daily,
    cacheStats: {
      totalSessions: list.length,
      parsedCount: opts.parsedCount || 0,
      cachedCount: opts.cachedCount || 0,
      elapsedMs: opts.elapsedMs || 0
    }
  };
}

/**
 * JSON.stringify with `</script>`-safe escaping for inline script embedding.
 * @param {*} value
 * @returns {string}
 */
function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Builds the i18n dictionary embedded into the dashboard HTML.
 * @returns {object}
 */
function dashboardI18n() {
  return {
    dashboardTitle: t('dashboardTitle'),
    summaryToday: t('summaryToday'),
    summaryYesterday: t('summaryYesterday'),
    summary7d: t('summary7d'),
    summary30d: t('summary30d'),
    chartTitle: t('chartTitle'),
    tableTitle: t('tableTitle'),
    modelsTitle: t('modelsTitle'),
    modelColumn: t('modelColumn'),
    lastUpdated: t('lastUpdated'),
    liveStatus: t('liveStatus'),
    noDataFound: t('noDataFound'),
    freeCostLabel: t('freeCostLabel'),
    colDate: t('colDate'),
    colSessions: t('colSessions'),
    colTurns: t('colTurns'),
    colInput: t('colInput'),
    colCached: t('colCached'),
    colOutput: t('colOutput'),
    colTotal: t('colTotal'),
    colCacheHit: t('colCacheHit'),
    colCost: t('colCost'),
    colSavings: t('colSavings')
  };
}

/**
 * Builds the currency formatting descriptor embedded into the dashboard HTML.
 * @param {string} currencyCode
 * @param {boolean} isFree
 * @returns {object}
 */
function dashboardCurrencyFmt(currencyCode, isFree) {
  const cur = CURRENCIES[currencyCode] || CURRENCIES.usd;
  return {
    symbol: cur.symbol,
    rate: cur.rate,
    decimals: cur.displayDecimals,
    position: cur.position,
    isFree: Boolean(isFree)
  };
}

/**
 * Renders the single-file dashboard HTML (inline CSS/JS, no CDN).
 * Refresh strategy (report §2.1 hybrid):
 * - Default: <script src="dashboard-data.js?v=ts"> injection polling (works on
 *   file:// where fetch/XHR are CORS-blocked — C3).
 * - Auto-upgrade: EventSource SSE push when the optional --serve server is up;
 *   falls back to polling automatically on error.
 * @param {object} payload - DashboardPayload.
 * @param {object} [opts]
 * @param {number} [opts.refreshSec=5] - Polling interval in seconds.
 * @param {number} [opts.servePort=8787] - Port for the SSE upgrade URL.
 * @returns {string} Complete HTML document.
 */
function renderDashboardHtml(payload, opts = {}) {
  const refreshSec = Number(opts.refreshSec) > 0 ? Number(opts.refreshSec) : DASHBOARD_DEFAULT_REFRESH_SEC;
  const servePort = Number(opts.servePort) > 0 ? Number(opts.servePort) : DASHBOARD_DEFAULT_PORT;
  const sseUrl = `http://127.0.0.1:${servePort}/events`;
  const i18nJson = jsonForScript(dashboardI18n());
  const fmtJson = jsonForScript(dashboardCurrencyFmt(payload.currency, payload.isFree));
  const payloadJson = jsonForScript(payload);
  const lang = String(payload.lang || 'en');

  const clientScript = [
    "(function () {",
    "  'use strict';",
    `  var I18N = ${i18nJson};`,
    `  var FMT = ${fmtJson};`,
    `  var REFRESH_MS = ${Math.round(refreshSec * 1000)};`,
    `  var SSE_URL = '${sseUrl}';`,
    "",
    "  function esc(s) {",
    "    return String(s == null ? '' : s).replace(/[&<>\"']/g, function (c) {",
    "      var AMP = '&' + 'amp;', LT = '&' + 'lt;', GT = '&' + 'gt;',",
    "        QUOT = '&' + 'quot;', APOS = '&' + '#39;';",
    "      return { '&': AMP, '<': LT, '>': GT, '\"': QUOT, \"'\": APOS }[c];",
    "    });",
    "  }",
    "  function fmtCompact(n) {",
    "    n = Number(n) || 0;",
    "    var neg = n < 0; n = Math.abs(n);",
    "    var s;",
    "    if (n >= 1e9) s = (n / 1e9).toFixed(2) + 'B';",
    "    else if (n >= 1e6) s = (n / 1e6).toFixed(2) + 'M';",
    "    else if (n >= 1e3) s = (n / 1e3).toFixed(1) + 'K';",
    "    else s = String(Math.round(n));",
    "    return neg ? '-' + s : s;",
    "  }",
    "  function fmtCost(usd) {",
    "    if (FMT.isFree) return I18N.freeCostLabel;",
    "    var v = (Number(usd) || 0) * FMT.rate;",
    "    var num = v.toFixed(FMT.decimals);",
    "    return FMT.position === 'after' ? num + FMT.symbol : FMT.symbol + num;",
    "  }",
    "  function fmtPct(n) { return (Number(n) || 0).toFixed(1) + '%'; }",
    "",
    "  function cardHtml(label, s) {",
    "    s = s || {};",
    "    return '<div class=\"card\">' +",
    "      '<div class=\"card-label\">' + esc(label) + '</div>' +",
    "      '<div class=\"card-tokens\">' + esc(fmtCompact(s.totalTokens)) + '</div>' +",
    "      '<div class=\"card-cost\">' + esc(fmtCost(s.costUsd)) + '</div>' +",
    "      '<div class=\"card-sub\">' + esc(I18N.colSessions) + ' ' + (s.totalSessions || 0) + ' \\u00b7 ' +",
    "        esc(I18N.colTurns) + ' ' + (s.totalTurns || 0) + ' \\u00b7 ' +",
    "        esc(I18N.colCacheHit) + ' ' + fmtPct(s.cacheHitRate) + '</div>' +",
    "      '</div>';",
    "  }",
    "",
    "  function renderSvg(daily) {",
    "    var W = 760, H = 200, PAD_L = 8, PAD_B = 22, PAD_T = 8;",
    "    var n = daily.length || 1;",
    "    var max = 0, i;",
    "    for (i = 0; i < daily.length; i++) { if (daily[i].totalTokens > max) max = daily[i].totalTokens; }",
    "    if (max <= 0) max = 1;",
    "    var bw = (W - PAD_L * 2) / n;",
    "    var bars = '';",
    "    for (i = 0; i < daily.length; i++) {",
    "      var d = daily[i];",
    "      var h = Math.max(d.totalTokens > 0 ? 3 : 1, Math.round((d.totalTokens / max) * (H - PAD_B - PAD_T)));",
    "      var x = PAD_L + i * bw;",
    "      var y = H - PAD_B - h;",
    "      bars += '<rect x=\"' + x.toFixed(1) + '\" y=\"' + y + '\" width=\"' + Math.max(1, bw - 2).toFixed(1) +",
    "        '\" height=\"' + h + '\" rx=\"2\" class=\"bar' + (i === daily.length - 1 ? ' bar-today' : '') + '\">' +",
    "        '<title>' + esc(d.date + ' \\u00b7 ' + fmtCompact(d.totalTokens) + ' \\u00b7 ' + fmtCost(d.costUsd)) + '</title></rect>';",
    "      if (i % 5 === 0 || i === daily.length - 1) {",
    "        bars += '<text x=\"' + (x + bw / 2).toFixed(1) + '\" y=\"' + (H - 6) + '\" class=\"axis\">' + esc(d.date.slice(5)) + '</text>';",
    "      }",
    "    }",
    "    return '<svg viewBox=\"0 0 ' + W + ' ' + H + '\" preserveAspectRatio=\"none\" role=\"img\">' + bars + '</svg>';",
    "  }",
    "",
    "  function renderTable(daily) {",
    "    var cols = [I18N.colDate, I18N.colSessions, I18N.colTurns, I18N.colInput, I18N.colCached,",
    "      I18N.colOutput, I18N.colTotal, I18N.colCacheHit, I18N.colCost, I18N.colSavings];",
    "    var head = '<tr><th>' + cols.map(esc).join('</th><th>') + '</th></tr>';",
    "    var rows = '';",
    "    for (var i = daily.length - 1; i >= 0; i--) {",
    "      var d = daily[i];",
    "      rows += '<tr><td>' + esc(d.date) + '</td><td>' + d.sessions + '</td><td>' + d.turns + '</td><td>' +",
    "        fmtCompact(d.inputTokens) + '</td><td>' + fmtCompact(d.cachedTokens) + '</td><td>' +",
    "        fmtCompact(d.outputTokens) + '</td><td class=\"strong\">' + fmtCompact(d.totalTokens) + '</td><td>' +",
    "        fmtPct(d.cacheHitRate) + '</td><td>' + fmtCost(d.costUsd) + '</td><td>' + fmtCost(d.cacheSavingsUsd) + '</td></tr>';",
    "    }",
    "    return '<table>' + head + rows + '</table>';",
    "  }",
    "",
    "  function renderModels(models) {",
    "    var wrap = document.getElementById('modelsWrap');",
    "    if (!wrap) return;",
    "    if (!models || models.length === 0) {",
    "      wrap.innerHTML = '<div class=\"models-empty\">' + esc(I18N.noDataFound) + '</div>';",
    "      return;",
    "    }",
    "    var maxTok = 0, i;",
    "    for (i = 0; i < models.length; i++) { if (models[i].totalTokens > maxTok) maxTok = models[i].totalTokens; }",
    "    if (maxTok <= 0) maxTok = 1;",
    "    var html = '<table><tr><th>' + esc(I18N.modelColumn) + '</th><th>' + esc(I18N.colSessions) + '</th><th>' +",
    "      esc(I18N.colTurns) + '</th><th>' + esc(I18N.colInput) + '</th><th>' + esc(I18N.colCached) + '</th><th>' +",
    "      esc(I18N.colOutput) + '</th><th>' + esc(I18N.colTotal) + '</th><th>' + esc(I18N.colCacheHit) + '</th><th>' +",
    "      esc(I18N.colCost) + '</th><th>' + esc(I18N.colSavings) + '</th><th>' + esc(I18N.colTotal) + '</th></tr>';",
    "    for (i = 0; i < models.length; i++) {",
    "      var m = models[i];",
    "      var pct = Math.max(m.totalTokens > 0 ? 2 : 0, Math.round((m.totalTokens / maxTok) * 100));",
    "      html += '<tr><td class=\"strong\">' + esc(m.displayName || m.model) + '</td><td>' + m.sessions + '</td><td>' + m.turns + '</td><td>' +",
    "        fmtCompact(m.inputTokens) + '</td><td>' + fmtCompact(m.cachedTokens) + '</td><td>' + fmtCompact(m.outputTokens) + '</td><td>' +",
    "        fmtCompact(m.totalTokens) + '</td><td>' + fmtPct(m.cacheHitRate) + '</td><td>' + fmtCost(m.costUsd) + '</td><td>' +",
    "        fmtCost(m.cacheSavingsUsd) + '</td><td><div class=\"share\"><div class=\"share-bar\" style=\"width:' + pct + '%\"></div></div></td></tr>';",
    "    }",
    "    wrap.innerHTML = html + '</table>';",
    "  }",
    "",
    "  function render(p) {",
    "    if (!p) return;",
    "    var s = p.summaries || {};",
    "    var cards = cardHtml(I18N.summaryToday, s.today) + cardHtml(I18N.summaryYesterday, s.yesterday) +",
    "      cardHtml(I18N.summary7d, s.last7d) + cardHtml(I18N.summary30d, s.last30d);",
    "    document.getElementById('cards').innerHTML = cards;",
    "    var daily = p.daily || [];",
    "    document.getElementById('chart').innerHTML = renderSvg(daily);",
    "    document.getElementById('tableWrap').innerHTML = renderTable(daily);",
    "    renderModels(p.models);",
    "    var empty = (!s.last30d || s.last30d.totalTokens === 0) && (!s.today || s.today.totalTokens === 0);",
    "    document.getElementById('empty').style.display = empty ? 'block' : 'none';",
    "    var lu = document.getElementById('lastUpdated');",
    "    if (lu) lu.textContent = I18N.lastUpdated.replace('{time}', new Date(p.generatedAt).toLocaleString());",
    "    var model = document.getElementById('model');",
    "    if (model) model.textContent = p.model || '';",
    "  }",
    "",
    "  function setLive(on) {",
    "    var el = document.getElementById('live');",
    "    if (el) { el.textContent = on ? '\\u25cf ' + I18N.liveStatus : '\\u25cb'; el.className = on ? 'live on' : 'live'; }",
    "  }",
    "",
    "  var pollTimer = null;",
    "  function pollOnce() {",
    "    var sc = document.createElement('script');",
    "    sc.src = 'dashboard-data.js?v=' + Date.now();",
    "    sc.onload = function () { render(window.__AGY_DASH__); if (sc.parentNode) sc.parentNode.removeChild(sc); };",
    "    sc.onerror = function () { if (sc.parentNode) sc.parentNode.removeChild(sc); };",
    "    document.head.appendChild(sc);",
    "  }",
    "  function startPolling() { if (!pollTimer) pollTimer = setInterval(pollOnce, REFRESH_MS); }",
    "  function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }",
    "",
    "  var sseActive = false;",
    "  function trySse() {",
    "    try {",
    "      var es = new EventSource(SSE_URL);",
    "      es.onopen = function () { sseActive = true; stopPolling(); setLive(true); };",
    "      es.onmessage = function (ev) {",
    "        try {",
    "          var p = JSON.parse(ev.data);",
    "          window.__AGY_DASH__ = p;",
    "          render(p);",
    "          setLive(true);",
    "        } catch (e) {}",
    "      };",
    "      es.onerror = function () { sseActive = false; startPolling(); setLive(false); };",
    "    } catch (e) { startPolling(); }",
    "  }",
    "",
    "  render(window.__AGY_DASH__);",
    "  setLive(false);",
    "  startPolling();",
    "  trySse();",
    "})();"
  ].join('\n');

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${t('dashboardTitle')}</title>
<style>
:root{--bg:#0d1117;--panel:#161b22;--border:#30363d;--text:#e6edf3;--dim:#8b949e;--accent:#58a6ff;--green:#3fb950}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:'Segoe UI',system-ui,-apple-system,sans-serif;padding:24px;max-width:1080px;margin:0 auto}
header{display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px;margin-bottom:20px}
h1{font-size:20px}
.meta{color:var(--dim);font-size:12px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.live{font-weight:600}
.live.on{color:var(--green)}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:20px}
.card{background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:14px 16px}
.card-label{color:var(--dim);font-size:12px;text-transform:uppercase;letter-spacing:.05em}
.card-tokens{font-size:26px;font-weight:700;margin:4px 0 2px}
.card-cost{color:var(--green);font-size:14px}
.card-sub{color:var(--dim);font-size:11px;margin-top:6px}
.panel{background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:20px}
.panel h2{font-size:14px;color:var(--dim);margin-bottom:12px;font-weight:600}
svg{width:100%;height:auto;display:block}
.bar{fill:var(--accent);opacity:.85}
.bar-today{fill:var(--green)}
.axis{fill:var(--dim);font-size:10px;text-anchor:middle}
table{width:100%;border-collapse:collapse;font-size:12px}
th,td{padding:6px 8px;text-align:right;border-bottom:1px solid var(--border);white-space:nowrap}
th:first-child,td:first-child{text-align:left}
th{color:var(--dim);font-weight:600}
td.strong{font-weight:600}
#empty{display:none;color:var(--dim);padding:24px;text-align:center}
.models-empty{color:var(--dim);padding:12px 0;text-align:center;font-size:12px}
.share{background:var(--panel);border:1px solid var(--border);border-radius:4px;height:12px;min-width:80px;overflow:hidden}
.share-bar{background:var(--accent);height:100%;border-radius:3px}
.share-bar:last-child{background:var(--green)}
</style>
</head>
<body>
<header>
  <h1>\u{1F4CA} ${t('dashboardTitle')}</h1>
  <div class="meta"><span id="model"></span><span id="live" class="live"></span><span id="lastUpdated"></span></div>
</header>
<main>
  <section id="cards" class="cards"></section>
  <section class="panel"><h2>${t('chartTitle')}</h2><div id="chart"></div></section>
  <section class="panel"><h2>${t('modelsTitle')}</h2><div id="modelsWrap"></div></section>
  <section class="panel"><h2>${t('tableTitle')}</h2><div id="tableWrap"></div></section>
  <div id="empty">${t('noDataFound')}</div>
</main>
<script>window.__AGY_DASH__ = ${payloadJson};</script>
<script>
${clientScript}
</script>
</body>
</html>
`;
}

/**
 * Blocks synchronously for ~ms using Atomics.wait (zero-dependency sync sleep).
 * Falls back silently (immediate continue) on platforms without Atomics.wait.
 * @param {number} ms
 */
function sleepSync(ms) {
  try {
    const arr = new Int32Array(new SharedArrayBuffer(4));
    Atomics.wait(arr, 0, 0, ms);
  } catch (_err) {
    // Immediate continue: retry without delay
  }
}

/**
 * Atomically writes a file: tmp + rename (mirrors cache-manager saveCache).
 * On rename failure (Windows EPERM/EBUSY, E2): retry once after 100ms, then
 * fall back to a direct (non-atomic) write so data is never lost.
 * @param {string} filePath - Absolute target path.
 * @param {string} content - File content.
 */
function atomicWriteFile(filePath, content) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tmpFile = `${filePath}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpFile, content, 'utf8');
  try {
    fs.renameSync(tmpFile, filePath);
  } catch (_renameErr) {
    try { fs.unlinkSync(tmpFile); } catch (_e) { /* ignore */ }
    sleepSync(100);
    try {
      const tmpFile2 = `${filePath}.${Date.now()}.tmp`;
      fs.writeFileSync(tmpFile2, content, 'utf8');
      fs.renameSync(tmpFile2, filePath);
    } catch (_retryErr) {
      fs.writeFileSync(filePath, content, 'utf8');
    }
  }
}

/**
 * Writes all dashboard artifacts (dashboard.html, dashboard-data.js,
 * dashboard-data.json) with throttling and content-hash skip.
 * - Data files are written only when the payload actually changed (hash over
 *   the payload excluding generatedAt) and the throttle interval has elapsed.
 * - dashboard.html is self-healed whenever missing (E13), regardless of throttle.
 * @param {object} payload - DashboardPayload.
 * @param {object} [opts]
 * @param {boolean} [opts.force=false] - Bypass throttle/hash and write everything.
 * @param {number} [opts.refreshSec] - Polling interval for the HTML template.
 * @param {number} [opts.servePort] - SSE port for the HTML template.
 * @returns {{ html: boolean, dataJs: boolean, dataJson: boolean, skipped: boolean }}
 */
function writeDashboardFiles(payload, opts = {}) {
  const force = Boolean(opts.force);
  const now = Date.now();

  const hashInput = { ...payload, generatedAt: null };
  const hash = JSON.stringify(hashInput);
  const dataChanged = hash !== lastDataHash;
  const throttleOk = now - lastWriteAt >= DASHBOARD_WRITE_THROTTLE_MS;
  const htmlMissing = !fs.existsSync(DASHBOARD_HTML_FILE);
  const dataFilesMissing =
    !fs.existsSync(DASHBOARD_DATA_JS) || !fs.existsSync(DASHBOARD_DATA_JSON);

  // Cross-process skip: each statusline invocation is a fresh node process, so
  // the in-memory hash is always cold. Compare against the on-disk payload
  // (generatedAt excluded) to avoid rewriting identical data every turn.
  let diskUnchanged = false;
  if (!force && !dataFilesMissing && dataChanged) {
    try {
      const diskJson = fs.readFileSync(DASHBOARD_DATA_JSON, 'utf8');
      const diskPayload = JSON.parse(diskJson);
      diskUnchanged = JSON.stringify({ ...diskPayload, generatedAt: null }) === hash;
    } catch (_err) {
      diskUnchanged = false;
    }
  }

  const writeData = force || dataFilesMissing || (dataChanged && throttleOk && !diskUnchanged);
  const writeHtml = force || htmlMissing;

  const results = { html: false, dataJs: false, dataJson: false, skipped: false };

  if (!writeData && !writeHtml) {
    results.skipped = true;
    return results;
  }

  if (writeData) {
    const json = JSON.stringify(payload, null, 2);
    atomicWriteFile(DASHBOARD_DATA_JS, `window.__AGY_DASH__ = ${jsonForScript(payload)};\n`);
    results.dataJs = true;
    atomicWriteFile(DASHBOARD_DATA_JSON, json);
    results.dataJson = true;
    lastDataHash = hash;
    lastWriteAt = now;
  }

  if (writeHtml) {
    atomicWriteFile(DASHBOARD_HTML_FILE, renderDashboardHtml(payload, opts));
    results.html = true;
  }

  return results;
}

/**
 * Self-heals dashboard.html when missing (E13): regenerates the static
 * template with the given payload embedded. Data files are not touched.
 * @param {object} payload - DashboardPayload.
 * @param {object} [opts] - renderDashboardHtml options.
 * @returns {boolean} True if the HTML was (re)written.
 */
function ensureDashboardHtml(payload, opts = {}) {
  if (fs.existsSync(DASHBOARD_HTML_FILE)) {
    return false;
  }
  atomicWriteFile(DASHBOARD_HTML_FILE, renderDashboardHtml(payload, opts));
  return true;
}

/**
 * Resets module-level throttle state (test hook).
 */
function resetDashboardWriteState() {
  lastWriteAt = 0;
  lastDataHash = null;
}

module.exports = {
  DASHBOARD_PAYLOAD_VERSION,
  DASHBOARD_DEFAULT_REFRESH_SEC,
  DASHBOARD_DIR,
  DASHBOARD_HTML_FILE,
  DASHBOARD_DATA_JS,
  DASHBOARD_DATA_JSON,
  buildDashboardPayload,
  renderDashboardHtml,
  writeDashboardFiles,
  ensureDashboardHtml,
  resetDashboardWriteState
};