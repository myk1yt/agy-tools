# Debug Task Report — v3.3 Dashboard Blank-Screen Root Cause Verification & Impact Map

## Task Summary
Read-only verification of VP Phase 0 evidence for the 🔴Critical "dashboard shows nothing after v3.3" bug (commits `1a1cd17`, `c9732c4`, `0d7b1a8`). Verified all 6 evidence items against live code, live artifacts (`~/.gemini/antigravity-dashboard/`), the live server on port 8788, and git history. Confirmed the full causal chain and **corrected one VP hypothesis**: the empty embedded payload was NOT written by a schema-bump race in the hook flow — it was written by the **test suite**, which writes test payloads into the REAL dashboard directory. The two transport defects (missing `/dashboard-data.js` route, SSE port mismatch) are confirmed as reported. No code was modified.

## Root Cause Analysis (verified chain with file:line evidence)

### Defect A — Embedded boot payload in dashboard.html is STALE-EMPTY (the trigger)

**Observed (live artifact, read 2026-08-27T23:11Z):**
- `dashboard.html` mtime `2026-08-27T22:51:56.377Z` (07:51:56 KST), size 53,639 B.
- Embedded `window.__AGY_DASH__`: `generatedAt: 2026-08-27T22:51:56.374Z`, `lang: "ko"`, `models: 0`, all 30 `daily[]` rows zero, `dailyModels` = 30 empty `{}` keys, `summaries.last30d.totalTokens: 0`, `cacheStats: {totalSessions:0, parsedCount:0, cachedCount:0, elapsedMs:0}`, `model: ""`.
- `dashboard-data.js` / `dashboard-data.json` mtime `2026-08-27T23:00:43.3Z` (08:00:43 KST): `models: 4`, 22 nonzero daily rows, `last30d.totalTokens: 148,126,198` — FRESH.

**Who wrote the empty payload — exact mechanism (verified):**

1. **VP's schema-bump race hypothesis is DISPROVEN.** The hook branch ([`src/index.js:381-410`](src/index.js:381)) calls `cacheManager.syncSessions()` ONCE, then `buildDashboardPayload(syncResult.sessions, ...)` and `writeDashboardFiles(payload, ...)` from the SAME `syncResult`. [`src/cache-manager.js:95-159`](src/cache-manager.js:95) `syncSessions()` fully repopulates `updatedSessionsMap` and `saveCache()`s BEFORE returning `sessions`; [`src/html-report.js:91-294`](src/html-report.js:91) `buildDashboardPayload()` consumes that array synchronously. There is no ordering gap. The cache re-parse itself completed fine (cache file `version: 3`, 486 sessions, `lastUpdated 2026-08-27T23:00:42Z`).
2. **The fingerprint `model: ""` is impossible from any production writer.** The hook branch always passes `model: activeModel` ([`src/index.js:400`](src/index.js:400)) and `activeModel = options.model || config.getActiveModelFromSettings()` ([`src/index.js:360`](src/index.js:360)); `getActiveModelFromSettings()` can never return `""` ([`src/config.js:416-429`](src/config.js:416)). The `--html` branch passes `model: activeModel` too ([`src/index.js:292`](src/index.js:292)). The `--serve` process builds payloads with `model: opts.model || ''` ([`src/serve.js:46`](src/serve.js:46)) but **never writes any file** — `aggregate()` only pushes SSE ([`src/serve.js:54-62`](src/serve.js:54)). `ensureDashboardHtml()` is only called from tests ([`test/run-tests.js:1420`](test/run-tests.js:1420)) — never from production code (verified by repo-wide search).
3. **The writer is the test suite.** Suite 15 writes test payloads to the REAL `~/.gemini/antigravity-dashboard/` directory via `htmlReport.DASHBOARD_HTML_FILE` ([`test/run-tests.js:1388-1425`](test/run-tests.js:1388)). The last suite-15 write is `writeDashboardFiles should force regeneration on locale change` ([`test/run-tests.js:1599-1628`](test/run-tests.js:1599)): it writes `payloadEn` with `force: true`, then `payloadKo` (locale mismatch → rewrite), both built with `buildDashboardPayload([], {currency:'usd', lang:...})` — **no `model` option → `model: ""`, zero sessions → `cacheStats.totalSessions: 0`**. Final on-disk state after a full test run: `dashboard.html` with `lang="ko"`, `model: ""`, all-zero payload. This matches the observed embedded payload **exactly** (lang ko, model "", totalSessions 0, parsedCount 0, cachedCount 0, elapsedMs 0).
4. **Timing corroboration:** the embedded `generatedAt` is `2026-08-27T22:51:56.374Z` = 07:51:56 KST — inside the P6 audit window (code-light report `074710` ran the suite at 07:47:10 KST; commit `0d7b1a8` "P6 audit PASS" landed 07:52:29 KST). A suite run at 07:51:56 KST is the only writer that produces this exact payload. The test run also overwrote the data files, but the next hook render (08:00:43 KST) refreshed them (`dataChanged → writeData`); the HTML was NOT refreshed (see 5).
5. **Why it persists forever (the real defect):** [`src/html-report.js:1190-1191`](src/html-report.js:1190) — `writeHtml = force || htmlMissing || localeMismatch`. Once `dashboard.html` exists and the locale matches, **no production path ever rewrites it**, no matter how stale the embedded payload is. Data files self-heal on every hook render (hash/throttle logic, [`src/html-report.js:1154-1191`](src/html-report.js:1154)); the HTML does not. The stale-empty HTML therefore survives indefinitely. **This is a pre-existing design gap (since `4084983`), exposed by the v3.3 test-suite run.**

