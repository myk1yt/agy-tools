# Debug Task Report — v3.2 B2: Real-Browser Dashboard Bugs (REQ-240..242)

## Task Summary
Diagnose three real-browser dashboard bugs reported by the user:
1. Token Usage Trend chart shows briefly, then goes blank.
2. Date filter default is 30d (user expects Today).
3. Clicking Today/Yesterday/7d shows nothing in Models Usage & Cost and Daily Detail tables.

Deliverable: root-cause analysis with code-line evidence, verdict on the stale-server hypothesis, and a fix plan for Code mode. **No fixes applied — diagnosis only.**

## Conclusion (TL;DR)

**The stale-server hypothesis is CONFIRMED with runtime evidence.** The background SSE server (pid 38020, started 2026-08-27 22:17:45 KST) is running **v2 code** and pushes `version=2` payloads **without `dailyModels`** into the **v3 client** embedded in `dashboard.html`. This single root cause produces bugs 1 and 3 simultaneously. Bug 2 is a requirement change (REQ-241), not a bug: the current default is 30d by design (REQ-213).

## Evidence

### E1. Live server pushes v2 payloads (RUNTIME_OBSERVED)
Probed `http://127.0.0.1:8787/events` on the running server:
```
SSE payload: version=2 hasDailyModels=false daily=30 models=3 lang=en
keys=[version,generatedAt,currency,lang,isFree,model,models,summaries,daily,cacheStats]
```
The v3 schema requires `dailyModels` (added in [`src/html-report.js`](src/html-report.js:215)); the live payload lacks it. `lang=en` also proves the server predates the locale-following change (commit `ca9499c`).

### E2. Server started before the v3 code existed (CONFIG_VERIFIED + git)
- `~/.gemini/antigravity-dashboard/dashboard-server.json`: `{ "port": 8787, "pid": 38020, "startedAt": "2026-08-27T13:17:45.134Z" }` (= 22:17:45 KST).
- Process 38020 alive, listening on 127.0.0.1:8787, command line `node ...\bin\agy-tokens.js --serve --port 8787`.
- Git history of `src/html-report.js` / `src/serve.js`:
  - `2e68fff` 22:04:53 KST — v2 rework (server start is AFTER this)
  - `ad82d96` 22:22:28 KST — statusline http link (server start is BEFORE this)
  - `ca9499c` 22:54:33 KST — dynamic locale
  - `166efe8` 00:55:57 KST — 21 locales + filters
  - `52d0298` 05:45:52 KST — filter fix + stacked chart (latest)
- The server process loaded its modules at 22:17:45 KST, i.e. the v2 code from `2e68fff`. Node caches modules in memory; later file edits do not affect the running process.

### E3. v2-era code lacks dailyModels and the filter engine (STATICALLY_VERIFIED)
`git show 2e68fff:src/html-report.js`:
```
DASHBOARD_PAYLOAD_VERSION = 2
has dailyModels: false
has renderSvg: true
has getFilteredData: false
has filterState: false
```
So the running server's `buildDashboardPayload` cannot emit `dailyModels`, and its embedded client had no filters at all.

### E4. On-disk artifacts are fresh v3 (CONFIG_VERIFIED)
`~/.gemini/antigravity-dashboard/`:
- `dashboard-data.json`: `version=3`, `hasDailyModels=True`, `dailyCount=30`, `lang=ko`, written 05:55:03 KST (statusline badge keeps overwriting it with v3 data).
- `dashboard.html`: 50,232 bytes, contains `dailyModels`, `data-range="today"`, `data-range="30d"`, `EventSource`; embedded payload `version=3, lang=ko, hasDailyModels=true`; written 05:41:46 KST.
- The served `/` HTML is this same fresh v3 file (50,232 bytes).

So the browser loads a **v3 client** (from disk or from `/`), then the **v2 server** SSE-pushes a v2 payload over it. The client's `es.onmessage` handler ([`src/html-report.js`](src/html-report.js:828)) accepts ANY payload with no version check and calls `render(p)`.

### E5. vm-sandbox reproduction (TEST_OBSERVED)
`scripts/_repro_v2_payload.js` extracts the real client IIFE from `renderDashboardHtml()` and runs it in a `vm` sandbox with a minimal DOM.

**Case A — v2 payload (no dailyModels) into v3 client:**
```
[Bug 1] chart stacked bars=0 baseline-only rects=30  → chart is BLANK: true
[30d default] modelsWrap has model rows: true  (uses p.models directly)
[30d default] tableWrap rows: 31
[Bug 3] after 'today': modelsWrap empty-state: true
[Bug 3] daily table zeroed: true
[Bug 3] after '7d': modelsWrap has rows: false
```

