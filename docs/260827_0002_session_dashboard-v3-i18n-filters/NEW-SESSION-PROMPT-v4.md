# NEW SESSION PROMPT — agy-tokens v3.3: Long-Term Estimate Panel + Reasoning Effort Distinction

## Session Folder
`docs/YYMMDD_NNNN_session_dashboard-v33-effort-estimates/` (VP creates at P1)

## Repo
`c:/Users/k1yt/OneDrive/Projects/Antigravity-cli` (agy-tools, zero-dependency Node.js, Node ≥16, npm-linked globally)

## Current State (read these first, in order)
1. `docs/260827_0002_session_dashboard-v3-i18n-filters/requirement-checklist.md` — v3 + v3.1 + v3.2 baseline (REQ-201..245 all PASS)
2. `docs/260827_0002_session_dashboard-v3-i18n-filters/213800_code-report.md` — latest code report (stale-payload tolerance + per-model daily sub-rows)
3. `docs/260827_0002_session_dashboard-v3-i18n-filters/064446_ask-report.md` — latest audit (PASS)
4. Git log: `a940bbf` (stale-payload tolerance + per-model daily rows) ← `52d0298` (date filter fix + layout redesign) ← `166efe8` (v3 i18n 21 locales + filters). All on `main`.
5. Test baseline: **116 passed, 0 failed, 18 suites** (`node test/run-tests.js`)

## Current Architecture Snapshot (verified 260827)
- [`src/i18n.js`](src/i18n.js): 21 locales × 123 keys; `SUPPORTED_LOCALES` includes `zh-TW`; `RTL_LOCALES = ['ar','he']`; `isRtl()`; `normalizeLocale()` handles hyphenated codes.
- [`src/html-report.js`](src/html-report.js): `DASHBOARD_PAYLOAD_VERSION = 3`; `buildDashboardPayload` produces `daily[]`, `models[]`, `dailyModels: { [date]: { [model]: ModelRow } }`, `isRtl`, full `i18n` dict. Client JS has: `isFreshPayload()` guard (version ≥ 3 + dailyModels), `filterState` (default range = **today**), `getFilteredData()` (date slice + model re-aggregation from dailyModels, with fallback to `p.models`/`p.daily`), `renderSvg(daily, dailyModels)` stacked per-model bars + legend, `renderTable(daily, dailyModels)` with per-model sub-rows (`↳ model`), 4 fixed summary cards + conditional 5th custom-range card. DOM order: chart → cards → date filter (today/yesterday/7d/30d/custom) → model filter → models table → daily table.
- [`src/dashboard-link.js`](src/dashboard-link.js): `dashboard-server.json` records `payloadVersion: 3`; `ensureServerRunning` respawns stale-version servers.
- [`src/log-parser.js`](src/log-parser.js): `parseTranscriptFile(transcriptPath, sessionId, metadata, modelName)` — currently assigns ONE model (from `getActiveModelFromSettings()`) to the whole session. `session.modelName` drives per-model costing.
- [`src/config.js`](src/config.js): `getActiveModelFromSettings()` reads `settings.json` `model` field (e.g. `"Gemini 3.7 Flash (High)"`); `MODEL_PRICING` + `smartHeuristicPricing()` fuzzy-match model ids; effort suffix is NOT stripped — pricing resolves on the full string via aliases/heuristics.

## User Requirements (verbatim — 2 features + 1 label fix)

### Mandate 1: Long-Term Usage Estimate Panel + "Estimates Only" Disclaimer
"대시보드 우측에 (장기사용관리를 위한 추정치입니다) 이걸 추가하는게 좋겠지?"

**User intent (confirmed in conversation)**: All dashboard numbers are ESTIMATES (self-computed BPE tokenizer, not API usage fields; cost = estimate × public rates). Users may mistake them for actual billing. Add a persistent disclaimer AND a long-term management panel.

**Disclaimer (REQ-250)**: A small dim-colored notice, always visible on the dashboard (header right side or footer), stating "이 수치들은 장기 사용 관리를 위한 추정치입니다" (localized in all 21 locales). New i18n key, e.g. `estimateDisclaimer`. Also attach the same notice to the new estimate panel.

**Estimate panel (REQ-251..253)**: Right-side panel (2-column CSS on wide screens ≥ ~1200px; stacks below on narrow). Computed client-side from existing `payload.daily[]` — NO server/payload changes needed:
| Metric | Computation |
|---|---|
| 이번 달 누적 (tokens + cost) | Sum `daily[]` from 1st of current month to today |
| 일평균 사용량 | 7-day avg and 30-day avg, both shown |
| **월말 예상** (tokens + cost) | dailyAvg × days remaining in month + month-to-date |
| 최근 30일 총 사용량 | Sum of `daily[]` |
- New i18n keys for panel title + 4 metric labels in ALL 21 locales (suite 3 parity must hold).
- Panel respects the "estimates only" disclaimer.

### Mandate 2: Reasoning Effort Distinction (session-level)
"모델이 reasoning effort에 따라서 구분이 됐음 좋겠다. gemini 3.6 flash low / medium 등 전부 구분. **모델별 사용량&비용은 물론이고, 일별상세 breakdown에도 나와야 해.**"