### Defect B — serve.js has no `/dashboard-data.js` route (polling dead under http)

**Verified in code:** [`src/serve.js:76-144`](src/serve.js:76) routes ONLY `/`, `/index.html`, `/events`, `/data.json`; everything else falls to `404 Not Found` ([`src/serve.js:142-143`](src/serve.js:142)).

**Verified live:** `GET http://127.0.0.1:8788/dashboard-data.js?v=123` → **404** `text/plain`, body `"Not Found"` (probed 2026-08-27T23:11Z against the running server, PID 36268).

**Client consequence:** [`src/html-report.js:932-945`](src/html-report.js:932) `pollOnce()` injects `<script src="dashboard-data.js?v=...">`; `sc.onerror` silently removes the script ([`src/html-report.js:943`](src/html-report.js:943)) and the page keeps the stale embedded payload forever. Under `http://` the relative URL resolves to `http://127.0.0.1:8788/dashboard-data.js` → 404 every 5s.

### Defect C — SSE URL port mismatch (8787 baked vs 8788 live)

**Verified:** embedded HTML contains `SSE_URL = 'http://127.0.0.1:8787/events'` (baked by [`src/html-report.js:375-376`](src/html-report.js:375) from `opts.servePort || DASHBOARD_DEFAULT_PORT`; hook passes `options.servePort || config.DASHBOARD_DEFAULT_PORT` = 8787, [`src/index.js:408`](src/index.js:408)). Port file `dashboard-server.json` says `{port: 8788, pid: 36268, payloadVersion: 3}` (written by `--serve` via [`src/dashboard-link.js:153-162`](src/dashboard-link.js:153) after EADDRINUSE auto-increment, [`src/serve.js:146-153`](src/serve.js:146)).

**Verified live:** `GET http://127.0.0.1:8787/events` → **ECONNREFUSED**; `GET http://127.0.0.1:8788/events` → 200 `text/event-stream`, first push `data: {"version":3,"generatedAt":"2026-08-27T23:16:08Z",...}`. So SSE is healthy on 8788 but the page never connects to it; `es.onerror` → `startPolling()` ([`src/html-report.js:963`](src/html-report.js:963)) → polling 404s (Defect B). **Both live-update paths are dead.**

### Defect D — file:// polling works (why only http users see blank)

