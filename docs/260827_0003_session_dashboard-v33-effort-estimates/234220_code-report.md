# Code Task Report — Batch F1: 3 🔴Critical Dashboard Blank-Screen Fixes

## Task Summary
Implemented the 3 🔴Critical fixes from the authoritative debug report (`082220_debug-report.md`) for the "dashboard shows nothing after v3.3" bug: (1) `GET /dashboard-data.js` static route in serve.js, (2) self-heal of stale embedded `window.__AGY_DASH__` payloads in `writeDashboardFiles`, (3) sandboxing of suite-15 artifact tests away from the real `~/.gemini/antigravity-dashboard/` directory. All verified with full test suite (126/126 green), live hook-render evidence, and a live HTTP probe.

## Actions Taken

### Fix 1 — [`src/serve.js`](src/serve.js) — `/dashboard-data.js` route (Defect B)
- Added `DASHBOARD_DATA_JS` to the config import ([src/serve.js:14-19](src/serve.js#L14)).
- Inserted a `GET /dashboard-data.js` route before the 404 fallthrough ([src/serve.js:142-155](src/serve.js#L142)), mirroring the existing `/data.json` handler: serves `DASHBOARD_DATA_JS` from disk with `Content-Type: text/javascript; charset=utf-8` + `Cache-Control: no-store`; 404 `{}`-style fallback on read failure. `urlPath` already strips `?v=` query, so `dashboard-data.js?v=123` routes correctly.

### Fix 2 — [`src/html-report.js`](src/html-report.js) — self-heal stale embedded payload (Defect A persistence)
- Added `htmlStale` detection feeding `writeHtml` ([src/html-report.js:1201-1240](src/html-report.js#L1201)): when the HTML is not already being written, extract the embedded payload between `window.__AGY_DASH__ = ` and the closing `;</script>`, `JSON.parse` in try/catch, and mark stale when: marker/parse fails, embedded content differs from the incoming payload, or embedded has zero models while incoming has >0.
- **Design correction found during live verification (see Issues Discovered #1):** the initial implementation gated the check on `!writeData` per the task instruction, but live evidence showed `cacheStats.elapsedMs` jitters per sync run (282 vs 283 ms), making `writeData=true` on essentially every hook render — the gate would have been dead code in production. Final implementation gates on `!writeHtmlBase` (HTML not already being written) and excludes `generatedAt` + `cacheStats.elapsedMs` from the equality comparison, so identical-content HTML keeps skip semantics while genuinely stale/empty/corrupt embedded payloads are healed.
- The check is cheap: reads/parses the HTML only when the HTML write path hasn't already triggered; the expensive data-write path is unchanged.

### Fix 3 — [`test/run-tests.js`](test/run-tests.js) — sandbox suite-15 artifact tests (Defect A writer)
- Added `_setDashboardDirForTests(dir)` test hook in [`src/html-report.js`](src/html-report.js#L1281) (mirrors the existing `resetDashboardWriteState()` pattern): re-points `DASHBOARD_DIR`/`DASHBOARD_HTML_FILE`/`DASHBOARD_DATA_JS`/`DASHBOARD_DATA_JSON` module state at a caller-supplied directory; the four constants became override-aware getters on `module.exports` (all consumers — tests, `src/index.js`, `src/serve.js`, `scripts/verify-i18n.js` — access them via the module object, so getters are transparent).
- Suite 15 now creates `fs.mkdtempSync(path.join(os.tmpdir(), 'agy-dash-test-'))` at suite entry ([test/run-tests.js:1348-1353](test/run-tests.js#L1348), redirects all artifact paths via `_setDashboardDirForTests`, and restores the production dir + `resetDashboardWriteState()` + `fs.rmSync(recursive, force)` cleanup at suite end ([test/run-tests.js:2046-2050](test/run-tests.js#L2046)).
- All suite-15 tests that touch the real dir (`writeDashboardFiles should atomically write all 3 artifacts`, `throttle unchanged payloads (skip)`, `ensureDashboardHtml should self-heal missing HTML only`, `force regeneration on locale change`, new E13b test) now run against the temp dir. Assertions unchanged — same behaviors asserted against the sandbox.
- Added 1 new test (per task instruction allowance): `writeDashboardFiles should rewrite HTML when embedded payload is stale (E13b)` ([test/run-tests.js:1634-1690](test/run-tests.js#L1634)) — writes a fresh payload with data, corrupts the embedded payload to a stale-empty one, re-writes the same payload without force, asserts HTML rewritten + data files untouched + healed HTML embeds models>0 + identical payload still skips.

## Result

### ✅ Test suite: 126 passed, 0 failed (baseline 125 + 1 new E13b test)
```
Tests: 126 passed, 0 failed, 126 total
Duration: 2753ms
Exit code: 0
```
Suite 15 output confirms all artifact tests green including the new E13b test; suites 16-18 unaffected by the sandbox restore.

### ✅ Real dashboard dir: untouched by tests, then healed by hook render
- After the test run, the real `dashboard.html` embedded payload was still the pre-fix stale artifact (`generatedAt: 2026-08-27T22:51:56.374Z`, `models: 0`, `model: ""`) — proving the test suite no longer writes there.
- After `AGY_LANG=ko node bin/agy-tokens.js --hook --raw --write-dashboard`:
  ```
  HTML embedded -> generatedAt: 2026-08-27T23:41:16.773Z | lang: ko | model: "Gemini 3.7 Flash (High)" | models: 4 | nonzeroDailyRows: 22 | last30d.totalTokens: 148126198
  dashboard.html mtime: 2026-08-27T23:41:16.779Z size: 66100
  ```
- Steady-state skip verified: a second hook render left mtime unchanged (23:41:16.779) — no rewrite churn.

### ✅ Live gate: `GET /dashboard-data.js` → 200
Server started with `node bin/agy-tokens.js --serve --port 8799` (background), then:
```
status: 200
content-type: text/javascript; charset=utf-8
cache-control: no-store
first80: "window.__AGY_DASH__ = {\"version\":3,\"generatedAt\":\"2026-08-27T23:41:23.195Z\",\"cur"
bodyLen: 23217
```
Also verified with `?v=123` query (query stripped by urlPath). Test server stopped after the gate (PID 24000 killed).

## Issues Discovered
1. **`!writeData` gate would have been dead code in production (design correction):** `cacheStats.elapsedMs` jitters per sync run (live evidence: 282 vs 283 ms across two back-to-back `syncSessions()` calls), so the payload hash never matches disk and `writeData=true` on essentially every hook render. The initial Fix 2 (gate on `!writeData`, compare including `elapsedMs`) never healed the real dashboard across two live hook renders. Corrected to gate on `!writeHtmlBase` and exclude `generatedAt`/`elapsedMs` from the comparison. This matches the authoritative debug report's spec ("set writeHtml = true when the embedded payload differs from the current payload. Keep the existing skip behavior when identical") more faithfully than the `!writeData` reading.
2. **`generatedAt`-only staleness comparison (first attempt) would rewrite the HTML on every hook render** — each invocation builds a fresh timestamp, so `embeddedAt < incomingAt` is always true. Replaced with content comparison (generatedAt excluded) per the debug report's "differs from the current payload" semantics.
3. **Pre-existing (not fixed, out of scope):** `--serve` never writes dashboard artifacts ([src/serve.js:54-62](src/serve.js#L54)); SSE URL still bakes `DASHBOARD_DEFAULT_PORT` (Defect C, Batch F2 scope); `sc.onerror` silently swallows polling failures (Fix 5, hardening scope).

## Next Step Recommendations
1. **Batch F2 (Defect C):** make the SSE URL follow the live server — client-side `location.origin + '/events'` when served over http, or read the port file at render time ([src/html-report.js:375-376](src/html-report.js#L375) + [src/index.js:406-409](src/index.js#L406)).
2. **Hardening (Fix 5):** surface polling failure in the client (`sc.onerror` → visible offline indicator) ([src/html-report.js:943](src/html-report.js#L943)).
3. **Hardening (Fix 6):** guard against transient empty-sync writes clobbering good artifacts ([src/index.js:395-410](src/index.js#L395)).
4. **VP:** commit these changes — the global install is a symlink to this working tree ([082220_debug-report.md](082220_debug-report.md) Issue #3), so the statusline picks up uncommitted code; committing locks in the fix for the live badge path.

## Affected File List
- [`src/serve.js`](src/serve.js) — Fix 1: `DASHBOARD_DATA_JS` import + `/dashboard-data.js` route.
- [`src/html-report.js`](src/html-report.js) — Fix 2: `htmlStale` self-heal in `writeDashboardFiles`; Fix 3 support: overridable path state + `_setDashboardDirForTests()` + getter exports.
- [`test/run-tests.js`](test/run-tests.js) — Fix 3: suite-15 sandbox (temp dir setup/restore) + new E13b test.
- Report: `docs/260827_0003_session_dashboard-v33-effort-estimates/234220_code-report.md` (this file).
- No other files touched. No git commands run.