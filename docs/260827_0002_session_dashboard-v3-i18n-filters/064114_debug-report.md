# Debug Task Report — v3.2 Technical Verification (REQ-240..245)

## Task Summary
Verification of the v3.2 stale-payload fixes and per-model Daily Detail feature against actual code and runtime. Scope: REQ-240 (server staleness), REQ-241 (default filter = today), REQ-243 (per-model sub-rows), REQ-244 (client stale-payload tolerance), REQ-245 (test suite), plus live gates, RTL/i18n regression, cleanup, and vm-sandbox end-to-end.

## Verdict
**PASS** — all 9 verification items confirmed with runtime evidence. No regressions found.

## Actions Taken

### 1. REQ-244 — Client stale-payload tolerance (static + runtime)
- [`src/html-report.js:395`](src/html-report.js:395): `isFreshPayload(p)` guard exists — `!!(p && p.version >= 3 && p.dailyModels)`.
- SSE handler [`src/html-report.js:878`](src/html-report.js:878): `if (!isFreshPayload(p)) return;` runs BEFORE `window.__AGY_DASH__ = p` and `render(p)` — stale payloads are fully ignored (no render, no overwrite).
- Polling handler [`src/html-report.js:857`](src/html-report.js:857): `if (isFreshPayload(window.__AGY_DASH__)) { render(...) } else if (lastPayload) { window.__AGY_DASH__ = lastPayload; }` — stale payloads never render and the last good payload is restored.
- `renderSvg` fallback [`src/html-report.js:500-521`](src/html-report.js:500): when a day has `totalTokens > 0` but no matching dailyModels segments, a single-series `.bar` rect is drawn from `daily[i].totalTokens` — chart never blank.
- `getFilteredData` fallback [`src/html-report.js:675-713`](src/html-report.js:675): `hasDailyModels` detection; when absent, models come from `p.models` and daily rows pass through as-is (`filteredDaily.push(dd)`) — tables never empty.

### 2. REQ-241 — Default filter = today
- [`src/html-report.js:392`](src/html-report.js:392): `filterState = { range: 'today', ... }`.
- [`src/html-report.js:962`](src/html-report.js:962): `<button class="filter-btn active" data-range="today">` — today is the active button in the template.
- First render calls `applyFilters()` (filtersActive is true because range ≠ '30d'), so today's data renders first.

### 3. REQ-243 — Per-model sub-rows
- [`src/html-report.js:553-578`](src/html-report.js:553): `renderTable(daily, dailyModels)` renders `↳ model` sub-rows under each date from `dailyModels[date]`, filtered by `filterState.models.has(mn)`, sorted by `subList.sort((a,b) => b.costUsd - a.costUsd)`.
- CSS [`src/html-report.js:946-948`](src/html-report.js:946): `.subrow td` styling + `[dir=rtl] .subrow td:first-child{padding-left:0;padding-right:20px}`.
- Fallback: `if (dateModels)` guard — plain rows only when dailyModels missing.

### 4. REQ-240 — Server staleness (static + runtime)
- [`src/dashboard-link.js:153-162`](src/dashboard-link.js:153): `writePortFile` records `payloadVersion: DASHBOARD_PAYLOAD_VERSION` (3).
- [`src/dashboard-link.js:267-292`](src/dashboard-link.js:267): `serverStale` = recorded port exists AND (version missing OR version < 3). Stale → probe-hit fast path skipped, default-port fast path skipped, fresh server spawned (auto-increments on EADDRINUSE).
- Runtime probe (ephemeral live server + temp port file):
  - `writePortFile` → `payloadVersion: 3` ✓
  - stale v2 record + live server → `null` (fast path skipped, respawn attempted) ✓
  - missing payloadVersion + live server → `null` (fast path skipped) ✓
  - fresh v3 record + live server → linked via fast path, `started: false` ✓

### 5. REQ-245 — Test suite
`node test/run-tests.js` → **116 passed, 0 failed, 116 total** (2820ms). Suite 18 (dashboard-link) = 11 tests green; Suite 3 (i18n) = 6 tests green; Suite 15 includes the 5 new REQ-241/243/244 tests, all green.

### 6. Live gates
- `AGY_LANG=ko node bin/agy-tokens.js --hook --raw --write-dashboard` → badge single-line, OSC 8 link present (`\x1b]8;;file:///...dashboard.html\x07📊 대시보드\x1b]8;;\x07`).
- Generated `dashboard.html` (ko): all 17 checks PASS — isFreshPayload guard, version+`dailyModels` checks, today active default, subrow CSS + RTL CSS, renderSvg fallback, getFilteredData fallbacks, subrow sort/filter/arrow, SSE + poll guard application. `lang="ko"`, Korean title/buttons/labels confirmed.
- `AGY_LANG=ar` → `dir="rtl"` + `lang="ar"` present; all 17 checks PASS.

### 7. Regression
- Suite 3 i18n parity green (6/6). RTL attribute intact in live ar output.

### 8. Cleanup
- `scripts/_verify_v32_stale_payload.js` deleted via Recycle Bin (PowerShell VisualBasic `DeleteFile` + `SendToRecycleBin`), removal confirmed (`Test-Path` → False).
- My own temp checker `_verify_live_gate.tmp.js` and an accidental 0-byte `3'` artifact from a failed cmd quoting attempt were also removed via Recycle Bin; `git status --porcelain` confirms no leftover artifacts from this verification.

### 9. vm-sandbox end-to-end
Ran the real client IIFE extracted from `renderDashboardHtml()` in a `vm` sandbox with a minimal DOM:
- **Case A (stale v2 payload, no dailyModels)**: chart NOT blank (fallback bars rendered: 1 stacked/fallback rect + 28 baselines), default range = today, daily table non-empty, models table non-empty (p.models fallback). 5/5 PASS.
- **Case B (fresh v3 payload, control)**: sub-rows rendered with arrow prefix, sorted cost-desc, yesterday-only model excluded by today filter. 4/4 PASS.
- **Case C**: SSE handler ignores stale payloads via isFreshPayload guard. 1/1 PASS.
- Total: **10 passed, 0 failed**.

## Result
Success. All REQ-240..245 requirements verified against actual code and runtime behavior with no regressions.

## Issues Discovered
- None in the implementation. One environment note: the first live-gate attempt used PowerShell `$env:` syntax in a cmd-interpreted terminal and failed with "The filename, directory name, or volume label syntax is incorrect"; resolved by using `cmd /c "set AGY_LANG=ko && ..."`. A 0-byte `3'` file was created by a nested-quoting attempt and was cleaned up via Recycle Bin.

## Next Step Recommendations
- VP: proceed to release. No code changes were made during this verification (audit-only).
- Optional follow-up: the suite-18 tests do not yet cover the REQ-240 stale-version respawn path directly (verified here via runtime probe); adding a unit test for `serverStale` would harden regression coverage.

## Affected File List
- `src/html-report.js` (verified, unmodified)
- `src/dashboard-link.js` (verified, unmodified)
- `test/run-tests.js` (executed, unmodified)
- `scripts/_verify_v32_stale_payload.js` (deleted via Recycle Bin per task instruction)
- `C:/Users/k1yt/.gemini/antigravity-dashboard/dashboard.html` (regenerated by live gate runs)
