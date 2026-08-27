# Code Task Report: v3.1 — Date Filter Bug Fix + Dashboard Layout Redesign (REQ-230..237)

## Task Summary
Fixed the date filter bug where only 30d worked correctly, redesigned the dashboard layout (chart moved to top, always-visible 30d stacked per-model chart), made summary cards fixed full-data with a conditional 5th custom-range card, and reordered date filter buttons. All changes in [`src/html-report.js`](src/html-report.js) client JS/HTML/CSS + suite 15 test extensions in [`test/run-tests.js`](test/run-tests.js).

---

## Root Cause Analysis (REQ-230)

The date filter bug had **two compounding causes**, both in `applyFilters()` ([src/html-report.js#L666](src/html-report.js:666)):

1. **Card replacement**: `applyFilters()` replaced ALL 4 summary cards with a single filtered card (`document.getElementById('cards').innerHTML = cardHtml(label, s)`). On Today/Yesterday/7d/Custom, the 4 fixed cards vanished and were replaced by one card — the dominant visible symptom ("don't display properly").
2. **Chart collapse**: `applyFilters()` re-rendered the chart from the date-sliced `filtered.daily`. For Today/Yesterday the chart collapsed to 1 bar, making the page look broken.
3. **Custom range fall-through**: when `from`/`to` were unset, the custom branch fell through to a full-range slice with no UI feedback (no 5th card, full table) — indistinguishable from 30d.

The underlying `startIdx`/`endIdx` slicing for today/yesterday/7d was actually correct; the breakage was in what `applyFilters()` did with the result.

## Actions Taken

### 1. Date filter bug fix (REQ-230, REQ-235, REQ-236)
- [`applyFilters()`](src/html-report.js:666) no longer touches the chart and no longer replaces the 4 summary cards. It now renders only: Daily Detail table + Models table (both respond to date + model filters).
- Summary cards are **always** the 4 full-data cards from `p.summaries` (today/yesterday/last7d/last30d) in both `render()` and `applyFilters()`.
- **5th custom card**: when `filterState.range === 'custom'` AND both `from`/`to` are set, a 5th card labeled `I18N.filterCustom` is appended showing custom-range tokens + cost + sessions/turns/cache sub-line computed from `filtered.summary`. Removed for any non-custom range.
- Custom range robustness: if `from`/`to` don't overlap the 30-day window (`startIdx >= endIdx`), the slice is forced empty (`startIdx = endIdx = 0`) instead of silently showing full data ([src/html-report.js#L580](src/html-report.js:580)).
- Custom button click now calls `applyFilters()` unconditionally (previously skipped when range was custom, delaying feedback).

### 2. Layout reorder (REQ-231)
New `<main>` DOM order ([src/html-report.js#L851](src/html-report.js:851)):
1. Chart panel (`#chartTitle` + `#chart` + new `#chartLegend`)
2. `#cards`
3. `#filters` — date group first (today → yesterday → 7d → 30d → custom), then model group
4. Models panel (`#modelsTitle` + `#modelsWrap`)
5. Daily table panel (`#tableTitle` + `#tableWrap`)
6. `#empty`

### 3. Stacked per-model chart + legend (REQ-232, REQ-236)
- [`renderSvg(daily, dailyModels)`](src/html-report.js:474) now stacks one segment per selected model per day, sourced from `p.dailyModels[date]` (missing model → 0 contribution). Total bar height stays proportional to the day's total.
- Per-model colors from fixed 10-color palette `MODEL_COLORS` (cycled), index-stable via `allModels` order ([`modelColor()`](src/html-report.js:478)).
- Legend under the chart (`#chartLegend`, `.chart-legend`/`.legend-item`/`.legend-swatch` CSS) listing selected models with color swatches.
- New [`renderChart(p)`](src/html-report.js:530) wrapper renders SVG + legend; called from `render()` (full 30d data) and from the model-checkbox change handler — **never** from `applyFilters()`, so the chart is date-filter independent and always shows the full 30 days.
- Chart title unchanged (`#chartTitle`, 30 days).

### 4. Date filter button order (REQ-234)
Buttons reordered to today, yesterday, 7d, 30d, custom; 30d remains default-active.

### 5. Tables (REQ-235)
Models table + Daily Detail table continue to respond to both date and model filters via `getFilteredData()` (slicing logic verified correct; the visible bug was items 1–2 above).

### 6. Tests (REQ-237)
Extended suite 15 in [test/run-tests.js](test/run-tests.js) with 3 new tests:
- **v3.1 layout order**: chart panel before cards before filters before models before table before `#empty`; `#chartLegend` present; date group before model group.
- **Button order**: `data-range` attributes in exact order today/yesterday/7d/30d/custom; 30d is the default-active button.
- **Stacked chart + custom card JS**: `renderSvg(daily, dailyModels)` signature, `dailyModels[` indexing, `MODEL_COLORS`/`modelColor(`, `renderChart(`, legend rendering, `renderChart(lastPayload)` before `applyFilters()` in the model handler, 4 fixed `cardHtml(I18N.summary…)` calls, custom 5th-card condition + `filtered.summary`, and a negative assertion that `applyFilters()` never touches `#chart`.

---

## Result
- **Status**: COMPLETE
- `node --check src/html-report.js` → exit 0
- `node --check test/run-tests.js` → exit 0
- `node test/run-tests.js` → **112 passed, 0 failed** (109 existing + 3 new), 4294ms
- **Runtime DOM simulation** (temporary `test/tmp-v31-verify.js`, vm-sandboxed client script, deleted via Recycle Bin after use) verified all 6 behavior scenarios:
  1. Initial render: exactly 4 cards, 2-model legend, per-model colored stacked segments (3 model-day segments).
  2. Click Today: 4 cards retained (bug fixed), table = 1 row, models table excludes other model, chart byte-identical (not re-rendered).
  3. Click Custom without dates: inputs shown, still 4 cards (no premature 5th card).
  4. Set from/to: 5th "Custom" card appears, table slices to the 11-day range, chart still untouched.
  5. Uncheck model-beta: legend shrinks to 1, chart re-renders without model-beta, 5th card persists.
  6. Back to 30d: 5th card removed (exactly 4 cards).

## Constraints Compliance
- Zero new npm deps; inline CSS/JS only; `esc()` used for all dynamic strings (model names, dates, tooltips, legend labels).
- i18n: only existing keys used (`filterToday/Yesterday/7d/30d/Custom`, `summaryToday/Yesterday/7d/30d`) — no new keys, no locale changes needed.
- RTL: `[dir=rtl] .filter-group{flex-direction:row-reverse}` untouched and still asserted by tests.
- Filter state persists across SSE/poll updates: `render()` re-applies `applyFilters()` when filters are active (unchanged mechanism, now with correct card/chart behavior).

## Issues Discovered
- None blocking. Note: the chart's `bar-today` green highlight was replaced by per-model colors (required by the stacked design); the last-day emphasis is preserved via the axis label and tooltip.

## Next Step Recommendations
- VP may proceed to P6 (Final Ask Audit); all REQ-230..237 items are implemented and verified.
- Optional UX follow-up (not requested): persist filter state in `sessionStorage` so a page reload keeps the selection.

## Affected File List
- [`src/html-report.js`](src/html-report.js) (client JS: `renderSvg` stacked rewrite, `renderChart`, `applyFilters`, `render`, `getFilteredData` custom guard; HTML: DOM reorder + button order + legend container; CSS: legend styles, removed `bar-today`)
- [`test/run-tests.js`](test/run-tests.js) (suite 15: 3 new v3.1 tests)
- `test/tmp-v31-verify.js` (temporary runtime verification — created, executed, deleted via Recycle Bin)