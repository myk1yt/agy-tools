# Debug Task Report: v3.1 Technical Verification — Date Filter Fix + Layout Redesign (REQ-230..237)

## Task Summary
Independent verification of the v3.1 implementation report ([`203709_code-report.md`](203709_code-report.md)) against actual code in [`src/html-report.js`](../../src/html-report.js) and live runtime output. All 8 requirement items (REQ-230..237) plus live gates and regressions were checked with static code review, the full test suite, and a vm-sandboxed runtime DOM simulation running the REAL client script extracted from the live-generated `dashboard.html` against the REAL payload from `dashboard-data.json`.

## Verification Method
1. **Static code review** of [`applyFilters()`](../../src/html-report.js:715), [`getFilteredData()`](../../src/html-report.js:610), [`renderSvg()`](../../src/html-report.js:480), [`renderChart()`](../../src/html-report.js:529), [`render()`](../../src/html-report.js:783), and the HTML template ([`renderDashboardHtml()`](../../src/html-report.js:373)).
2. **Full test suite**: `node test/run-tests.js`.
3. **Live gates**: `AGY_LANG=ko` and `AGY_LANG=ar` runs of `node bin/agy-tokens.js --hook --raw --write-dashboard`, then inspection of the generated `C:/Users/k1yt/.gemini/antigravity-dashboard/dashboard.html`.
4. **Runtime DOM simulation** (temporary `test/tmp-v31-runtime-verify.js`, vm-sandboxed, deleted via Recycle Bin after use): executed the real client script with a minimal DOM mock, simulated filter clicks, and asserted user-facing effects (table row counts, card counts, chart byte-identity).

## Results per Requirement

### REQ-230 — Date filter fix: ✅ VERIFIED
- [`getFilteredData()`](../../src/html-report.js:610) slicing logic:
  - `today`: `startIdx = daily.length - 1` → last 1 day ✅
  - `yesterday`: `startIdx = daily.length - 2`, `endIdx = daily.length - 1` → 2nd-to-last day only ✅
  - `7d`: `startIdx = daily.length - 7` → last 7 days ✅
  - `30d`: `startIdx = 0` → all ✅
  - `custom`: from/to inclusive via `date >= from` / `date <= to` scans; non-overlapping ranges forced empty (`startIdx = endIdx = 0`) ✅
- [`applyFilters()`](../../src/html-report.js:715) re-renders BOTH the Daily Detail table (`tableWrap`) and Models table (`renderModels`) on every date filter change ✅
- Runtime simulation evidence (real payload: 30 days, 3 models):
  - Today → 1 table row, 4 cards retained, chart byte-identical
  - Yesterday → 1 table row, chart byte-identical
  - 7d → 7 table rows, chart byte-identical
  - 30d → 30 table rows
  - Custom from/to (day 5..15) → 11 rows (inclusive), 5th card appears
  - Custom non-overlapping (from day 20, to day 10) → 0 rows (forced empty, no silent full data)
- **Observation (design note, not a defect)**: clicking Custom with unset dates shows the date inputs and keeps the table at full 30d until dates are entered. This matches the implementation report's stated design ("inputs shown, still 4 cards, no premature 5th card"). The "does NOT silently show full data" guard applies to *set* non-overlapping dates, which is verified working (0 rows). The date inputs being visible is the UI feedback. If VP wants an empty table until dates are set, that is a UX change beyond the current spec.

### REQ-231 — Layout order: ✅ VERIFIED
DOM order in [`renderDashboardHtml()`](../../src/html-report.js:905) output: chart panel (`#chartTitle` + `#chart` + `#chartLegend`) → `#cards` → `#filters` (date group `#filterDateLabel` then model group `#modelFilters`) → models panel (`#modelsTitle` + `#modelsWrap`) → daily table (`#tableTitle` + `#tableWrap`) → `#empty`. Confirmed by suite 15 test "v3.1 layout order" and live HTML check (21/21 passed).

### REQ-232/236 — Stacked chart + legend: ✅ VERIFIED
- [`renderSvg(daily, dailyModels)`](../../src/html-report.js:480) stacks one segment per selected model per day from `p.dailyModels[date]`; missing model → 0 contribution; bar height proportional to day total ✅
- 10-color palette `MODEL_COLORS` with index-stable [`modelColor()`](../../src/html-report.js:475) ✅
- Legend rendered into `#chartLegend` with `.legend-swatch` colors ✅
- Chart NOT re-rendered on date filter change: runtime simulation confirmed chart `innerHTML` byte-identical after Today/Yesterday/7d/Custom clicks; re-rendered only on model checkbox change (`renderChart(lastPayload)` in the model handler) ✅
- Live evidence: initial chart had 32 per-model `<rect>` segments; unchecking a model re-rendered chart and shrank legend; re-checking restored byte-identical chart.

