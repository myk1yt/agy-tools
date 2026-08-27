# Code Task Report — agy-tokens v3.3 Batch 3 (Dashboard Surface + Tests)

## Task Summary
Batch 3 of 3 for agy-tokens v3.3: implemented the client-side long-term estimate panel + persistent disclaimer in [`src/html-report.js`](../../../src/html-report.js) (REQ-250..253, 258) and locked the entire v3.3 feature set with new tests in [`test/run-tests.js`](../../test/run-tests.js) (suite 3 +1, suite 4 +2, suite 15 +3). No payload schema change (`DASHBOARD_PAYLOAD_VERSION` stays 3); `isFreshPayload` untouched.

## Actions Taken

### 1. `src/html-report.js` (client dashboard)
- **CSS** (after `.subrow` rules): `.estimate-note` (dim color), `.est-layout` grid wrapper (`1fr` below 1200px → `1.6fr 1fr` at `@media(min-width:1200px)`), `.estimate-panel`, `.est-grid` (2-col metric grid, 1-col ≤560px), `.est-item`/`.est-label`/`.est-value`/`.est-cost`, panel-footer divider rule. All direction-agnostic (grid + flex, no physical left/right margins) → RTL-safe by construction.
- **HTML**: `<span id="estimateNote" class="estimate-note">` appended to header `.meta` (server-rendered with `t('estimateDisclaimer')`); `.est-layout` wrapper div containing `#cards` + `<section class="panel estimate-panel" id="estimatePanel">` with `<h2 id="estimateTitle">`, 4 `.est-item` blocks (`estMtdLabel/Value/Cost`, `estAvgLabel/Value/Cost`, `estMonthEndLabel/Value/Cost`, `est30dLabel/Value/Cost`), and `<div class="estimate-note" id="estimatePanelNote">` footer.
- **Client JS**:
  - `computeEstimates(daily)` per §5.3: MTD via `date.indexOf(monthPrefix) === 0`, 7d avg = `sum(last7)/7`, 30d avg = `sum(all)/rows.length` with ÷0 guard (`rows.length > 0 ? … : 0`), monthEnd = MTD + 7dAvg × `max(0, daysInMonth - now.getDate())` (days-in-month via `new Date(y, m+1, 0).getDate()`), total30 = sum(all). Handles empty/null `daily` (÷0 → 0) and month boundaries (MTD=0 on the 1st → projection = avg×remaining).
  - `renderEstimates(p)`: writes `fmtCompact` tokens + `fmtCost` into the 8 value nodes; also appends live `7d / 30d` compact figures to the `estAvgLabel` line.
  - `updateI18N`: re-renders `estimateNote`, `estimateTitle`, `estimatePanelNote`, 4 metric labels, `#model` (`I18N.activeModel + ': ' + (lastPayload.model || '')` — REQ-258), then calls `renderEstimates(lastPayload)` for immediate locale-switch refresh.
  - `render()`: `#model` span now renders `(I18N.activeModel ? I18N.activeModel + ': ' : '') + (p.model || '')`; calls `renderEstimates(p)`.
- NOT changed (per spec): `DASHBOARD_PAYLOAD_VERSION` (stays 3), `isFreshPayload`, `dashboardI18n` key list (payload i18n already carries all keys via `getAllTranslations` spread).

### 2. `test/run-tests.js`
- **Suite 3 (+1)**: `Should verify estimate-panel keys across all 21 supported locales (REQ-250..253, 259)` — asserts all 6 estimate keys non-empty in every `SUPPORTED_LOCALES` (mirrors `filterKeys` test), plus canonical spot-checks (ko disclaimer exact text, en panel title) and ar/he non-empty (RTL locales).
- **Suite 4 (+3, spec asked +2 + optional 3rd)**: (a) synthetic transcript with `<USER_SETTINGS_CHANGE>` → `parsed.modelName === 'Gemini 3.7 Flash (High)'`; (b) without block → falls back to param model `gemini-3.7-flash`; (c) two changes → LAST wins (`Claude Opus 4.6 (Thinking)`).
- **Suite 15 (+3)**:
  1. Estimate panel markup/CSS/JS presence: all 13 node ids, `.estimate-note{`/`.estimate-panel{`/`.est-grid{`/`.est-item{`/`.est-layout{` CSS, `@media(min-width:1200px){.est-layout{grid-template-columns:1.6fr 1fr}}`, `computeEstimates(`/`renderEstimates(` functions, `renderEstimates(lastPayload)` in updateI18N, `renderEstimates(p);` in render(), computation guards (`indexOf(monthPrefix) === 0`, `rows.slice(-7)`, ÷0 guard, `new Date(y, m + 1, 0).getDate()`), and `est-layout` wraps `#cards` → `#estimatePanel` in order.
  2. Disclaimer + activeModel: Korean disclaimer text + panel title in rendered ko HTML; `activeModel + ': '` logic in both `updateI18N` and `render()`; `updateI18N` covers all 7 new node ids; ar variant keeps `dir="rtl"` + Arabic disclaimer text.
  3. Effort-distinct payload (REQ-255/256): sessions with `Gemini 3.7 Flash (High)` + `(Low)` → `models[]` has 2 distinct rows with full display names; `dailyModels` keys distinct; both variants costed at base-model rates (payload cost ≈ `config.calculateCostUsd(..., 'Gemini 3.7 Flash')` within `round6` tolerance 5e-7).
