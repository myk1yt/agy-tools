# Code Report — Batch A: W1 (Dashboard link wiring) + W4 (per-model usage & cost)

**Mode:** code | **Date:** 2026-08-27 | **Session:** docs/260827_0001_session_usage-dashboard-integration/
**Task:** W1 — wire the missing OSC 8 `📊 Dashboard` link into the statusline badge; W4 — per-model usage & cost breakdown in the dashboard payload + HTML. Statusline-ONLY concept; skills/hooks/installers/README untouched.

---

## Task Summary

Fixed the root cause of the missing `📊 Dashboard` badge segment: the OSC 8 link was built nowhere in the hook path — [`src/hook-handler.js`](../../src/hook-handler.js) called `renderRealTimeBadge` without the 4th `link` param and [`src/index.js`](../../src/index.js) never built the link in the hook branch. Wired `formatOsc8Link(dashboardFileUrl(), i18n 'dashboardLink')` through the hook branch → `handlePostInvocation` → `renderRealTimeBadge`, respecting `--no-link` and `NO_COLOR`/`TERM=dumb`. Implemented the W4 `models: ModelRow[]` payload array (schema version 2) with per-session-model costing, a zero-dependency "Models" HTML section (table + share bars), i18n keys ×4 locales, and 2 new suite-15 tests. All 89 tests green; all 4 verification gates pass with live evidence.

## Actions Taken (per work item)

### W1 — Dashboard link wiring (REQ-101)
- [src/index.js](../../src/index.js): hook branch now builds `const dashboardLink = options.noLink ? null : osc8.formatOsc8Link(osc8.dashboardFileUrl(), '📊 ' + i18n.t('dashboardLink'))` and passes it to `handlePostInvocation` as `options.link`. Import changed from a named `dashboardFileUrl` to the full `osc8` module (the `--html` branch call site updated accordingly).
- [src/hook-handler.js](../../src/hook-handler.js): `handlePostInvocation` passes `options.link || null` as the 4th arg to `renderRealTimeBadge` (the previously missing param).
- [src/formatter.js](../../src/formatter.js): **unchanged** — `renderRealTimeBadge(badgeData, currency, isFree, link=null)` already appended the link segment (lines 637–639).
- [src/osc8.js](../../src/osc8.js): **unchanged** — `formatOsc8Link`/`dashboardFileUrl`/`isOsc8Supported` already provided env degradation (`NO_COLOR`, `TERM=dumb`).
- i18n `dashboardLink`: **already present in all 4 locales** (en 'Dashboard' / ko '대시보드' / ja 'ダッシュボード' / zh '仪表板') — verified via search, no addition needed.

### W4 — Per-model usage & cost (REQ-107/108/109)
- [src/html-report.js](../../src/html-report.js) `buildDashboardPayload`:
  - `DASHBOARD_PAYLOAD_VERSION` bumped **1 → 2**.
  - Added a per-model accumulation pass over sessions (same single pass as date bucketing — no extra Date parses): groups by `session.modelName` (fallback: opts.modelName, then `'unknown'`), accumulating `sessions`, `turns`, `inputTokens`, `cachedTokens`, `outputTokens`.
  - **Per-session model costing**: each session's cost is computed with `calculateCostUsd(session.inputTokens, session.cachedTokens, session.outputTokens, session.modelName)` and savings with `calculateCacheSavingsUsd(session.cachedTokens, session.modelName)` — the session's OWN model, never the global active model. (Root-cause note: the previous payload re-costed all turns via `summarizeTurns(turns, globalModel)`; per-turn transcript records carry no model field, so per-session model is the correct granularity — sessions already persist their own `modelName` from parse time in the cache.)
  - Emits `models: ModelRow[]` sorted by `costUsd` desc: `{ model, displayName, totalTokens, inputTokens, cachedTokens, outputTokens, cacheHitRate, costUsd, cacheSavingsUsd, sessions, turns }`.
  - New imports from config: `calculateCostUsd`, `calculateCacheSavingsUsd` (existing functions, zero new deps).
- [src/html-report.js](../../src/html-report.js) `renderDashboardHtml`:
  - New `renderModels(models)` client function: per-model table (Model / Sessions / Turns / Input / Cached / Output / Total / Cache% / Cost / Savings) + a per-model token **share bar** (inline CSS div, width = % of max model tokens). Zero-dependency, inline everything, `esc()`-escaped, reuses existing `fmtCompact`/`fmtCost`/`fmtPct`.
  - New `<section class="panel"><h2>modelsTitle</h2><div id="modelsWrap"></div></section>` between chart and daily table; `render(p)` calls `renderModels(p.models)` on every poll/SSE refresh.
  - New CSS: `.models-empty`, `.share`, `.share-bar` (accent fill).
  - `dashboardI18n()` now embeds `modelsTitle` + `modelColumn`.
- [src/i18n.js](../../src/i18n.js): `modelsTitle` + `modelColumn` added to **all 4 locales in one batch** (en: 'Model Usage & Cost'/'Model'; ko: '모델별 사용량 & 비용'/'모델'; ja: 'モデル別使用量 & コスト'/'モデル'; zh: '模型使用量 & 成本'/'模型'). Suite 3 parity holds.

