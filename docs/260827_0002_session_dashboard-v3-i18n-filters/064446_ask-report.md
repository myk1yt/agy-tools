# Ask (CPO) Full Audit Report — v3.2 Stale-Payload Fixes + Per-Model Daily Detail (REQ-240..244)

## Task Summary
Independent Full Audit of the v3.2 implementation against requirement checklist items REQ-240 through REQ-245. Each item was cross-validated 1:1 against actual source code in [`src/html-report.js`](src/html-report.js) and [`src/dashboard-link.js`](src/dashboard-link.js), plus test coverage in [`test/run-tests.js`](test/run-tests.js). The debug recommendation to add a suite-18 unit test for the stale-version respawn path is assessed as follow-up (non-blocking).

## Audit Scope
- **Requirements**: REQ-240 (chart blank fix + stale server), REQ-241 (default=today), REQ-242 (filter shows data), REQ-243 (per-model sub-rows), REQ-244 (stale-payload tolerance), REQ-245 (tests).
- **Source files verified**: [`src/html-report.js`](src/html-report.js) (lines 384-894 client script, 946-962 CSS/markup), [`src/dashboard-link.js`](src/dashboard-link.js) (lines 152-315).
- **Reports cross-referenced**: [`055700_debug-report.md`](055700_debug-report.md) (root cause), [`213800_code-report.md`](213800_code-report.md) (implementation), [`064114_debug-report.md`](064114_debug-report.md) (verification).

---

## [1. Philosophy & UX/UI Diagnostics]

### User Intent
The user reported three real-browser bugs: (1) chart shows briefly then goes blank, (2) default date filter should be Today not 30d, (3) clicking Today/Yesterday/7d shows nothing in tables. Plus a new feature: per-model Daily Detail sub-rows. The root cause was a stale v2 background server pushing payloads without `dailyModels` into a v3 client.

### Intent Alignment
The implementation addresses all three bugs at their root cause (stale payload detection + tolerance) rather than patching symptoms. The default filter change (REQ-241) is a clean one-line requirement change. The per-model sub-rows (REQ-243) add the requested detail without breaking existing layout. The defense-in-depth approach (client guard + server version tracking + stale respawn) is the correct architectural response.

### UX Assessment
- **Chart blank fix**: The `isFreshPayload` guard prevents stale v2 SSE pushes from blanking the chart. The `renderSvg` fallback ensures even degraded payloads render single-series bars. Users will never see a blank chart.
- **Default = Today**: Users opening the dashboard see today's data immediately, which matches the stated expectation. The `applyFilters()` path runs on first render because `range !== '30d'`.
- **Filter functionality**: With fresh v3 payloads, all date ranges correctly slice data and re-aggregate models. With stale v2 payloads, the degraded fallback prevents empty tables.
- **Sub-rows**: The `↳` prefix and dimmed styling clearly distinguish sub-rows from date rows. Cost-desc sort puts the most expensive model first. RTL padding is handled.

---

## [2. 1:1 Cross-Validation Results]

### REQ-240 — Chart must NOT go blank after SSE/poll updates ✅

**Requirement**: Root cause diagnosed (stale v2 server pushes payloads without dailyModels); client must tolerate/ignore stale payloads and fall back to polling fresh dashboard-data.js.

**Source evidence**:

| Check | Location | Status |
|---|---|---|
| `isFreshPayload(p)` guard exists | [`src/html-report.js:395`](src/html-report.js:395) — `!!(p && p.version >= 3 && p.dailyModels)` | ✅ |
| SSE handler ignores stale before render | [`src/html-report.js:878`](src/html-report.js:878) — `if (!isFreshPayload(p)) return;` runs BEFORE `window.__AGY_DASH__ = p` (line 879) and `render(p)` (line 880) | ✅ |
| Polling handler guards before render | [`src/html-report.js:857`](src/html-report.js:857) — `if (isFreshPayload(window.__AGY_DASH__)) { render(...) } else if (lastPayload) { window.__AGY_DASH__ = lastPayload; }` | ✅ |
| Server records `payloadVersion` | [`src/dashboard-link.js:158`](src/dashboard-link.js:158) — `payloadVersion: DASHBOARD_PAYLOAD_VERSION` (= 3, per [`src/html-report.js:31`](src/html-report.js:31)) | ✅ |
| Stale detection logic | [`src/dashboard-link.js:267-269`](src/dashboard-link.js:267) — `serverStale = recordedPort !== null && (recordedVersion === null || recordedVersion < DASHBOARD_PAYLOAD_VERSION)` | ✅ |
| Stale skips probe-hit fast path (step 1) | [`src/dashboard-link.js:272`](src/dashboard-link.js:272) — `if (recordedPort !== null && !serverStale && ...)` | ✅ |
| Stale skips default-port fast path (step 3) | [`src/dashboard-link.js:290`](src/dashboard-link.js:290) — `if (recordedPort !== preferredPort && !serverStale && ...)` | ✅ |
| Stale falls through to spawn (step 4) | [`src/dashboard-link.js:294-314`](src/dashboard-link.js:294) — spawn intent + detached child process | ✅ |