- No existing assertions weakened; no test-count constants needed updating (suite totals are computed dynamically).

## Result
✅ SUCCESS — all verification gates green.

### Evidence
1. **Test suite**: `node test/run-tests.js` → **123 passed, 0 failed, 123 total, 18 suites** (baseline 116 → +7: suite 3 +1, suite 4 +3, suite 15 +3). Exit code 0.
2. **Korean gate** (`AGY_LANG=ko … --write-dashboard`, grep of `C:/Users/k1yt/.gemini/antigravity-dashboard/dashboard.html`):
   - `2:<html lang="ko">`
   - `70:<span id="estimateNote" class="estimate-note">이 수치들은 장기 사용 관리를 위한 추정치입니다</span>` (header)
   - `76:<section class="panel estimate-panel" id="estimatePanel">`
   - `84:<div class="estimate-note" id="estimatePanelNote">이 수치들은 장기 사용 관리를 위한 추정치입니다</div>` (panel footer)
   - `55-56:.est-layout{…}` + `@media(min-width:1200px){.est-layout{grid-template-columns:1.6fr 1fr}}`
   - `207:function computeEstimates(daily)`, `247:function renderEstimates(p)`, `172:renderEstimates(lastPayload);` (updateI18N), `650:renderEstimates(p);` (render)
   - Payload i18n contains `"activeModel":"사용 모델"` (label logic verified in suite 15 + client JS `I18N.activeModel + ': '`).
3. **Arabic gate** (`AGY_LANG=ar`): `2:<html lang="ar" dir="rtl">`, `84:…id="estimatePanelNote">هذه الأرقام تقديرية لإدارة الاستخدام على المدى الطويل</div>`, payload `"isRtl":true`, all 6 estimate keys present in Arabic (`estimatePanelTitle":"تقدير الاستخدام على المدى الطويل"` etc.). Dashboard restored to `ko` afterwards.
4. **Live effort evidence** (`dashboard-data.json` grep): real logs contain `<USER_SETTINGS_CHANGE>` blocks → payload shows effort-suffixed rows: `"model": "Gemini 3.7 Flash (High)"`, `"Claude Opus 4.6 (Thinking)…"`, `"Gemini 3.6 Flash (High)…"` as distinct `models[]`/`dailyModels` keys.

## Issues Discovered
1. **Data-quality observation (pre-existing from Batch 2, report-only, out of Batch 3 scope)**: live transcripts capture the settings-change line with trailing prompt-instruction text appended on the same line, e.g. `Claude Opus 4.6 (Thinking). No need to comment on this change…` becomes the full `session.modelName`. Root cause: [`SETTINGS_CHANGE_RE`](../../../src/log-parser.js:31) captures `(.+?)(?:\n|$)` — everything to end-of-line. Pricing still resolves correctly (substring alias matching hits the base name inside the long string), but the display label is polluted and one long name can split into a spurious extra variant (e.g. `Gemini 3.7 Flash (High)` vs `Gemini 3.7 Flash (High). No need…` appear as 2 rows). Recommended follow-up: truncate the capture at the first `.` followed by whitespace+capital, or strip a known boilerplate suffix in the parser. NOT fixed here (file outside Batch 3 scope; would also change Batch 2 behavior/tests).
2. First test run had 2 failures in my own new tests (wrong variable `html` vs `htmlKo`; rate-equality assertion invalid because cached/input token mixes differ between variants) — both fixed; final run 123/123.

## Next Step Recommendations
- VP: consider a small Batch 3.5 in `src/log-parser.js` to sanitize the settings-change capture (strip trailing boilerplate after the model name) — improves display labels and merges the split `Gemini 3.7 Flash (High)` variants; requires cache schema bump or suffix-normalization at payload build time.
- Run remaining Verification Gates 1–6 from NEW-SESSION-PROMPT-v4, then P6 Final Ask Audit.

## Affected File List
- `src/html-report.js` (modify — CSS block, HTML template, client JS: `computeEstimates`, `renderEstimates`, `updateI18N`, `render`)
- `test/run-tests.js` (modify — suite 3 +1, suite 4 +3, suite 15 +3 tests)
- `docs/260827_0003_session_dashboard-v33-effort-estimates/072422_code-report.md` (this report)