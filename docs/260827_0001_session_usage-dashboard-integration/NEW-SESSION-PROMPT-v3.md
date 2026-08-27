# NEW SESSION PROMPT — agy-tokens v3: i18n Expansion (20+ locales) + Dashboard Filters

## Session Folder
`docs/YYMMDD_NNNN_session_dashboard-v3-i18n-filters/` (VP creates at P1)

## Repo
`c:/Users/k1yt/OneDrive/Projects/Antigravity-cli` (agy-tools, zero-dependency Node.js, Node ≥16, npm-linked globally)

## Current State (read these first, in order)
1. `docs/260827_0001_session_usage-dashboard-integration/requirement-checklist.md` — v2 baseline (REQ-101..112 all PASS)
2. `docs/260827_0001_session_usage-dashboard-integration/224800_code-report.md` — latest code report (dynamic I18N fix)
3. `docs/260827_0001_session_usage-dashboard-integration/222045_ask-report.md` — latest audit (PASS)
4. Git log: `ca9499c` (dynamic I18N) ← `ad82d96` (VS Code http link) ← `2e68fff` (v2 rework). All on `main`.

## User Requirements (verbatim — 2 mandates + 1 housekeeping)

### Mandate 1: i18n Expansion to 20+ Languages
"지원언어를 확장한다. Dashboard가 아래의 언어들을 모두 지원하도록 해줘."

**Target locales** (20 new + 4 existing = 24 total):

| Region | Locale Code | Language | Script Notes |
|--------|-------------|----------|--------------|
| Asia | `ko` | 한국어 | ✅ exists |
| Asia | `ja` | 日本語 | ✅ exists |
| Asia | `zh` | 中文 (简体) | ✅ exists |
| Asia | `zh-TW` | 中文 (繁體) | NEW — Traditional Chinese; `SUPPORTED_LOCALES` must accept `zh-TW` (hyphenated); `detectSystemLocale` must NOT split on `-` for this code |
| Asia | `hi` | हिन्दी | NEW |
| Asia | `vi` | Tiếng Việt | NEW |
| Asia | `id` | Bahasa Indonesia | NEW |
| Asia | `th` | ภาษาไทย | NEW — Thai script; may need CSS `word-break: keep-all` consideration |
| Europe/Americas | `en` | English | ✅ exists |
| Europe/Americas | `de` | Deutsch | NEW |
| Europe/Americas | `fr` | Français | NEW |
| Europe/Americas | `es` | Español | NEW |
| Europe/Americas | `pt` | Português | NEW |
| Europe/Americas | `it` | Italiano | NEW |
| Europe/Americas | `nl` | Nederlands | NEW |
| Europe/Americas | `pl` | Polski | NEW |
| Europe/Americas | `sv` | Svenska | NEW |
| Europe/Americas | `ru` | Русский | NEW — Cyrillic script |
| Middle East | `ar` | العربية | NEW — **RTL language**; dashboard HTML must handle `dir="rtl"` when lang=ar |
| Middle East | `he` | עברית | NEW — **RTL language**; same RTL handling |
| Middle East | `tr` | Türkçe | NEW |

**Current state**: [`src/i18n.js`](src/i18n.js) has 113 translation keys across 4 locales (`en`, `ko`, `ja`, `zh`). `SUPPORTED_LOCALES = ['en', 'ko', 'ja', 'zh']` at line 13. `TRANSLATIONS` object starts at line 19. `detectSystemLocale()` at line 555 checks `AGY_LANG → LC_ALL → LANG → LANGUAGE → Intl.DateTimeFormat → 'en' fallback`.

**Implementation notes**:
- Each new locale needs ALL 113 keys translated. Use accurate, natural translations (not machine-literal).
- `zh-TW` is hyphenated — `SUPPORTED_LOCALES` must include `'zh-TW'`; `detectSystemLocale` must handle `zh-TW` from `Intl.DateTimeFormat` (e.g., `zh-Hant-TW` → extract `zh-TW`, not just `zh`). Current code splits on `-` and takes first segment — this would incorrectly map `zh-TW` to `zh`. Fix the extraction logic.
- RTL (`ar`, `he`): the dashboard HTML `<html>` tag must set `dir="rtl"` when the active locale is RTL. Add an `isRtl` flag to the payload. The embedded CSS should handle RTL (flexbox reversal, text-align, etc.). Keep it minimal — CSS logical properties (`margin-inline-start`, `padding-inline-end`) are the cleanest approach.
- `getAllTranslations(locale)` at line 613 must work with all new locale codes.
- Suite 3 (i18n parity) must verify ALL 24 locales have ALL 113 keys.

### Mandate 2: Dashboard Filters (Date Range + Model)
"필터기능의 추가 가능성을 탐구하고, 실제 추가하기로 한다."