**Case B — v3 payload (control):**
```
chart stacked bars=3 (renders correctly)
after 'today': modelsWrap has rows: true
daily table rows after 'today': 2 (header + 1 day)
```

**Case C — default range:** HTML has `data-range="30d"` active and `filterState = { range: '30d', ... }`.

## Root-Cause Analysis (code-line evidence)

### Bug 1 — chart goes blank
Chain: SSE `onmessage` → `render(p)` → `renderChart(p)` ([`src/html-report.js`](src/html-report.js:529)) → `renderSvg((p && p.daily) || [], p ? p.dailyModels : null)` ([`src/html-report.js`](src/html-report.js:531)).

In `renderSvg` ([`src/html-report.js`](src/html-report.js:480)):
- `var dm = dailyModels || {};` → `{}` for v2 payloads.
- Per day: `var dateModels = dm[daily[i].date] || {};` → `{}` → every `mr` is undefined → `tok = 0` → no segments pushed ([`src/html-report.js`](src/html-report.js:492-497)).
- `st.segs.length === 0` → only a 1px baseline rect is drawn ([`src/html-report.js`](src/html-report.js:510-512)).

Result: 30 baseline rects, zero stacked bars → visually blank chart. The chart "shows briefly" because the embedded v3 payload renders correctly on load, then the first SSE push (within 5s) blanks it. **Confirmed by E5 Case A.**

### Bug 3 — Today/Yesterday/7d show nothing
Chain: date button click → `filterState.range = range` → `applyFilters()` ([`src/html-report.js`](src/html-report.js:730-743)) → `getFilteredData(lastPayload)` ([`src/html-report.js`](src/html-report.js:610)).

In `getFilteredData`:
- `var dailyModels = p.dailyModels || {};` → `{}` for v2 payloads ([`src/html-report.js`](src/html-report.js:613)).
- Models re-aggregation loop: `var dateModels = dailyModels[dateKey]; if (!dateModels) continue;` → skips every date → `modelAgg` stays empty → `filteredModels = []` → `renderModels` shows the empty-state ([`src/html-report.js`](src/html-report.js:641-670), [`src/html-report.js`](src/html-report.js:561-563)).
- Daily re-aggregation: `var dm = dailyModels[dateKey2];` → undefined → all totals stay 0 → zeroed rows ([`src/html-report.js`](src/html-report.js:675-697)).

Why 30d "works": with `range='30d'`, `render()` takes the fast path — `filtersActive` is false ([`src/html-report.js`](src/html-report.js:792)) — and renders `p.models` / `p.daily` directly ([`src/html-report.js`](src/html-report.js:796-797)), which exist in the v2 payload. Any other range forces `applyFilters()` → the `dailyModels`-dependent path → empty. **Confirmed by E5 Case A.**

### Bug 2 — default is 30d
Current state confirmed: `filterState = { range: '30d', ... }` ([`src/html-report.js`](src/html-report.js:392)) and the 30d button is `active` in the HTML ([`src/html-report.js`](src/html-report.js:914)). This matches REQ-213 ("Default filter state: 30 days + all models selected"). REQ-241 changes the requirement to Today — a one-line change, not a bug.

### Why the stale server survives (contributing factor)
[`ensureServerRunning()`](src/dashboard-link.js:248) probes the recorded port; if anything answers, it returns `started: false` and never restarts ([`src/dashboard-link.js`](src/dashboard-link.js:257-259)). The port file has no version/code-revision field, so there is no way to detect that the answering server runs old code. The server also never re-reads its modules (Node caches `require` results), so it stays v2 until killed.

### Stale-data-file check (task item 5)
`writeDashboardFiles` ([`src/html-report.js`](src/html-report.js:997)) is only called by `--html` and `--hook --write-dashboard` paths. The v2-era `serve.js` does NOT write dashboard files (verified: `v2 serve.js writes dashboard files: false`), so the server cannot overwrite `dashboard-data.json`. The on-disk files are fresh v3 (E4). The stale-data-file sub-hypothesis is **disproven** — the only stale channel is the SSE stream.

## Hypothesis Verdict