**Verdict**: ✅ PASS. Both client-side (guard + fallback) and server-side (version tracking + stale respawn) are implemented correctly. The stale server is detected via `payloadVersion` mismatch and a fresh server is spawned.

---

### REQ-241 — Date filter default must be 오늘 (Today) ✅

**Requirement**: Default filter state is Today, not 30d.

**Source evidence**:

| Check | Location | Status |
|---|---|---|
| `filterState.range` default = `'today'` | [`src/html-report.js:392`](src/html-report.js:392) — `var filterState = { range: 'today', ... }` | ✅ |
| Today button has `active` class | [`src/html-report.js:962`](src/html-report.js:962) — `<button class="filter-btn active" data-range="today">` | ✅ |
| 30d button does NOT have `active` | Search confirmed only `today` has `active` in the template | ✅ |
| First render triggers `applyFilters()` | [`src/html-report.js:832`](src/html-report.js:832) — `filtersActive = filterState.range !== '30d'` → true → `applyFilters()` at line 834 | ✅ |

**Verdict**: ✅ PASS. Default is Today in both JS state and HTML markup. First render correctly takes the filter path.

---

### REQ-242 — Clicking 오늘/어제/최근7일 must show filtered tables ✅

**Requirement**: Today/Yesterday/7d buttons must show filtered Models Usage & Cost table AND Daily Detail table.

**Source evidence**:

| Check | Location | Status |
|---|---|---|
| Date range slicing logic | [`src/html-report.js:650-668`](src/html-report.js:650) — `today`: last 1 day; `yesterday`: second-to-last day; `7d`: last 7 days; `30d`: all; `custom`: from/to bounds | ✅ |
| `applyFilters()` calls `getFilteredData` + renders both tables | [`src/html-report.js:755-760`](src/html-report.js:755) — `renderTable(filtered.daily, lastPayload.dailyModels)` + `renderModels(filtered.models)` | ✅ |
| Date button click handler calls `applyFilters()` | [`src/html-report.js:773-781`](src/html-report.js:773) — sets `filterState.range`, updates active class, calls `applyFilters()` | ✅ |
| Degraded fallback (no dailyModels): models from `p.models` | [`src/html-report.js:675-679`](src/html-report.js:675) — `if (!hasDailyModels) { ... filteredModels.push(srcModels[fmi]); }` | ✅ |
| Degraded fallback (no dailyModels): daily rows pass through | [`src/html-report.js:713`](src/html-report.js:713) — `if (!hasDailyModels) { filteredDaily.push(dd); continue; }` | ✅ |
| Fresh v3 path: models re-aggregated from `dailyModels` | [`src/html-report.js:681-700`](src/html-report.js:681) — loops `slicedDates`, aggregates per-model stats from `dailyModels[dateKey]` | ✅ |
| Fresh v3 path: daily re-aggregated from `dailyModels` | [`src/html-report.js:710-738`](src/html-report.js:710) — sums per-model metrics into daily totals | ✅ |

**Verdict**: ✅ PASS. Both fresh and degraded paths produce non-empty tables for all date ranges. The root cause (stale v2 payload → empty `dailyModels` → empty tables) is fixed by the `isFreshPayload` guard (stale payloads never reach `render`) and the `hasDailyModels` fallback (degraded payloads still show data).

---

### REQ-243 — Daily Detail table gains per-model sub-rows ✅

