# Code Task Report — Batch F2: Remaining 🟠🟡🟢 Dashboard Fixes (4/5/6)

## Task Summary
Implemented the 3 remaining fixes from the authoritative debug report (`082220_debug-report.md`) — Fix 4 (🟠 SSE port mismatch), Fix 5 (🟡 silent polling failure), Fix 6 (🟢 empty-sync clobber guard) — across exactly 3 files (one fix per file): [`src/html-report.js`](../../../src/html-report.js) (Fixes 4+5 client script), [`src/index.js`](../../../src/index.js) (Fix 6 hook branch). All verified with the full test suite (126/126 green), live HTTP probes, and a guard-condition execution against the real on-disk artifacts. No other files touched; no git commands run.

## Actions Taken

### Fix 4 (🟠) — [`src/html-report.js`](../../../src/html-report.js) — SSE runtime port retry ladder (Defect C)
- `renderDashboardHtml` now emits `var SSE_PORT_HINT = <servePort>;` alongside the existing `SSE_URL` ([src/html-report.js:399-400](../../../src/html-report.js#L399)). `SSE_URL` is still baked from the hint port, so the suite-15 assertion `http://127.0.0.1:8787/events` ([test/run-tests.js:1390](../../../test/run-tests.js#L1390)) passes **unchanged** — no test edits needed.
- `trySse()` rewritten with a documented retry ladder ([src/html-report.js:958-996](../../../src/html-report.js#L958)): attempt 0 uses the hint-port `SSE_URL`; while **no SSE connection has ever opened** (`sseEverOpened` flag), each `es.onerror` closes the dead EventSource and retries ONCE on `hint+1`, `hint+2`, `hint+3` (1s apart via `setTimeout(trySse, 1000)`), then gives up to polling. Rationale documented in a comment block: the live server may have auto-incremented its port (EADDRINUSE → 8788+), and file:// mode cannot JSONP-fetch `dashboard-server.json`, so a bounded same-host port ladder is the dependency-free fallback.
- Once a port has ever opened, `es.onerror` keeps legacy behavior (EventSource auto-reconnects to the same live port; no ladder churn on transient drops).
- JSDoc updated: `opts.servePort` documented as a *hint* port with client-side retry ([src/html-report.js:379-380](../../../src/html-report.js#L379)).
- Design note: the task's preferred "read the authoritative port from `dashboard-server.json` via script-tag polling" is impossible on `file://` (script-tag JSONP cannot read raw JSON without a `.js` wrapper, and the port file is plain JSON), so the hint+1..+3 ladder was implemented exactly as the task's fallback prescribes. Under `http://` same-origin, the ladder also converges because the server writes the port file on its actual port — the ladder covers the 3-port auto-increment window of `serve.js`.

### Fix 5 (🟡) — [`src/html-report.js`](../../../src/html-report.js) — surface polling failure
- `pollOnce()`'s `sc.onerror` ([src/html-report.js:964-968](../../../src/html-report.js#L964)) now calls `setLive(false)` (live indicator → degraded ○ state) and logs `console.warn('[agy-dashboard] data poll failed')` with the stable `[agy-dashboard]` prefix, before removing the script tag. Retry cadence unchanged (`setInterval(pollOnce, REFRESH_MS)` untouched). Minimal 4-line change.

### Fix 6 (🟢) — [`src/index.js`](../../../src/index.js) — empty-sync write guard
- Hook `--write-dashboard` branch ([src/index.js:395-433](../../../src/index.js#L395)): when `syncResult.sessions.length === 0`, the guard cheaply reads the on-disk `config.DASHBOARD_DATA_JSON` (`fs.existsSync` + `JSON.parse` in try/catch) and sets `skipEmptySyncWrite = true` when the previous data is non-empty — `models.length > 0 || daily.some(d => d.totalTokens > 0)` — skipping `buildDashboardPayload` + `writeDashboardFiles` entirely. Silent by design (no log output; statusline path stays fast/quiet). Corrupt/unreadable previous data falls through to a normal write (fail-open, matches "guard must not brick the writer").
- The `--html` branch ([src/index.js:281-312](../../../src/index.js#L281)) keeps `force: true` semantics — untouched, as instructed.

## Result

### ✅ Test suite: 126 passed, 0 failed (baseline preserved)
```
Tests: 126 passed, 0 failed, 126 total
Duration: 2599ms
Exit code: 0
```
Suite 15 (`renderDashboardHtml should embed payload, polling script, and SSE upgrade` — including the `http://127.0.0.1:8787/events` and `!html.includes('fetch(')` assertions) and suite 17 (SSE server) all green with zero test-file edits. No new assertions were added: the task's "Do NOT touch any other file" constraint outranks the optional "add small assertions only if natural" allowance; retry-ladder presence is proven by live gate A below instead.

### ✅ Live gate A: served HTML contains the retry ladder; `/dashboard-data.js` → 200
`node bin/agy-tokens.js --serve --port 8799` (background, PID 30120), then HTTP probes:
```
ROOT status: 200
has SSE_PORT_HINT: true
has retry ladder comment: true
has sseUrlForPort: true
has hint+1 retry: true
has setTimeout(trySse, 1000): true
has poll warn: true
SSE_URL line: var SSE_URL = 'http://127.0.0.1:8787/events';
HINT line: var SSE_PORT_HINT = 8787;
DATAJS status: 200
content-type: text/javascript; charset=utf-8
cache-control: no-store
first60: window.__AGY_DASH__ = {"version":3,"generatedAt":"2026-08-27
```
Server stopped after the gate (PID 30120 killed via `Get-NetTCPConnection`).

### ✅ Live gate B: hook render fresh + empty-sync guard verified
- `AGY_LANG=ko node bin/agy-tokens.js --hook --raw --write-dashboard` → exit 0, badge rendered, no console noise (guard silent as designed). Because the embedded payload was content-identical, F1's skip semantics correctly left the HTML untouched; the new client script was propagated by the designed force path (`AGY_LANG=ko node bin/agy-tokens.js --html`), after which the on-disk HTML embeds a **fresh** payload:
  ```
  generatedAt: 2026-08-27T23:49:05.424Z | lang: ko | model: "Gemini 3.7 Flash (High)"
  | models: 4 | nonzeroDaily: 22 | last30d.totalTokens: 148126198
  dashboard.html mtime: 2026-08-27T23:49:05.430Z size: 67173
  ```
- Empty-sync guard verification: the guard is inline in `runCli` (not a separately exported function), so a direct `node -e` call of the exported function was not feasible. Per the task's fallback option, I executed the **exact guard conditions** via `node -e` against the real on-disk `dashboard-data.json` (read-only) plus code-reading of the implemented branch:
  ```
  BEFORE: data.json mtime 2026-08-27T23:49:05.428Z | prev models: 4 | prev nonzeroDaily: 22
  guard condition prevHasData: true
  simulate empty sync (sessions=[]) → guard skipEmptySyncWrite: true
  VERDICT: WRITE SKIPPED - good artifacts protected
  AFTER: data.json mtime unchanged: true
  ```
  User data (transcripts dir) was never touched; only read-only probes of the dashboard dir.

## Issues Discovered
1. **Stale HTML propagation timing (expected, not a defect):** after Fix 4/5, an existing `dashboard.html` with a content-identical embedded payload is intentionally NOT rewritten (F1's self-heal skip semantics). The new client script reaches disk via the next genuine payload change (hook render with changed data) or an explicit `--html` force render. Verified both paths live.
2. **Port-file JSONP read is structurally impossible on file://** (as the task anticipated): `dashboard-server.json` is plain JSON; a script-tag injection would need a `.js`-wrapped endpoint, which doesn't exist on disk. The hint+1..+3 ladder is the correct dependency-free fallback and also covers the http case.
3. **Pre-existing (out of scope, unchanged):** `--serve` never writes dashboard artifacts ([src/serve.js:54-62](../../../src/serve.js#L54)); the ladder caps at hint+3, so a server that drifted >3 ports (not producible by the current single-increment EADDRINUSE logic) would still fall back to polling — acceptable per the task's "retry ONCE with hint+1..hint+3 before giving up to polling" spec.

## Next Step Recommendations
1. **VP:** commit these changes — the global install is a symlink to this working tree ([082220_debug-report.md](082220_debug-report.md) Issue #3), so the statusline/dashboard pick up uncommitted code; committing locks in Batch F2.
2. Optional future hardening: have `serve.js` also serve a tiny `/dashboard-server.js` JSONP wrapper so file:// pages could read the authoritative port directly (would obsolete the ladder); not required for the current fix set.
3. Optional test enhancement (when the no-other-files constraint is lifted): assert `SSE_PORT_HINT` + `sseUrlForPort` presence in the suite-15 render test.

## Affected File List
- [`src/html-report.js`](../../../src/html-report.js) — Fix 4: `SSE_PORT_HINT` emission + `trySse()` retry ladder (`sseUrlForPort`, `sseAttempt`, `sseEverOpened`); Fix 5: `pollOnce` `sc.onerror` → `setLive(false)` + `console.warn('[agy-dashboard] data poll failed')`; JSDoc updates.
- [`src/index.js`](../../../src/index.js) — Fix 6: empty-sync guard in the hook `--write-dashboard` branch (skip write when sessions empty AND on-disk data non-empty; silent; `--html` force path untouched).
- Report: `docs/260827_0003_session_dashboard-v33-effort-estimates/030400_code-report.md` (this file).
- No other files touched. No git commands run.