| Hypothesis | Verdict | Evidence |
|---|---|---|
| Stale v2 server pushes payloads without `dailyModels` → blank chart + empty filtered tables | **CONFIRMED** | E1, E2, E3, E5 |
| On-disk `dashboard-data.json` stale (old schema) | **REJECTED** | E4 (v3, fresh, ko) |
| v3 client itself broken | **REJECTED** | E5 Case B (control renders correctly) |
| Default range bug (should already be Today) | **NOT A BUG** | REQ-213 vs REQ-241 requirement change |

## Recommended Fix Plan (for Code mode)

### Fix 1 — client version guard (primary, robust)
In the client script of [`renderDashboardHtml()`](src/html-report.js:384):
- In `es.onmessage` ([`src/html-report.js`](src/html-report.js:828)): ignore payloads with `p.version < 3` (or missing `dailyModels`). Do NOT overwrite `window.__AGY_DASH__` and do NOT call `render(p)` for stale payloads.
- In `pollOnce`'s `onload` ([`src/html-report.js`](src/html-report.js:816)): same guard before `render(window.__AGY_DASH__)`.
- Fallback per REQ-244: when a stale payload arrives, keep polling `dashboard-data.js` (fresh v3 data written by the badge). Optionally render a single-series fallback chart from `p.daily` when `dailyModels` is absent (REQ-244's "chart falls back to single-series bars").

### Fix 2 — default range Today (REQ-241)
- Change `filterState` initial range from `'30d'` to `'today'` ([`src/html-report.js`](src/html-report.js:392)).
- Move the `active` class from the 30d button to the Today button ([`src/html-report.js`](src/html-report.js:914)).
- Note: `render()`'s fast path condition ([`src/html-report.js`](src/html-report.js:792)) must be updated so `range !== '30d'` no longer forces `applyFilters()` on initial load with a v2 payload — or, with Fix 1 in place, stale payloads never reach `render()` anyway.

### Fix 3 — server staleness prevention (defense in depth)
- Option A (minimal): document/automate server restart. The user must kill pid 38020 (`taskkill /PID 38020 /F`) or restart VS Code; the badge will respawn a fresh server on the next render.
- Option B (code): record a code revision/version in `dashboard-server.json` (`writePortFile` in [`src/dashboard-link.js`](src/dashboard-link.js:152)) and have `ensureServerRunning()` compare it against the current `DASHBOARD_PAYLOAD_VERSION`; on mismatch, kill the old pid and respawn. This requires care with pid reuse and cross-process safety.
- Option C (code): make `--serve` re-read fresh code — not possible for a long-running Node process without a restart; Option B is the practical equivalent.

### Fix 4 — tests (REQ-245)
- Extend Suite 15 in [`test/run-tests.js`](test/run-tests.js:1166): feed a v2-schema payload into the extracted client script (vm sandbox, as in `scripts/_repro_v2_payload.js`) and assert: stale payload ignored, chart keeps previous render, filters keep working.
- Assert default range is `today` in the generated HTML.

## Affected File List
- [`src/html-report.js`](src/html-report.js) — client script (SSE handler, filterState default, render fast path), `buildDashboardPayload` (already correct).
- [`src/dashboard-link.js`](src/dashboard-link.js) — `ensureServerRunning` / `writePortFile` (only if Option B is chosen).
- [`test/run-tests.js`](test/run-tests.js) — Suite 15 additions.
- No changes to `src/serve.js` required for the client-side fix (its v3 code is already correct; the running instance is simply old).

## Issues Discovered
1. **No payload version check in the client** — the root detection gap. Any future schema change will reproduce this class of bug for every user with a long-running server.
2. **`ensureServerRunning` cannot detect stale code** — liveness probe only; a v2 server answers the TCP probe forever.
3. **`dashboard-server.json` has no version field** — nothing to compare against.
4. The user's environment currently has a stale server (pid 38020) that must be restarted for the fix to take effect in the real browser.

## Next Step Recommendations
1. Code mode implements Fix 1 + Fix 2 (+ Fix 4 tests), per REQ-240/241/242/244/245.
2. User (or Code mode via guidance) restarts the stale server: `taskkill /PID 38020 /F`; the next statusline render respawns a fresh v3 server.
3. VP decides whether Option B (auto-restart on version mismatch) is in scope for this session or deferred.

## Environment Notes
- Diagnostic scripts created under `scripts/` (`_diag_dashboard.ps1`, `_probe_dashboard_server.js`, `_repro_v2_payload.js`, `_v2_html_report.js`, `_v2_serve.js`) are temporary and should be removed after Code mode completes the fix.
- No test-env issues encountered; the vm-sandbox approach worked on the first run.