**Requirement**: Each date row expands to per-model rows (models used that day), respecting the model filter.

**Source evidence**:

| Check | Location | Status |
|---|---|---|
| `renderTable(daily, dailyModels)` signature | [`src/html-report.js:553`](src/html-report.js:553) — accepts both params | ✅ |
| Sub-row rendering under each date | [`src/html-report.js:565-578`](src/html-report.js:565) — `var dateModels = dm[d.date]; if (dateModels) { ... }` | ✅ |
| Model filter respected | [`src/html-report.js:569`](src/html-report.js:569) — `filterState.models.has(mn)` | ✅ |
| Cost-desc sort | [`src/html-report.js:571`](src/html-report.js:571) — `subList.sort(function(a, b) { return (b.costUsd || 0) - (a.costUsd || 0); })` | ✅ |
| Arrow prefix `↳` | [`src/html-report.js:574`](src/html-report.js:574) — `'<tr class="subrow"><td>\\u21b3 '` | ✅ |
| All metric columns populated | [`src/html-report.js:574-576`](src/html-report.js:574) — sessions, turns, input, cached, output, total, cache%, cost, savings | ✅ |
| Fallback when `dailyModels` missing | [`src/html-report.js:566`](src/html-report.js:566) — `if (dateModels)` guard → plain rows only | ✅ |
| CSS: subrow styling | [`src/html-report.js:946`](src/html-report.js:946) — `.subrow td{color:var(--dim);font-size:11px}` | ✅ |
| CSS: subrow indent | [`src/html-report.js:947`](src/html-report.js:947) — `.subrow td:first-child{padding-left:20px}` | ✅ |
| CSS: RTL support | [`src/html-report.js:948`](src/html-report.js:948) — `[dir=rtl] .subrow td:first-child{padding-left:0;padding-right:20px}` | ✅ |
| `applyFilters()` passes `dailyModels` | [`src/html-report.js:759`](src/html-report.js:759) — `renderTable(filtered.daily, lastPayload.dailyModels)` | ✅ |
| `render()` fast path passes `dailyModels` | [`src/html-report.js:836`](src/html-report.js:836) — `renderTable(p.daily || [], p.dailyModels)` | ✅ |

**Verdict**: ✅ PASS. Sub-rows render correctly with all required features: model filter, cost-desc sort, arrow prefix, full metrics, CSS styling, RTL support, and stale-tolerant fallback.

---

### REQ-244 — Client must gracefully handle payloads lacking dailyModels ✅

**Requirement**: Chart falls back to single-series bars; SSE stale payloads are ignored in favor of fresh polling data.

**Source evidence**:

| Check | Location | Status |
|---|---|---|
| `isFreshPayload` blocks stale payloads | [`src/html-report.js:395`](src/html-report.js:395) + SSE handler line 878 + poll handler line 857 | ✅ |
| `renderSvg` fallback: single-series bar from `d.totalTokens` | [`src/html-report.js:500-504`](src/html-report.js:500) — `if (segs.length === 0 && (daily[i].totalTokens || 0) > 0) { fallback = true; dayTotal = daily[i].totalTokens; }` | ✅ |
| Fallback bar uses default `.bar` class | [`src/html-report.js:516-519`](src/html-report.js:516) — `class="bar"` (default accent, no model color) | ✅ |
| Baseline-only 1px rect for empty days | [`src/html-report.js:520-521`](src/html-report.js:520) — `else if (st.segs.length === 0) { ... height="1" class="bar" }` | ✅ |
| `getFilteredData` degraded: `hasDailyModels` detection | [`src/html-report.js:639-646`](src/html-report.js:639) — iterates `dailyModels` keys to detect non-empty | ✅ |
| Degraded: models from `p.models` | [`src/html-report.js:675-679`](src/html-report.js:675) | ✅ |
| Degraded: daily rows pass through | [`src/html-report.js:713`](src/html-report.js:713) | ✅ |
| Polling restores `lastPayload` when stale | [`src/html-report.js:859-860`](src/html-report.js:859) — `else if (lastPayload) { window.__AGY_DASH__ = lastPayload; }` | ✅ |

**Verdict**: ✅ PASS. Three layers of defense: (1) stale payloads never render, (2) chart falls back to single-series bars if `dailyModels` is absent but `totalTokens > 0`, (3) tables fall back to `p.models`/`p.daily` when `hasDailyModels` is false.