**Verified:** `pollOnce()` uses a relative URL `dashboard-data.js` ([`src/html-report.js:934`](src/html-report.js:934)); on `file://` the browser resolves it against the file's directory (`~/.gemini/antigravity-dashboard/dashboard-data.js`), which exists and is fresh → `isFreshPayload()` passes → `render()` paints data within ≤5s. Confirmed by the badge fallback: my live `--hook --raw` run rendered the OSC 8 link as `file:///C:/Users/k1yt/.gemini/antigravity-dashboard/dashboard.html` (non-VS-Code terminal). The blank screen hits `--serve`/http users — exactly the VS Code terminal badge path ([`src/dashboard-link.js:74-101`](src/dashboard-link.js:74)).

### Regression vs latent — git history verdict

- `git log -S "dashboard-data" -- src/serve.js` → only `4084983` (initial dashboard commit) and `166efe8` (i18n). `git show 4084983:src/serve.js` and `166efe8:src/serve.js` both contain ONLY `/`, `/index.html`, `/events`, `/data.json` — **`/dashboard-data.js` was NEVER routed in any commit**. Defect B is a **latent bug since `4084983` (2026-08-27 21:35 KST)**, not a v3.3 regression.
- Defect A's persistence mechanism (`writeHtml` never refreshes an existing HTML) is also pre-existing since `4084983`. The v3.3 connection is indirect: the P6 audit test run (part of the v3.3 release process) clobbered the real `dashboard.html` with an empty test payload at 07:51:56 KST, and the persistence gap kept it there. **v3.3 is the exposure, not the root cause of the routing gap.**
- Defect C (SSE port baked at write time) is pre-existing design; the EADDRINUSE auto-increment ([`src/serve.js:147-149`](src/serve.js:147)) made it observable because the server landed on 8788 while the HTML was written with 8787.

### Causal summary
- **Trigger:** suite-15 test run during the v3.3 P6 audit (07:51:56 KST) wrote an empty-session, `model: ""` test payload into the REAL `~/.gemini/antigravity-dashboard/dashboard.html`.
- **Root cause (persistence):** [`src/html-report.js:1191`](src/html-report.js:1191) `writeHtml = force || htmlMissing || localeMismatch` — an existing `dashboard.html` is never rewritten when its embedded payload goes stale; only the data files self-heal. Contributing root cause: [`test/run-tests.js:1388-1425`](test/run-tests.js:1388) writes test artifacts to the production dashboard directory.
- **Amplifiers:** (1) [`src/serve.js:142`](src/serve.js:142) 404 for `/dashboard-data.js` kills polling under http; (2) [`src/html-report.js:376`](src/html-report.js:376) SSE URL baked with `DASHBOARD_DEFAULT_PORT` (8787) while the live server auto-incremented to 8788; (3) [`src/html-report.js:943`](src/html-report.js:943) `sc.onerror` swallows the failure silently.
- **Symptom:** dashboard renders the stale-empty embedded payload forever for http/`--serve` users.

## Impact Map (reverse dependencies)

| Surface | Defect | User flows broken |
|---|---|---|
| `GET /dashboard-data.js` (serve.js routing) | B — 404 | **VS Code terminal badge http link** (primary): page loads stale HTML, polling 404s every 5s, never updates. **`--serve` direct users**: same. |
| Embedded `window.__AGY_DASH__` in dashboard.html | A — stale-empty | **All http users**: first paint is empty (0 cards, empty chart, "no data" state). file:// users recover ≤5s via polling; http users never recover (B+C). |
| `SSE_URL` baked port 8787 | C — port mismatch | **http users**: SSE never connects (ECONNREFUSED), `es.onerror` → polling → 404. Live indicator stays off. |
| file:// polling (relative `dashboard-data.js`) | none (works) | **file:// link users** (non-VS-Code terminals, `--html --open`): recover within ≤5s. Unaffected. |
| `--serve` SSE stream itself | none (healthy) | SSE pushes fresh v3 payloads every 5s on the real port — only reachable if the client knew the port. |
| Badge/CLI (`--today`, `--hook --raw`) | none | Verified healthy: 322,371 tokens / 11 sessions today; badge renders with OSC 8 link. Parser/cache/aggregation unaffected. |
| Test suite ↔ production artifacts | A (writer) | `node test/run-tests.js` clobbers the user's live `dashboard.html`/data files with test payloads on every run. |