**Data source (VERIFIED by VP in live logs 260827)**: `transcript.jsonl` `USER_INPUT` turns contain `<USER_SETTINGS_CHANGE>` blocks:
```
changed setting `Model Selection` from None to Gemini 3.7 Flash (High)
changed setting `Model Selection` from None to Claude Opus 4.6 (Thinking)
```
Effort level is embedded in the model display name parentheses: `(High)`, `(Low)`, `(Medium)`, `(Thinking)`, etc. Observed distinct values in user's logs: `Gemini 3.7 Flash (High)`, `Gemini 3.6 Flash (High)`, `Claude Opus 4.6 (Thinking)`.

**Current limitation**: [`log-parser.js`](src/log-parser.js) applies the CURRENT `settings.json` model to ALL sessions — historical sessions show the wrong model/effort.

**Implementation plan (REQ-254..257)**:
1. [`src/log-parser.js`](src/log-parser.js): during transcript parsing, scan `USER_INPUT` turns for `<USER_SETTINGS_CHANGE>` + `Model Selection` regex. Track the session's effective model+effort:
   - If a settings-change exists → use the LAST one before/at session end (session-level granularity for v3.3; turn-level is a future extension).
   - If none exists → fallback to current `getActiveModelFromSettings()` (unchanged behavior).
   - Store as `session.modelName` (e.g. `"Gemini 3.7 Flash (High)"`). Cache schema: parsed sessions already persist `modelName` — verify cache invalidation so re-picking up old cached sessions re-parses them once (bump `CACHE_SCHEMA_VERSION` if needed).
2. Model identity key = full display string with effort, e.g. `Gemini 3.7 Flash (High)` vs `Gemini 3.7 Flash (Low)` are DISTINCT rows everywhere.
3. Pricing: effort does NOT change per-token rates — resolve pricing on the BASE model (strip the parenthesized effort suffix before `getModelPricing()` lookup; e.g. `Gemini 3.7 Flash (Low)` → `gemini-3.7-flash` rates). Thinking tokens are already reflected in token counts. Add a `baseModelId`/effort-split helper in config or log-parser.
4. `models[]`, `dailyModels`, model filter checkboxes, stacked chart segments, and **Daily Detail per-model sub-rows** all automatically become effort-distinct because they key off `session.modelName` / `dailyModels[date][model]`. VERIFY each surface shows the effort suffix.
5. Model filter checkboxes list each model+effort variant separately.
6. displayName: keep the full string including effort (e.g. "Gemini 3.7 Flash (High)").

### Mandate 3: Header Model Label Clarification
Header currently shows `Gemini 3.7 Flash (High) ○ 마지막 업데이트: ...` — user asked what it means. Decision: keep it but label it clearly as the CURRENT active model (not the data's model):
- **REQ-258**: Header model span shows `활성 모델: Gemini 3.7 Flash (High)` using the existing `activeModel` i18n key (already in all 21 locales). Update `updateI18N` client JS if needed to re-render the label on locale change.

## Hard Constraints (unchanged)
- Zero new npm dependencies (Node core only).
- All writes atomic (tmp+rename); statusline script work <20ms after node startup.
- `--serve` binds 127.0.0.1 only; `file://` pages use script-tag polling only.
- 8.3 short paths, no quotes, in settings.json statusLine command.
- 🚫 Do NOT touch `C:\Users\k1yt\AppData\Local\agy\**` or agy binary/config beyond the statusLine value.
- i18n: any new key must be added to ALL 21 locales (suite 3 enforces parity).
- Client must keep stale-payload tolerance (`isFreshPayload`, version ≥ 3) — bump `DASHBOARD_PAYLOAD_VERSION` to 4 if payload schema changes, and update `isFreshPayload` accordingly.

## Verification Gates
1. `node test/run-tests.js` → all suites green (suite 3: 21 locales × all keys incl. new estimate/disclaimer keys; suite 15: estimate panel + effort-distinct models/dailyModels/sub-rows; suite 4: parser effort extraction).
2. `AGY_LANG=ko node bin/agy-tokens.js --hook --raw --write-dashboard` → dashboard.html contains disclaimer text, estimate panel markup, effort-suffixed model rows (if logs contain settings-changes).
3. Unit-level: feed a synthetic transcript with `<USER_SETTINGS_CHANGE>` → parsed session has the effort-suffixed model; a session WITHOUT it falls back to current settings model.
4. Open dashboard → estimate panel visible on wide screen (2-col) and stacked on narrow; month-end projection math correct (spot-check against daily[] sums).
5. Models table + Daily Detail sub-rows show `Model (Effort)` variants distinctly; model filter checkboxes list each variant.
6. Badge still single-line with OSC 8 link; RTL (`AGY_LANG=ar`) intact; all 21 locales parity green.

## Report
Write report to: `docs/YYMMDD_NNNN_session_dashboard-v33-effort-estimates/HHMMSS_code-report.md`
Required sections: Task Summary / Actions Taken (per work item) / Result (+evidence) / Issues Discovered / Next Step Recommendations / Affected File List.

Upon task completion, return using `attempt_completion` instead of `switch_mode`.

Report Folder: docs/YYMMDD_NNNN_session_dashboard-v33-effort-estimates/