---

### REQ-245 — All tests pass; suite 15 updated ✅

**Requirement**: Suite 15 updated for new behavior (default=today, per-model daily rows, stale-payload tolerance).

**Source evidence** (from [`test/run-tests.js`](test/run-tests.js)):

| Test | Line | Covers | Status |
|---|---|---|---|
| Date filter buttons order + today default active | 1543 | REQ-241 | ✅ |
| Stale payload guard (isFreshPayload, SSE + poll) | 1568 | REQ-244 | ✅ |
| renderSvg single-series fallback | 1592 | REQ-244 | ✅ |
| getFilteredData degraded fallback | 1607 | REQ-244 | ✅ |
| renderTable sub-rows (signature, .subrow, arrow, sort, RTL) | ~1614 | REQ-243 | ✅ |
| Full suite execution | — | 116 passed, 0 failed (per debug report) | ✅ |

**Verdict**: ✅ PASS. 5 new/updated tests cover all v3.2 behavior. Full suite green.

---

## [3. Inquiries for VP & User]

### Inquiry 1: Suite-18 stale-version respawn unit test — follow-up or blocking?

**Context**: The debug report ([`064114_debug-report.md`](064114_debug-report.md), line 67) recommends adding a unit test for the REQ-240 `serverStale` detection path in `ensureServerRunning`. Currently this is verified only via a runtime probe (ephemeral live server + temp port file with stale version).

**Analysis**:
- The existing `writePortFile` test at [line 1910](test/run-tests.js:1910) does NOT assert `written.payloadVersion === 3` — a minor gap.
- The existing `ensureServerRunning` tests at [lines 1944-1991](test/run-tests.js:1944) test live-server probe, spawn intent, and null fallback — but none write a stale record (`payloadVersion: 2` or missing) with a live port and assert `ensureServerRunning` returns `null` (skips fast path).
- The `serverStale` logic itself is simple: a boolean computed from `recordedVersion === null || recordedVersion < DASHBOARD_PAYLOAD_VERSION`, used as a guard in two `if` conditions (lines 272, 290). The risk of regression is low.
- The runtime probe in the debug report verified all 4 scenarios with live evidence.

**Recommendation**: **Follow-up, not blocking.** The implementation is correct, verified via runtime probe, and the logic is simple enough that regression risk is low. However, adding two assertions would harden coverage:
1. `writePortFile` test: assert `written.payloadVersion === DASHBOARD_PAYLOAD_VERSION`.
2. New test: write a stale port file (`payloadVersion: 2`) with a live port → assert `ensureServerRunning` returns `null` (or spawns, depending on entryJs).

**Trade-off**: Adding the test takes ~15 min of Code mode effort. The benefit is regression protection if someone refactors `ensureServerRunning` and accidentally removes the `!serverStale` guards. The cost is minimal.

### Inquiry 2: Stale server (pid 38020) still running

**Context**: The code report ([`213800_code-report.md`](213800_code-report.md), line 56) notes that the currently running stale v2 server (pid 38020) is NOT killed by the code change (per task constraint). The user must restart it.

**Question for VP**: Has the user been informed that they need to restart the stale server (`taskkill /PID 38020 /F` or restart agy) to see the fix live in the real browser? The code fix prevents future stale servers, but the currently running one will continue pushing v2 payloads until killed. The client-side `isFreshPayload` guard will protect against it, but the user will see "stale" behavior (polling fallback) rather than live SSE updates until restart.

---

## [4. Final Verdict]

### Summary Table

| REQ | Description | Verdict | Evidence |
|---|---|---|---|
| REQ-240 | Chart blank fix + stale server detection | ✅ PASS | `isFreshPayload` guard (SSE+poll), `payloadVersion` in port file, `serverStale` detection in `ensureServerRunning` |
| REQ-241 | Default filter = Today | ✅ PASS | `filterState.range = 'today'`, today button `active`, first render triggers `applyFilters()` |
| REQ-242 | Filter buttons show data | ✅ PASS | `getFilteredData` slicing for all ranges, degraded fallback for stale payloads, `applyFilters()` renders both tables |
| REQ-243 | Per-model Daily Detail sub-rows | ✅ PASS | `renderTable` sub-rows with model filter, cost-desc sort, arrow prefix, CSS+RTL, both render paths pass `dailyModels` |
| REQ-244 | Stale-payload tolerance | ✅ PASS | `isFreshPayload` blocks stale, `renderSvg` single-series fallback, `getFilteredData` degraded mode, polling restores `lastPayload` |
| REQ-245 | Tests updated | ✅ PASS | 5 new/updated tests in suite 15, 116 passed / 0 failed |