### REQ-233 — Summary cards: ✅ VERIFIED
- [`render()`](../../src/html-report.js:788) and [`applyFilters()`](../../src/html-report.js:722) both always render the 4 fixed cards from `p.summaries` (today/yesterday/last7d/last30d) ✅
- 5th custom card appears only when `filterState.range === 'custom' && filterState.from && filterState.to`, using `filtered.summary` ✅
- Runtime evidence: 4 cards initially; 4 cards after Today/Yesterday/7d/Custom-no-dates; 5 cards after setting from/to; back to 4 after returning to 30d.

### REQ-234 — Button order: ✅ VERIFIED
`data-range` attributes appear in order today → yesterday → 7d → 30d → custom ([`src/html-report.js`](../../src/html-report.js:911)); 30d has `class="filter-btn active"` as default. Confirmed by suite 15 test and live HTML check.

### REQ-235 — Tables respond to both filters: ✅ VERIFIED
Models table and Daily Detail table both re-render via `applyFilters()` on date filter clicks and model checkbox changes. Runtime evidence: Today → models table shrank to 1 row (only models active that day); model off → daily table re-aggregated to selected models only.

### REQ-237 — Tests: ✅ VERIFIED
`node test/run-tests.js` → **112 passed, 0 failed** (112 total), 3810ms. Suite 15 contains the 3 new v3.1 tests (layout order, button order, stacked chart + custom card JS), all passing.

### Live gates: ✅ VERIFIED
- `AGY_LANG=ko node bin/agy-tokens.js --hook --raw --write-dashboard` → badge single-line with OSC 8 link (`\x1b]8;;file:///...dashboard.html\x07📊 대시보드\x1b]8;;\x07`), Korean strings ✅
- Generated `dashboard.html`: 21/21 checks passed (lang="ko", DOM order, button order, 30d active, stacked chart JS, legend, custom card logic, applyFilters never touches #chart, no fetch(), Korean title) ✅
- `scripts/verify-i18n.js` → all steps completed successfully (ko → ja → ko restore, live /data.json endpoint) ✅

### Regression — RTL + i18n: ✅ VERIFIED
- `AGY_LANG=ar` → badge single-line with OSC 8 link, Arabic strings ✅
- Generated HTML: `dir="rtl"` on `<html>`, `lang="ar"`, Arabic title, `[dir=rtl] .filter-group{flex-direction:row-reverse}` CSS intact — 10/10 checks passed ✅
- Suite 3 i18n parity (21 locales, all keys) passes ✅

## Env Issues Fixed During Verification
- Env was originally **PowerShell env-var syntax rejected by the terminal** (`$env:AGY_LANG='ko'; node ...` → "The filename, directory name, or volume label syntax is incorrect") → fixed via `cmd /c "set AGY_LANG=ko&& node bin\agy-tokens.js ..."`.
- Env was originally **DOM mock missing `classList` and wrong event-dispatch shape** in the runtime simulation → fixed via `classList` shim and `fn({ target: cb })` call convention (test harness only, product code untouched).

## Result
**All REQ-230..237 items VERIFIED PASS.** 112/112 tests green, 21/21 live HTML checks, 28/29 runtime behavior checks (1 non-blocking design observation on custom-no-dates, see REQ-230 note), 10/10 RTL checks, i18n script green.

## Issues Discovered
- None blocking. One design observation: custom range with unset dates keeps the full table visible (inputs shown as feedback). Matches implementation report; flagging for VP awareness only.

## Next Step Recommendations
- VP may proceed to P6 (Final Ask Audit). All REQ-230..237 verified against code + runtime.
- Optional UX follow-up (not requested): empty the Daily Detail table until custom dates are set, if VP prefers that over the current inputs-visible design.

## Affected File List
- No product files modified during verification.
- Temporary verification scripts created and deleted via Recycle Bin: `test/tmp-v31-live-verify.js`, `test/tmp-v31-runtime-verify.js`, `test/tmp-v31-rtl-verify.js`.
