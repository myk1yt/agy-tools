# Ask (CPO) Final Audit Report — agy-tokens v3.4 (Turn-Level Model Attribution)

**Auditor**: Ask (Chief Advisor / Final Validator) — independent of implementing agents
**Commit under audit**: `f4ae9da` (main)
**Audit date**: 2026-08-28 14:36 KST
**Mode**: Full Audit (P6)
**Method**: direct source inspection of all 4 changed files + cross-validation vs architect plan (AD-1..AD-7) + Debug's HEAD-linked runtime evidence. Test re-execution is outside Ask-mode capability; REQ-309 evidence is Debug's independent run (129/129, exit 0, artifact `cmd-1787894908145.txt`, HEAD-linked, no source drift since).

## User Intent (verbatim)

> "각 턴에서 실제로 사용된 모델별로 토큰과 비용을 정확히 분리하여 대시보드에 표시. 베이스 모델 요율 매핑(getBaseModelName) 및 상단 필터 체크박스가 턴�별 모델과 완벽히 연동."

---

## [1. Philosophy & UX/UI Diagnostics]

The outcome embodies the intent at its strongest reading: tokens AND cost are split per actually-used model at the finest available granularity (per turn), not approximated. The implementation satisfies the "boil the ocean" preference — no deferred work inside REQ scope:

- **Cost follows the model that generated the tokens** — per-turn `calculateCostUsd(..., currentActiveModel)` at [`src/log-parser.js:236`](src/log-parser.js:236) eliminates the v3.3 split-brain (Debug probe P1: Flash turns priced at Flash rates, avoiding a 100× overcharge under the session-level Opus rate).
- **Filter checkboxes "완벽히 연동" (perfectly synced)**: checkboxes are generated from `p.models` at [`src/html-report.js:702-714`](src/html-report.js:702), and `models[]` is now turn-granular (REQ-305), so every turn-level model automatically appears as an independent checkbox. `getFilteredData` re-aggregates from `dailyModels` keyed by the identical turn-level strings at [`src/html-report.js:776-790`](src/html-report.js:776) — no stale session-level key can survive in any rendered surface.
- **getBaseModelName integration**: [`src/config.js:442-445`](src/config.js:442) strips the trailing effort suffix; [`getModelPricing`](src/config.js:454) applies it at `:457` before lookup. `(High)`/`(Low)`/`(Thinking)` variants price at base-model rates while remaining distinct dashboard rows — matching the v3.3 effort-variant precedent.
- **UX risk**: none introduced. No client-JS, i18n, or CLI changes; payload schema unchanged (v3 rows may increase in count but never change shape). End users see strictly more accurate rows after one automatic cache re-parse.

**Usability note (pre-existing, out of scope)**: the today/7d/30d summary cards still price with the global active model ([`src/aggregator.js:59`](src/aggregator.js:59)) while `models[]` is turn-accurate. For mixed-model sessions a user may notice the summary card cost differs from the Σ of model rows. Documented in architect R9 as estimate-only scope; recommend a future REQ, not a v3.4 blocker.

## [2. 1:1 Cross-Validation Results — Plan vs Code]

| REQ | Requirement | Verdict | Evidence (direct source inspection) |
|---|---|---|---|
| **REQ-301** | `currentActiveModel` state machine in log-parser | ✅ | Declared/initialized from `modelName \|\| getActiveModelFromSettings()` at [`src/log-parser.js:114,136`](src/log-parser.js:136); reassigned on each `<USER_SETTINGS_CHANGE>` block at [`src/log-parser.js:183`](src/log-parser.js:183) — **before** the turn push, so the switch-carrying turn bears the new model (architect boundary rule honored). |
| **REQ-302** | `turn.modelName` stamped + per-turn cost with correct model pricing | ✅ | Turn push carries `modelName: currentActiveModel` at [`src/log-parser.js:257`](src/log-parser.js:257); per-turn cost at [`src/log-parser.js:236`](src/log-parser.js:236); session totals accumulated in-loop at `:242-243` (AD-3 turn-accurate totals). |
| **REQ-303** | `session.modelName` backward compat + `session.models` array | ✅ | `modelName: currentActiveModel` (LAST active, identical to v3.3 `finalModel`) at [`src/log-parser.js:283`](src/log-parser.js:283); `models` at `:267/:284` via `[...new Set(turns.map(t => t.modelName).filter(Boolean))]` — Set preserves first-appearance order; empty-turns guard at `:284`. Deviation from AD-4 (post-loop derivation vs in-loop `modelsUsed` array) is semantically equivalent and cleaner. |
| **REQ-304** | `CACHE_SCHEMA_VERSION = 4` | ✅ | [`src/cache-manager.js:14`](src/cache-manager.js:14) with v4 rationale comment; [`loadCache()`](src/cache-manager.js:21) rejects `version !== CACHE_SCHEMA_VERSION` at `:33` → schema-3 caches auto-invalidate, one re-parse. Suite 5 uses the symbolic constant → no breakage. |
| **REQ-305** | `buildDashboardPayload` aggregates by `turn.modelName` | ✅ | Fallback chain `sessionFallbackModel = session.modelName \|\| modelName \|\| 'unknown'` at [`src/html-report.js:137`](src/html-report.js:137); per-turn key `turnModel = turn.modelName \|\| sessionFallbackModel` at `:142`; `modelsMap` and `dailyModelsMap` both keyed by `turnModel` (`:143`, `:182`). Cost prefers `turn.costUsd` (`:169-172`). |
| **REQ-306** | Session count per model (`modelsSeenInSession` Set) | ✅ | [`src/html-report.js:138`](src/html-report.js:138); `+1 sessions` only on first sight per session at `:160-163`; `dailyModelSessions` Set-keyed by `turnModel` at `:203-208`; `cacheStats.totalSessions = list.length` at `:302` and `summaries.*.totalSessions` (Set-based) untouched — no session-count inflation. |
| **REQ-307** | Suite 4 turn-level parser tests | ✅ | 2-switch test at [`test/run-tests.js:662`](test/run-tests.js:662); 3-switch test at [`test/run-tests.js:719`](test/run-tests.js:719) with explicit per-turn boundaries (turns 0-1 Flash-Low, 2-5 Flash-High, 6-7 Opus), `session.models` deep-equal order assertion, and `costUsd === Σ turn.costUsd` within 1e-9. |
| **REQ-308** | Suite 15 multi-model payload test | ✅ | [`test/run-tests.js:2208`](test/run-tests.js:2208): fixture spans two dates with mixed `turn.modelName`; asserts 2 independent `models[]` rows, each `sessions === 1`, exact token/cost splits per date, and `cacheStats.totalSessions === 1`. |
| **REQ-309** | All tests pass | ✅ | Debug's independent run at HEAD `f4ae9da`: **129 passed / 0 failed / 129 total**, exit 0, raw output artifact `cmd-1787894908145.txt`. No source drift since (verified file-by-file against the commit's 4 changed files). Limitation: Ask mode cannot re-execute; evidence is HEAD-linked and from an agent independent of the implementers. |

