# Code Task Report — v3.2 Stale-Payload Bugs + Per-Model Daily Detail (REQ-240..244)

## Task Summary
Implemented all five work items from the v3.2 task: stale-payload tolerance (REQ-244), default date filter = 오늘 (REQ-241), per-model Daily Detail sub-rows (REQ-243), server-side payloadVersion + stale-server respawn (REQ-240), and suite 15 test updates (REQ-245). Root cause per [`055700_debug-report.md`](055700_debug-report.md): a stale v2 background server (pid 38020) pushes `version=2` payloads without `dailyModels` into the v3 client.

## Actions Taken

### 1. REQ-244 — Stale-payload tolerance ([`src/html-report.js`](src/html-report.js))
- Added `isFreshPayload(p)` guard (`p.version >= 3 && p.dailyModels`) right after `filterState` init ([`src/html-report.js#L396`](src/html-report.js:392)).
- **SSE handler** (`es.onmessage`): stale payloads now `return` BEFORE `window.__AGY_DASH__ = p` and `render(p)` — the v2 push can no longer blank the chart or zero the tables ([`src/html-report.js#L846-L856`](src/html-report.js:846)).
- **Polling** (`pollOnce` `sc.onload`): only renders when `isFreshPayload(window.__AGY_DASH__)`; otherwise restores `lastPayload` so the last known-good view persists while polling continues ([`src/html-report.js#L833-L841`](src/html-report.js:833)).
- **`renderSvg` fallback**: when a day has no `dailyModels` segments but `d.totalTokens > 0`, renders a single-series bar from `d.totalTokens` using the default `.bar` accent class (chart NEVER goes blank); baseline-only 1px rect remains for genuinely empty days ([`src/html-report.js#L497-L521`](src/html-report.js:497)).
- **`getFilteredData` degraded mode**: detects `hasDailyModels` (any non-empty per-date map); when absent, models table falls back to `p.models` (model-filter applied) and daily table pushes `p.daily` rows as-is — filters never produce a completely empty table ([`src/html-report.js#L627-L660`](src/html-report.js:627)).

### 2. REQ-241: Default date filter = 오늘
- `filterState.range` default `'30d'` → `'today'` ([`src/html-report.js#L392`](src/html-report.js:392)).
- HTML template: `data-range="today"` button now has `active`; `data-range="30d"` lost it ([`src/html-report.js#L929-L932`](src/html-report.js:929)).
- First render: `render()`'s `filtersActive` check (`range !== '30d'`) is now true on load → `applyFilters()` runs → tables reflect TODAY's data immediately (verified in runtime sandbox: exactly 1 date row + 2 sub-rows).

### 3. REQ-243: Per-model Daily Detail sub-rows
- `renderTable(daily, dailyModels)` now renders, under each date row, one `.subrow` per model from `p.dailyModels[date]` ([`src/html-report.js#L561-L590`](src/html-report.js:561)):
  - Filtered to `filterState.models` (model filter respected) and only for dates present in the (already date-filtered) `daily` slice.
  - Sorted by cost desc; first cell `↳ model-name` (`\u21b3` + `esc()`), all metric columns populated (sessions/turns/input/cached/output/total/cache%/cost/savings).
  - Falls back to plain date rows when `dailyModels` is missing (stale-tolerant).
- CSS: `.subrow td{color:var(--dim);font-size:11px}` + `.subrow td:first-child{padding-left:20px}` + `[dir=rtl] .subrow td:first-child{padding-left:0;padding-right:20px}` ([`src/html-report.js#L916-L918`](src/html-report.js:916)).
- Both render paths pass `dailyModels`: `applyFilters()` → `renderTable(filtered.daily, lastPayload.dailyModels)`; `render()` fast path → `renderTable(p.daily || [], p.dailyModels)`.
- i18n: **no new keys** (reused existing column labels; no toggle added).

