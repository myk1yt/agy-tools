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

### Hard Constraints (unchanged from v2)

- Zero new npm dependencies (Node core only).
- All writes atomic (tmp+rename); statusline script work <20ms after node startup.
- `--serve` binds 127.0.0.1 only.
- `file://` pages: script-tag injection polling ONLY (fetch/XHR is CORS-blocked).
- 8.3 short paths, no quotes, in the settings.json statusLine command.
- 🚫 Do NOT touch `C:\Users\k1yt\AppData\Local\agy\**` or any agy binary/config beyond the statusLine value.
