# Code Light Task Report

## Task Summary
Two UI tweaks to the agy-tokens dashboard in `src/html-report.js`:
1. **Chart hover tooltip**: Added a dynamic `<text>` label (`chartHoverLabel`) in the SVG chart that appears on bar hover, showing the date and formatted token count (e.g., "2026-08-27 · 1.30M tokens").
2. **Estimate panel trim**: Removed "이번 달 누적" (MTD) and "최근 30일 총 사용량" (30d total) from the estimate panel, keeping only "일평균사용량" (daily average) and "월말예상" (month-end projection).

## Actions Taken

### Item 1 — Chart hover tooltip
1. Added `window.__showLabel` and `window.__hideLabel` helper functions to the clientScript IIFE (global scope for inline SVG event handler access).
2. Added `var _ht` computation in `renderSvg` loop to pre-build the hover text per date (`date · formattedTokens tokens`).
3. Added `onmouseover="__showLabel(...)"` and `onmouseout="__hideLabel()"` handlers to both fallback bars and per-model segment bars.
4. Added `<text id="chartHoverLabel" ...>` element to the SVG return with `display:none;pointer-events:none` (hidden by default, mouse-transparent to avoid hover flickering).

### Item 2 — Estimate panel trim
1. Removed `estMtdLabel`/`est30dLabel` i18n update lines from `updateI18N`.
2. Removed `['estMtdValue', ...]` and `['est30dValue', ...]` entries from the `renderEstimates` `pairs` array (now 2 items instead of 4).
3. Cleaned up `computeEstimates` return value to remove unused `mtdTokens`, `mtdCost`, `total30Tokens`, `total30Cost` properties (kept the computation logic since `mtdTokens` feeds into `monthEndTokens` and `avg30Tokens` is used in the daily average label detail).
4. Removed MTD and 30d `<div class="est-item">` elements from the HTML template's `est-grid`.

### Test fixes
1. Updated `estIds` assertion array (12 → 6 IDs) to match the 2-item panel.
2. Updated `updateI18N` node ID coverage assertion (removed `estMtdLabel`, `est30dLabel`).
3. Fixed `class="bar">` → `class="bar"` assertion to accommodate new `onmouseover` attribute on fallback bars.

## Result
**Success** — all changes verified:

### Test evidence
- `node test/run-tests.js` → **126 passed, 0 failed** (126 total, 3166ms)

### Dashboard inspection evidence
- `node bin/agy-tokens.js --hook --raw --write-dashboard` → generated `dashboard.html`
- ✅ SVG contains `chartHoverLabel` text element with `display:none;pointer-events:none`
- ✅ Both fallback and segment bars have `onmouseover="__showLabel(...)"` handlers
- ✅ `__showLabel` and `__hideLabel` helper functions present at `window` scope
- ✅ No `estMtd` or `est30d` references anywhere in generated HTML (0 matches)
- ✅ Exactly 2 `<div class="est-item">` elements remain (daily avg + month-end)

## Issues Discovered
None. All edits applied cleanly and tests pass on first verification run (after the one expected `class="bar">` assertion fix).

## Next Step Recommendations
- Visual QA: Open `dashboard.html` in a browser to confirm hover label positioning and readability.
- If the hover label needs localization (e.g., Korean "토큰" instead of "tokens"), the `_ht` string in `renderSvg` would need to reference `I18N` — but `renderSvg` is a pure SVG builder that doesn't currently have I18N access. This would be a separate scope item.

## Affected File List
- `src/html-report.js` — renderSvg, renderEstimates, updateI18N, computeEstimates return, HTML template (est-grid)
- `test/run-tests.js` — 3 assertion updates (estIds array, updateI18N nid list, fallback bar class check)
