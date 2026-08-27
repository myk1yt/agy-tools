# Requirement Checklist
## Task: agy-tokens v3.3 — Long-Term Estimate Panel + Reasoning Effort Distinction + i18n Perfection
## Date: 260827
## Session Folder: docs/260827_0003_session_dashboard-v33-effort-estimates/
## Baseline: git `a940bbf` (main), 116 tests / 18 suites PASS, payload v3
## Delivered: commits `1a1cd17` + `c9732c4` (main), 125 tests / 18 suites PASS
## Audit: P6 Full Ask Audit PASS (075030_ask-report.md) — REQ-250..259 all ✅ source-verified

### Mandate 1: Long-Term Usage Estimate Panel + Disclaimer
- [x] [REQ-250] Persistent "estimates only" disclaimer on dashboard (header right or footer), text "이 수치들은 장기 사용 관리를 위한 추정치입니다", new i18n key `estimateDisclaimer` present in ALL 21 locales; same notice attached to the estimate panel
- [x] [REQ-251] Right-side estimate panel (2-column CSS ≥ ~1200px, stacks below on narrow) showing 이번 달 누적 (tokens + cost) computed client-side from `payload.daily[]` (month-to-date sum); NO server/payload schema change required
- [x] [REQ-252] Panel shows 일평균 사용량: both 7-day avg and 30-day avg (tokens + cost)
- [x] [REQ-253] Panel shows 월말 예상 (dailyAvg × days remaining + month-to-date, tokens + cost) and 최근 30일 총 사용량; new i18n keys (panel title + 4 metric labels) in ALL 21 locales (suite 3 parity green)

### Mandate 2: Reasoning Effort Distinction (session-level)
- [x] [REQ-254] `src/log-parser.js` scans `USER_INPUT` turns for `<USER_SETTINGS_CHANGE>` + `Model Selection` regex during transcript parsing; session's effective model+effort = LAST settings-change in session; fallback to `getActiveModelFromSettings()` when absent; stored as `session.modelName`
- [x] [REQ-255] Model identity key = full display string with effort (e.g. `Gemini 3.7 Flash (High)` ≠ `Gemini 3.7 Flash (Low)`); ALL surfaces effort-distinct: `models[]`, `dailyModels`, model filter checkboxes (each variant listed), stacked chart segments, Daily Detail per-model sub-rows, displayName keeps full string; capture sanitized against prompt-boilerplate pollution (0 polluted names in live payload)
- [x] [REQ-256] Pricing resolves on BASE model (strip parenthesized effort suffix before `getModelPricing()`; e.g. `Gemini 3.7 Flash (Low)` → `gemini-3.7-flash` rates); helper added in config (`getBaseModelName`), incl. settings-fallback path (fix `c9732c4`)
- [x] [REQ-257] Cache invalidation: cached sessions with old single-model schema re-parse once (`CACHE_SCHEMA_VERSION` 1 → 3) so historical sessions pick up effort-suffixed models

### Mandate 3: Header Model Label
- [x] [REQ-258] Header model span shows `활성 모델: <model>` using existing `activeModel` i18n key (all 21 locales); `updateI18N` re-renders label on locale change

### i18n Perfection (user-added mandate: "i18n을 완벽하게 구현해야해")
- [x] [REQ-259] EVERY new i18n key (`estimateDisclaimer`, `estimatePanelTitle`, `estimateMonthToDate`, `estimateDailyAverage`, `estimateMonthEnd`, `estimateLast30d`) added to ALL 21 locales with natural translations — zero missing keys, zero English fallbacks in non-English locales; suite 3 parity green; RTL (`ar`, `he`) layout intact for new panel/disclaimer; `updateI18N` covers all new DOM nodes on locale switch