**Filter UI** (above the "모델별 사용량 & 비용" / Models section):
- **Date filter**: 오늘 (Today) / 어제 (Yesterday) / 최근 7일 / 최근 30일 / 지정 (Custom date range picker)
- **Model filter**: checkboxes for each model that appears in the data (e.g., "claude-opus-4", "gemini-3.7-flash")
- Filters apply to BOTH the Models table AND the Daily Detail table simultaneously
- Default: 30일 + all models selected

**Current payload schema** (from `buildDashboardPayload`):
```
payload.daily[30]: { date, sessions, turns, inputTokens, cachedTokens, outputTokens, totalTokens, cacheHitRate, costUsd, cacheSavingsUsd }
payload.models[]: { model, displayName, totalTokens, inputTokens, cachedTokens, outputTokens, cacheHitRate, costUsd, cacheSavingsUsd, sessions, turns }
payload.summaries: { today, yesterday, last7d, last30d }
```

**Key design decision**: The current `models[]` is aggregated over the FULL 30-day window. To support date-range filtering on models, the payload needs **per-date per-model breakdown**. Two approaches:

**Approach A (recommended)**: Extend the payload with `dailyModels: { [date]: { [model]: ModelRow } }` — a nested map of per-date per-model stats. The client-side filter then slices `daily[]` by date range and re-aggregates `dailyModels` for the selected models. This keeps the server simple (one extra field) and the client fast (no re-parsing of raw sessions).

**Approach B**: Add a server-side filter API (`/data.json?from=...&to=...&model=...`). More complex, requires URL parameter handling in serve.js, but produces smaller payloads. Not recommended for v3 — the 30-day payload is small enough for client-side filtering.

**Implementation notes**:
- `buildDashboardPayload` must compute `dailyModels` alongside the existing `daily[]` and `models[]`. Each session's turns are already bucketed by date (line 144-153) — extend this to also bucket by model.
- The embedded JavaScript in `renderDashboardHtml` must:
  1. Render filter UI (date buttons + model checkboxes) above the Models section
  2. On filter change: recompute filtered `models[]` from `dailyModels`, slice `daily[]` by date range, re-render both tables + chart
  3. Update summary cards to reflect filtered totals
- Filter state persists across SSE/poll updates (don't reset filters when new data arrives)
- i18n: add filter-related keys (`filterDate`, `filterModel`, `filterAll`, `filterCustom`, `filterApply`) to ALL 24 locales
- CSS: inline, zero-dependency, consistent with existing dashboard style

### Housekeeping: Docs + Commit + Push
"전부 마치게 되면, readme와 같은 부분을 전부 최신화한 뒤에, 커밋 후 푸시까지 하는걸로 하자."
- README.md: update supported languages list, document filter feature, update any stale references
- All other docs (install scripts, help text) if affected
- VP commits + pushes after all gates pass

## Hard Constraints (unchanged from v2)
- Zero new npm dependencies (Node core only).
- All writes atomic (tmp+rename); statusline script work <20ms after node startup.
- --serve binds 127.0.0.1 only.
- file:// pages: script-tag injection polling ONLY (fetch/XHR is CORS-blocked).
- 8.3 short paths, no quotes, in the settings.json statusLine command.
- 🚫 Do NOT touch C:\Users\k1yt\AppData\Local\agy\** or any agy binary/config beyond the statusLine value in ~/.gemini/antigravity-cli/settings.json.

## Verification Gates
1. `node test/run-tests.js` → all suites green (suite 3 must cover all 24 locales × 113 keys; suite 15 must cover dailyModels + filter logic).
2. `AGY_LANG=de node bin/agy-tokens.js --hook --raw --write-dashboard` → dashboard.html has `lang="de"`, German I18N strings.
3. `AGY_LANG=ar node bin/agy-tokens.js --hook --raw --write-dashboard` → dashboard.html has `dir="rtl"`, Arabic I18N strings.
4. Open `http://127.0.0.1:8787/` → filter UI visible; changing date range updates Models table + Daily table; selecting specific model filters both tables.
5. `node bin/agy-tokens.js --hook --raw` → badge still works (single line, OSC 8 link).
6. README reflects all changes; no stale references.

## Report
Write report to: `docs/YYMMDD_NNNN_session_dashboard-v3-i18n-filters/HHMMSS_code-report.md`
Required sections: Task Summary / Actions Taken (per work item) / Result (+evidence) / Issues Discovered / Next Step Recommendations / Affected File List.

Upon task completion, return using `attempt_completion` instead of `switch_mode`.

Report Folder: docs/YYMMDD_NNNN_session_dashboard-v3-i18n-filters/