**Reverse-dependency notes for the fix:**
- Adding a `/dashboard-data.js` route to `serve.js` touches only the request handler; consumers: the embedded client script (relative URL) — no other callers. Low risk.
- Rewriting HTML when the embedded payload is stale touches `writeDashboardFiles`; consumers: `--html` branch, hook `--write-dashboard` branch, suite-15 tests (`writeDashboardFiles should throttle unchanged payloads (skip)` at [`test/run-tests.js:1406`](test/run-tests.js:1406) and `force regeneration on locale change` at [`test/run-tests.js:1599`](test/run-tests.js:1599) — the skip test asserts `res.skipped === true` for an unchanged payload, which must remain true when the embedded payload is NOT stale).
- SSE URL from port file: touches `renderDashboardHtml`/`writeDashboardFiles` opts and the hook branch; consumers: suite-15 tests asserting `http://127.0.0.1:8787/events` in rendered HTML ([`test/run-tests.js:1381`](test/run-tests.js:1381)) — those assertions must be updated or made port-agnostic.
- Sandboxing suite-15 writes to a temp dir: touches the test file only; no production consumers.

## Recommended Fix Set (prioritized, exact locations)

| # | Severity | Fix | Exact target |
|---|---|---|---|
| 1 | 🔴 Critical | Add static route for `/dashboard-data.js` (serve `DASHBOARD_DATA_JS` with `Content-Type: application/javascript; charset=utf-8`, `Cache-Control: no-store`, mirroring the `/data.json` handler). Optionally also route `/dashboard-data.json`. | [`src/serve.js:127-140`](src/serve.js:127) — insert a sibling `if (urlPath === '/dashboard-data.js')` block before the 404 fallthrough; import `DASHBOARD_DATA_JS` from `./config` ([`src/serve.js:14-18`](src/serve.js:14)). |
| 2 | 🔴 Critical | Self-heal stale embedded payload: in `writeDashboardFiles`, detect that the on-disk HTML's embedded `window.__AGY_DASH__` is stale (e.g., parse `generatedAt`/`cacheStats.totalSessions` from the HTML, or compare a stored content hash of the embedded payload) and set `writeHtml = true` when the embedded payload differs from the current payload. Keep the existing skip behavior when identical (suite-15 skip test must stay green). | [`src/html-report.js:1179-1191`](src/html-report.js:1179) — extend the `htmlLangMismatch` block into a general `htmlStale` check feeding `writeHtml`. |
| 3 | 🔴 Critical | Sandbox suite-15 artifact tests: point `writeDashboardFiles`/`ensureDashboardHtml` tests at a temp directory instead of the real `~/.gemini/antigravity-dashboard/` (the tests currently use the module constants directly). This is the direct cause of the empty payload and will recur on every test run until fixed. | [`test/run-tests.js:1388-1425`](test/run-tests.js:1388) and [`test/run-tests.js:1599-1628`](test/run-tests.js:1599) — inject a temp path (e.g., via a `writeDashboardFiles` opts override or a test-only env var read in `config.js`). |
| 4 | 🟠 High | SSE URL must follow the live server: read `DASHBOARD_SERVER_PORT_FILE` (via `dashboard-link.readPortFile`) when rendering HTML, falling back to `DASHBOARD_DEFAULT_PORT`; or make the client derive the SSE URL from `location.port` when served over http (relative `'/events'` EventSource URL works for same-origin http and degrades to polling on file://). | [`src/html-report.js:375-376`](src/html-report.js:375) (`renderDashboardHtml` SSE_URL baking) + [`src/index.js:406-409`](src/index.js:406) (hook `servePort` pass-through); alternative: client-side `var SSE_URL = location.protocol === 'http:' ? location.origin + '/events' : 'http://127.0.0.1:8787/events';` in the embedded script. |
| 5 | 🟡 Medium | Surface polling failure: on `sc.onerror`, set the live indicator to a visible "offline" state instead of silently removing the script (currently `setLive(false)` is only called from the SSE error path). | [`src/html-report.js:943`](src/html-report.js:943) (`pollOnce` onerror). |
| 6 | 🟢 Low | Guard the empty-payload write: skip writing `dashboard.html`/data files when `syncResult.sessions.length === 0` AND the previous on-disk data was non-empty (prevents any transient empty sync from clobbering good artifacts). | [`src/index.js:395-410`](src/index.js:395) (hook branch) and/or [`src/html-report.js:1150`](src/html-report.js:1150) (`writeDashboardFiles`). |

Fix 1 alone restores live updates for http users (polling works even with the stale first paint). Fix 2 removes the stale first paint. Fix 3 prevents recurrence. Fix 4 restores SSE. Fixes 5-6 are hardening.

## Issues Discovered
1. **Test suite writes to the production dashboard directory** (root cause of Defect A): [`test/run-tests.js:1388-1425`](test/run-tests.js:1388) and [`test/run-tests.js:1599-1628`](test/run-tests.js:1599) use `htmlReport.DASHBOARD_HTML_FILE` / `DASHBOARD_DATA_JS` / `DASHBOARD_DATA_JSON` directly. Every full test run overwrites the user's live dashboard artifacts with empty test payloads, and the final suite-15 write leaves `dashboard.html` with `lang="ko"`, `model: ""`, `totalSessions: 0`. This is exactly the observed stale-empty artifact (generatedAt 07:51:56 KST, P6 audit window).
2. **`--serve` never writes dashboard artifacts** ([`src/serve.js:54-62`](src/serve.js:54)) — it aggregates every 5s but only pushes SSE; a user who runs `--serve` on a machine where `dashboard.html` is missing gets the 404 hint "Run: agy-tokens --html" ([`src/serve.js:88`](src/serve.js:88)) but the server itself never self-heals the HTML. Related to Defect A's persistence gap.
3. **Global install is a symlink to the repo** (`C:\Users\k1yt\AppData\Roaming\npm\node_modules\agy-tools` → this workspace), so the statusline executes uncommitted working-tree code. Any future fix must be committed/installed before the badge picks it up — relevant for VP's fix routing.
4. **`dashboard-server.json` is stale relative to the HTML**: port file (21:36 KST) predates the empty HTML write (22:51 KST) — the server has been up the whole time; the HTML was rewritten by the test suite, not by the server or a hook render. Consistent with the analysis above.
5. **VP Phase 0 evidence item 2's mechanism was incorrect**: the empty payload was not written "right when CACHE_SCHEMA_VERSION 1→3 forced a full re-parse" by the hook flow. The hook flow is ordered correctly (single sync pass → payload → write). The writer was the test suite; the schema bump is only temporally correlated (same release window), not causal.

## Affected File List
- Read/verified, NOT modified: [`src/serve.js`](src/serve.js), [`src/html-report.js`](src/html-report.js), [`src/dashboard-link.js`](src/dashboard-link.js), [`src/index.js`](src/index.js), [`src/cache-manager.js`](src/cache-manager.js), [`src/config.js`](src/config.js), [`src/hook-handler.js`](src/hook-handler.js), [`src/log-parser.js`](src/log-parser.js), [`test/run-tests.js`](test/run-tests.js), [`bin/agy-tokens.js`](bin/agy-tokens.js)
- Live artifacts inspected (not modified): `~/.gemini/antigravity-dashboard/{dashboard.html, dashboard-data.js, dashboard-data.json, dashboard-server.json}`, `~/.gemini/token_tracker_cache.json`, `~/.gemini/antigravity-cli/settings.json`
- Report only: `docs/260827_0003_session_dashboard-v33-effort-estimates/082220_debug-report.md` (this file)