### Tests (REQ-110)
- [test/run-tests.js](../../test/run-tests.js): 3 payload-version assertions updated 1 → 2 (suite 15 schema test, dataJson test, suite 17 `/data.json` test); suite 15 extended with 2 new tests:
  1. `buildDashboardPayload should emit per-model rows costed with each session model (W4)` — two sessions with different models; asserts row shape, token sums, sessions/turns counts, `costUsd > 0`, differing per-model costs (proves per-session pricing), cost-desc sort.
  2. `renderDashboardHtml should include the Models section with share bars` — asserts `modelsWrap`, `renderModels`, `share-bar`, `modelsTitle` present in HTML.

## Result

**SUCCESS — all verification gates pass with live evidence.**

| Gate | Evidence |
|---|---|
| 1. Full suite | `node test/run-tests.js` → **89 passed, 0 failed, 89 total** (17 suites), exit 0 |
| 2. Badge link | `node bin/agy-tokens.js --hook --raw` → single line: `⚡ [Antigravity] Turn: 818 ($0.0005) \| Today: 13.29M ($1.419) \| Cache: 99% \| ]8;;file:///C:/Users/k1yt/.gemini/antigravity-dashboard/dashboard.html📊 Dashboard]8;;` (OSC 8 wrapped; escapes render invisibly in a real terminal) |
| 2b. --no-link | `node bin/agy-tokens.js --hook --raw --no-link` → badge ends at `Cache: 99%`, no Dashboard segment |
| 3. Payload models | `--hook --raw --write-dashboard` → `dashboard-data.js` contains `"models":[...]` with 3+ entries and per-model `costUsd`: Claude Opus 4.6 (Thinking) $70.74 (27 sessions / 1,981 turns), Gemini 3.7 Flash (High) $17.14 (457 sessions / 45,178 turns), gemini-4.0-flash-next … |
| 4. HTML Models section | `node bin/agy-tokens.js --html` → dashboard.html contains `modelsWrap` ✓, `renderModels` ✓, `share-bar` ✓, `modelsTitle` ✓, `modelColumn` ✓; embedded payload `version: 2` |
| Performance | `Measure-Command` ×3: 728/717/722 ms wall — dominated by node startup + 50 ms stdin timeout, same profile as the pre-batch baseline (~472–479 ms in prior report; current machine load higher). Script work remains in the same ~35 ms delta class; no per-turn Date parsing added (models pass rides the existing single pass) |
| Constraints | Zero new npm deps ✓ · atomic tmp+rename writes unchanged ✓ · `--serve` 127.0.0.1-only unchanged ✓ · file:// script-tag polling only (no `fetch(`) ✓ · skills/, hooks.json, installers, README, `AppData\Local\agy\**`, `~/.gemini/**` untouched ✓ · no git commit/push ✓ |

## Issues Discovered

1. **i18n ja block diff mismatch on first apply** — the ja `tableTitle` value is `日別内訳 (30日間)`, not the `日別詳細 (30日)` I assumed from the ko/zh pattern; the multi-block diff applied en/ko/zh but failed ja. Re-read the exact ja lines and applied a targeted second diff. Lesson: never pattern-guess CJK locale strings; read each block.
2. **Per-turn model granularity is not achievable from transcripts** — transcript records (`step_index`/`source`/`type`/`content`) carry no model field, so true per-turn costing would require agy-side changes (out of scope). Per-session model costing (sessions persist `modelName` at parse time) is the maximum accuracy available from the data layer; implemented that.
3. **Version assertions in 3 places** — suite 17's `/data.json` test also asserted `version === 1`; caught via search before running tests, updated all 3 in one batch.

## Next Step Recommendations

1. **VP deploy check (live gate REQ-111 remainder)**: restart agy and confirm the badge shows the clickable `📊 Dashboard` (Ctrl+Click opens the dashboard). If agy's statusline renderer strips OSC 8, the plain-text label remains (architect report §2.7 R1) — report back if so.
2. The npm-global copy (`AGY-TO~1`) must be refreshed (`npm link` / reinstall) before the live statusline picks up these changes — the statusline runs the global install, not this repo checkout.
3. Later batches (per plan): delete skills/hooks.json/installers + README rewrite (REQ-102..106) — untouched here by mandate.

## Affected File List

**Modified:**
- [src/index.js](../../src/index.js) (hook branch link build + osc8 import)
- [src/hook-handler.js](../../src/hook-handler.js) (link param passthrough to renderRealTimeBadge)
- [src/html-report.js](../../src/html-report.js) (payload v2, models array, per-session costing, Models HTML section, share bars, i18n embedding)
- [src/i18n.js](../../src/i18n.js) (modelsTitle + modelColumn ×4 locales)
- [test/run-tests.js](../../test/run-tests.js) (version 1→2 ×3, suite 15 +2 W4 tests)

**Untouched (verified by mandate):** `integrations/skills/**`, `integrations/hooks.json`, `scripts/install.*`, `README.md`, `src/osc8.js`, `src/formatter.js`, `src/aggregator.js`, `src/log-parser.js`, `src/cache-manager.js`, `src/config.js`, `bin/*`, `package.json`, `C:\Users\k1yt\AppData\Local\agy\**`, `~/.gemini/**` (except the dashboard artifacts the tool itself writes).