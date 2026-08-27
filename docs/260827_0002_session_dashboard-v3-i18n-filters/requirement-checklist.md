# Requirement Checklist
## Task: agy-tokens v3 — i18n Expansion (21 locales) + Dashboard Filters
## Date: 260827
## Session Folder: docs/260827_0002_session_dashboard-v3-i18n-filters/

> v3 extends the v2 dashboard with two user mandates:
> 1. Expand i18n from 4 locales to 21 locales (17 new)
> 2. Add dashboard date-range and model filters
> Plus housekeeping: README/docs update, commit, push.

---

### Mandate 1: i18n Expansion to 21 Locales

- [ ] [REQ-201] `SUPPORTED_LOCALES` in `src/i18n.js` expanded to include all 21 locale codes: `en`, `ko`, `ja`, `zh`, `zh-TW`, `hi`, `vi`, `id`, `th`, `de`, `fr`, `es`, `pt`, `it`, `nl`, `pl`, `sv`, `ru`, `ar`, `he`, `tr`.
- [ ] [REQ-202] All 113+ translation keys exist in all 21 locale dictionaries with accurate, natural translations (not machine-literal).
- [ ] [REQ-203] `zh-TW` (hyphenated) is handled correctly: `SUPPORTED_LOCALES` includes `'zh-TW'`; `detectSystemLocale()` does NOT split `zh-TW` on `-` to produce just `zh`; `setLocale()` and `getAllTranslations()` accept `zh-TW` as-is.
- [ ] [REQ-204] RTL support: `ar` and `he` locales trigger `dir="rtl"` on the dashboard `<html>` tag. An `isRtl` flag is included in the payload. CSS uses logical properties (`margin-inline-start`, `padding-inline-end`) for RTL compatibility.
- [ ] [REQ-205] Filter-related i18n keys (`filterDate`, `filterModel`, `filterAll`, `filterCustom`, `filterApply`, `filterToday`, `filterYesterday`, `filter7d`, `filter30d`) added to ALL 21 locales.
- [ ] [REQ-206] `cliOptLang` key updated in all locales to list all 21 supported language codes.
- [ ] [REQ-207] Suite 3 (i18n parity) verifies ALL 21 locales have ALL translation keys (en keys ⊆ each locale).

### Mandate 2: Dashboard Filters (Date Range + Model)

- [ ] [REQ-210] `buildDashboardPayload` computes `dailyModels: { [date]: { [model]: ModelRow } }` — a nested map of per-date per-model stats alongside existing `daily[]` and `models[]`.
- [ ] [REQ-211] Dashboard HTML renders filter UI above the Models section: date buttons (Today / Yesterday / 7d / 30d / Custom) + model checkboxes for each model in the data.
- [ ] [REQ-212] Filter changes recompute: (a) filtered `models[]` from `dailyModels` sliced by date range, (b) sliced `daily[]` by date range, (c) re-render both tables + chart + summary cards.
- [ ] [REQ-213] Default filter state: 30 days + all models selected.
- [ ] [REQ-214] Filter state persists across SSE/poll updates (filters are NOT reset when new data arrives).
- [ ] [REQ-215] Custom date range picker: two date inputs (from/to) that filter the data.
- [ ] [REQ-216] Suite 15 extended: tests for `dailyModels` structure, filter logic (date slicing, model filtering, re-aggregation), and filter persistence across data updates.

### Housekeeping

- [ ] [REQ-220] README.md updated: supported languages list (all 21), filter feature documented, stale references removed.
- [ ] [REQ-221] `scripts/install.bat` and `scripts/install.sh` updated if affected.
- [ ] [REQ-222] All docs reflect v3 changes.
- [ ] [REQ-223] `node test/run-tests.js` → all suites green.
- [ ] [REQ-224] `AGY_LANG=de node bin/agy-tokens.js --hook --raw --write-dashboard` → dashboard has `lang="de"`, German strings.
- [ ] [REQ-225] `AGY_LANG=ar node bin/agy-tokens.js --hook --raw --write-dashboard` → dashboard has `dir="rtl"`, Arabic strings.
- [ ] [REQ-226] Open `http://127.0.0.1:8787/` → filter UI visible; date range + model filter work correctly.
- [ ] [REQ-227] `node bin/agy-tokens.js --hook --raw` → badge still works (single line, OSC 8 link).
- [ ] [REQ-228] VP commits + pushes after all gates pass.

### v3.1 Follow-up: Filter Bug Fix + Layout Redesign (user feedback 260827)

- [ ] [REQ-230] BUG: Date filter buttons other than 30d (Today/Yesterday/7d/Custom) must correctly filter the Daily Detail table and Models table. Root cause must be identified and fixed.
- [ ] [REQ-231] Layout reorder (top to bottom): (1) Token Usage Trend chart, (2) Summary cards (Today/Yesterday/7d/30d), (3) Date filter, (4) Model filter, (5) Models Usage & Cost, (6) Daily Detail.
- [ ] [REQ-232] Token Usage Trend chart: always shows full 30 days (NOT affected by date filter), but DOES reflect model filter (stacked bars per model contribution).
- [ ] [REQ-233] Summary cards (Today/Yesterday/7d/30d) always computed from FULL data — never affected by any filter. When Custom date range is selected, a 5th card appears to the right of the 30d card showing custom-range tokens + cost.
- [ ] [REQ-234] Date filter button order: Today → Yesterday → 7d → 30d → Custom.
- [ ] [REQ-235] Models table + Daily Detail table respond to BOTH date filter and model filter.
- [ ] [REQ-236] Stacked bar chart: each day's bar segmented by model contribution (colors per model, legend shown).
- [ ] [REQ-237] All tests still pass; suite 15 updated for new layout/filter behavior.

### v3.2 Follow-up: Real-browser Bug Fixes + Per-Model Daily Detail (user feedback 260827 #2)

- [ ] [REQ-240] BUG: Token Usage Trend chart must NOT go blank after initial render (SSE/poll updates). Root cause must be diagnosed (suspected: stale background server pushes v2 payloads without dailyModels; client must tolerate/ignore stale payloads and fall back to polling fresh dashboard-data.js).
- [ ] [REQ-241] Date filter default must be 오늘 (Today), not 30d.
- [ ] [REQ-242] Clicking 오늘/어제/최근7일 must show the filtered Models Usage & Cost table AND Daily Detail table for that range (currently shows nothing in real browser).
- [ ] [REQ-243] Daily Detail table gains per-model sub-rows: each date row expands to per-model rows (models used that day), respecting the model filter.
- [ ] [REQ-244] Client must gracefully handle payloads lacking dailyModels (version < 3): chart falls back to single-series bars; SSE stale payloads are ignored in favor of fresh polling data.
- [ ] [REQ-245] All tests pass; suite 15 updated for new behavior (default=today, per-model daily rows, stale-payload tolerance).

### Hard Constraints (unchanged from v2)

- Zero new npm dependencies (Node core only).
- All writes atomic (tmp+rename); statusline script work <20ms after node startup.
- `--serve` binds 127.0.0.1 only.
- `file://` pages: script-tag injection polling ONLY (fetch/XHR is CORS-blocked).
- 8.3 short paths, no quotes, in the settings.json statusLine command.
- 🚫 Do NOT touch `C:\Users\k1yt\AppData\Local\agy\**` or any agy binary/config beyond the statusLine value.