### Devil's Advocate Probe

1. **What if `dailyModels` exists but is empty `{}`?** — `isFreshPayload` checks `p.dailyModels` which is truthy for `{}`. However, `getFilteredData`'s `hasDailyModels` detection loop (lines 639-646) iterates keys and finds none → `hasDailyModels = false` → degraded fallback activates. Chart's `renderSvg` finds no segments → fallback bar from `d.totalTokens`. **No vulnerability.**

2. **What if a fresh v3 payload arrives via SSE, then a stale v2 payload arrives?** — The stale payload hits `if (!isFreshPayload(p)) return;` at line 878 and is fully ignored. `window.__AGY_DASH__` retains the v3 payload. `lastPayload` retains the v3 payload. **No vulnerability.**

3. **What if `payloadVersion` is a float (e.g., 3.0)?** — `Number.isInteger(record.payloadVersion)` at line 267 returns `true` for `3.0` (JavaScript treats `3.0` as integer). `recordedVersion < DASHBOARD_PAYLOAD_VERSION` → `3 < 3` → `false`. Server is treated as fresh. **Correct behavior.**

4. **What if the port file is manually edited to have `payloadVersion: 999`?** — `recordedVersion = 999`, `999 < 3` → `false`, `serverStale = false`. Server is treated as fresh. This is a non-issue: a higher version would mean newer code, which is not stale. **Correct behavior.**

5. **Race condition: stale server respawns on same port?** — The stale server is still running on port 8787. The new spawn attempts to bind 8787, gets EADDRINUSE, and `serve.js` auto-increments to 8788+. The port file is rewritten with the new port + `payloadVersion: 3`. The stale server continues running on 8787 but is never linked again (port file points to the new port). **Correct behavior** — the stale server is orphaned, not killed, but harmless.

### Final Verdict

**PASS ✅**

All six requirements (REQ-240 through REQ-245) are fully implemented and independently verified against source code. The implementation addresses the root cause (stale v2 server) with defense-in-depth: client-side payload guarding, server-side version tracking, and automatic stale-server respawn. The per-model sub-rows feature is complete with proper filtering, sorting, styling, and RTL support. Test coverage is adequate with 5 new/updated tests and 116 total passing.

The suite-18 stale-version respawn test recommendation is a **non-blocking follow-up** — the implementation is correct and runtime-verified, and the logic is simple enough that regression risk is low.

**Recommended next step**: VP proceeds to P7 review. User should be reminded to restart the stale server (pid 38020) to see live SSE updates in the real browser.

---

## Issues Discovered
1. **Minor test gap**: `writePortFile` test at [line 1910](test/run-tests.js:1910) does not assert `written.payloadVersion`. Non-blocking; recommend adding in follow-up.
2. **No suite-18 test for `serverStale` path**: The stale-version respawn logic is verified only via runtime probe, not unit test. Non-blocking; recommend adding in follow-up.
3. **Stale server (pid 38020) still running**: User must manually restart to see live SSE. Client-side guard protects against it, but polling fallback is less efficient than live SSE.

## Next Step Recommendations
1. VP proceeds to P7 review — all v3.2 requirements met.
2. Inform user to restart stale server (pid 38020) for live SSE.
3. Follow-up (non-blocking): add `payloadVersion` assertion to `writePortFile` test + `serverStale` unit test to suite 18.

## Affected File List
- [`src/html-report.js`](src/html-report.js) — verified (not modified)
- [`src/dashboard-link.js`](src/dashboard-link.js) — verified (not modified)
- [`test/run-tests.js`](test/run-tests.js) — verified (not modified)
- [`docs/260827_0002_session_dashboard-v3-i18n-filters/requirement-checklist.md`](docs/260827_0002_session_dashboard-v3-i18n-filters/requirement-checklist.md) — verified (not modified)