**Cross-cutting audit items:**

| Item | Verdict | Evidence |
|---|---|---|
| Backward compat (old sessions without `turn.modelName`) | ✅ | Two layers: (1) schema bump 3→4 forces re-parse of every real cached session; (2) fallback chain at [`src/html-report.js:137,142`](src/html-report.js:137) resolves legacy/hand-built fixtures to `session.modelName`. All 23 suite-15 legacy-fixture tests green — identical rows. |
| Pricing correctness (per-turn vs session-level) | ✅ | Per-turn pricing inside the loop ([`src/log-parser.js:236`](src/log-parser.js:236)); Debug probe P1: Flash turns at Flash rates (0.000185) not session-level Opus rate (0.0185, 100× overcharge avoided); `session.costUsd === Σ turn.costUsd` < 1e-9. |
| Filter checkbox integration | ✅ | Checkboxes built from turn-granular `p.models` ([`src/html-report.js:702-714`](src/html-report.js:702)); `getFilteredData` re-aggregates from `dailyModels` keyed by identical strings (`:776-790`). Zero client changes needed — verified true. |
| `getBaseModelName` integration | ✅ | [`src/config.js:442-445`](src/config.js:442) strips effort suffix; [`getModelPricing`](src/config.js:454) applies at `:457`. Parser comment at [`src/log-parser.js:30-32`](src/log-parser.js:30) documents the contract. |

**Devil's advocate findings (non-blocking):**

1. 🟡 **Summary-card pricing asymmetry** (pre-existing, R9): `summaries.*` price with global model while `models[]`/`dailyModels` are turn-accurate. Mixed-model sessions will show a small discrepancy between summary cards and Σ of model rows. Out of REQ-301..309 scope; recommend future REQ.
2. 🟡 **Boundary semantics assumption**: the USER_INPUT turn carrying the settings change is stamped with the NEW model, meaning that turn's input tokens are priced at the new model's rate. Architect justified this ("change takes effect for that request"); cost impact is one user message — negligible, and matches REQ-307's expected test semantics.
3. 🟢 **dailyModels cost recompute** at [`src/html-report.js:241`](src/html-report.js:241) recomputes from summed tokens instead of Σ turn costs — mathematically equivalent since pricing is linear and each date-model bucket is single-model.
4. 🟢 **Evidence independence**: REQ-309 rests on Debug's captured run; Ask mode lacks command execution. Acceptable — HEAD-linked, artifact-captured, implementer-independent.

## [3. Inquiries for VP & User]

No blocking trade-off decisions. Two advisory items for future sessions (do not gate v3.4):

1. **Per-turn summary pricing** — should today/7d/30d cards also price per-turn (turn-accurate like `models[]`)? Option A: keep global-model estimate (current, zero cost, documented scope). Option B: extend `summarizeTurns` to price per turn (small effort, eliminates the card-vs-rows discrepancy). Recommendation: defer to a dedicated REQ; not v3.4 scope.
2. **Settings-change boundary semantics** — if real-world transcripts ever show the settings-change user message being processed by the OLD model, the boundary rule could flip. Current evidence (architect analysis + REQ-307 expectations) supports the shipped behavior. No action.

## [4. Final Verdict]

**PASS ✅** — intent fully met. All nine requirements (REQ-301..309) verified against code reality: turn-level tokens AND cost separation provably correct, `getBaseModelName` rate mapping intact, filter checkboxes automatically synced with turn-level models, backward compatibility preserved at two layers, 129/129 tests green at the audited commit. Proceed to P7 (VP independent review).

## Affected File List (audited)

- [`src/log-parser.js`](src/log-parser.js) — REQ-301/302/303 verified
- [`src/cache-manager.js`](src/cache-manager.js) — REQ-304 verified
- [`src/html-report.js`](src/html-report.js) — REQ-305/306 + filter integration verified
- [`test/run-tests.js`](test/run-tests.js) — REQ-307/308/309 verified
- [`src/config.js`](src/config.js) — `getBaseModelName`/`getModelPricing` integration verified (unchanged, as planned)
- `docs/260827_0004_session_turn-level-model-attribution/143600_ask-report.md` — this report