### 4. REQ-240: Server version record + stale respawn ([`src/dashboard-link.js`](src/dashboard-link.js))
- `writePortFile` now records `payloadVersion: DASHBOARD_PAYLOAD_VERSION` (imported from `./html-report` — zero-dep preserved, no circular dependency: html-report requires only config/aggregator/i18n) ([`src/dashboard-link.js#L153-L163`](src/dashboard-link.js:153)).
- `ensureServerRunning`: a recorded server whose `payloadVersion` is missing or `< DASHBOARD_PAYLOAD_VERSION` is treated as stale — the probe-hit fast path (step 1) AND the default-port fast path (step 3) are skipped, so a spawn intent is written and a fresh server spawns; it fails to bind the occupied port and auto-increments (serve.js EADDRINUSE retry), then rewrites the port file ([`src/dashboard-link.js#L258-L286`](src/dashboard-link.js:258)).

### 5. REQ-245: Tests ([`test/run-tests.js`](test/run-tests.js))
- Updated the 30d-default test → today default (button order + active class + `range: 'today'` in filterState).
- Added 4 new tests: stale-payload guard (`isFreshPayload` in SSE + poll handlers, stale check before `render(p)`), renderSvg single-series fallback, `getFilteredData` degraded fallback, `renderTable` sub-rows (signature, `.subrow` class, arrow prefix, cost-desc sort, model-filter respect, RTL CSS).
- **All 18 suites green: 116 passed, 0 failed** (was 111; +5 net new/expanded).

## Result
✅ **Success — all verification gates passed.**

| Gate | Command | Result |
|---|---|---|
| Syntax | `node --check src/html-report.js` / `src/dashboard-link.js` / `test/run-tests.js` | OK |
| Full suite | `node test/run-tests.js` | **116 passed, 0 failed** (2877ms) |
| Runtime vm-sandbox (stale v2 payload → v3 client) | `node scripts/_verify_v32_stale_payload.js` | **10 passed, 0 failed** |
| Stale-server detection (live probe + version check) | inline node harness | 4/4 OK |

Runtime sandbox evidence (exact debug-report E5 Case A scenario, now fixed):
- A1: chart NOT blank with stale v2 payload — fallback single-series bars rendered (1 fallback rect + 28 baseline rects for empty days).
- A4/A5: daily + models tables non-empty after stale payload (degraded fallback to `p.daily`/`p.models`).
- B1–B4: sub-rows render under date rows, sorted by cost desc, date+model filters respected.
- C1: SSE handler ignores stale payloads via `isFreshPayload` guard.
- Server: stale record (no `payloadVersion` or `payloadVersion: 2`) + live port → spawn attempted (stale detected); fresh v3 record → probe fast path preserved; `writePortFile` writes `payloadVersion: 3`.

## Issues Discovered
1. **User action required**: the currently running stale server (pid 38020, v2 code) is NOT killed by this change (per task constraint). The user must restart it (`taskkill /PID 38020 /F` or restart agy). After restart, the next statusline render spawns a fresh v3 server; with REQ-240 in place, any future stale server is auto-detected via `payloadVersion` and respawned on a new port.
2. **First-render behavior change (intended, REQ-241)**: with default `today`, `render()` now always takes the `applyFilters()` path on load (the old `range !== '30d'` fast-path condition). Verified this renders today's tables correctly with both fresh and stale payloads.
3. Temporary verification artifact `scripts/_verify_v32_stale_payload.js` was created (zero-dep, self-contained). Keep as a regression harness or remove — VP's call.

## Next Step Recommendations
1. User restarts the stale server (pid 38020) to see the fix live; the new server writes `payloadVersion: 3` into `dashboard-server.json`.
2. VP may run `node scripts/_verify_v32_stale_payload.js` as an independent regression check.
3. Optional cleanup: remove `scripts/_verify_v32_stale_payload.js` if the suite-15 assertions are deemed sufficient.

## Affected File List
- [`src/html-report.js`](src/html-report.js) — client script: `isFreshPayload` guard, SSE/poll handlers, `renderSvg` fallback, `getFilteredData` degraded mode, `renderTable` sub-rows, `filterState` default, active-button markup, `.subrow` CSS (+RTL).
- [`src/dashboard-link.js`](src/dashboard-link.js) — `writePortFile` payloadVersion, `ensureServerRunning` stale detection.
- [`test/run-tests.js`](test/run-tests.js) — suite 15: 1 test updated (REQ-241), 4 tests added (REQ-243/244/245).
- [`scripts/_verify_v32_stale_payload.js`](scripts/_verify_v32_stale_payload.js) — new one-shot runtime verification harness (temporary).