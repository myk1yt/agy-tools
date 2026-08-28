# Technical Review Report — agy-tokens v3.4 (Turn-Level Model Attribution)

**Reviewer**: Debug (Technical Reviewer) — independent of the implementing agents
**Commit under review**: `f4ae9dad9ec1f129e17b0f83758132df9891ca63` (`feat(parser): turn-level model attribution`)
**Branch**: main
**Review date**: 2026-08-28 14:31 KST
**Review mode**: READ-ONLY on `src/` — no source files modified. Evidence gathered via an independent runtime probe ([`review-probe.js`](docs/260827_0004_session_turn-level-model-attribution/review-probe.js)) plus direct source inspection.

---

## Verdict

**PASS** — all nine requirements (REQ-301..309) verified against code reality with runtime evidence, not report claims. 129/129 tests pass. Per-turn pricing is provably correct. Backward compatibility and the `'unknown'` edge case are handled gracefully.

---

## 1. Test Execution (independent re-run)

Command: `node test/run-tests.js` (cwd = repo root, exit code **0**)

```text
Tests: 129 passed, 0 failed, 129 total
Duration: 9069ms
```

- Exact counts: **129 passed / 0 failed / 129 total** across **18 suites**. Matches the claimed baseline (129) and the Batch-3 report. Raw output captured to artifact `cmd-1787894908145.txt`.
- Working tree at HEAD `f4ae9da`; only one untracked, unrelated docs file (`docs/260827_0003_.../120800_ask-report.md`). No source drift. Scope confidence: HIGH.

---

## 2. Per-REQ Verdict

| REQ | Requirement | Verdict | Evidence (source, not reports) |
|---|---|---|---|
| **REQ-301** | `currentActiveModel` state machine in log-parser | ✅ PASS | Declared and initialized from `modelName \|\| getActiveModelFromSettings()` at [`src/log-parser.js:136`](src/log-parser.js:136); reassigned on each `<USER_SETTINGS_CHANGE>` block at [`src/log-parser.js:183`](src/log-parser.js:183). Update happens **before** the turn push, so the change applies to the containing turn — matches the architect's boundary rule. |
| **REQ-302** | `turn.modelName` stamped + per-turn cost with correct model pricing | ✅ PASS | Turn push carries `modelName: currentActiveModel` at [`src/log-parser.js:257`](src/log-parser.js:257); cost computed per-turn via `calculateCostUsd(..., currentActiveModel)` at [`src/log-parser.js:236`](src/log-parser.js:236). Pricing correctness independently proven by probe P1 (see §5). |
| **REQ-303** | `session.modelName` backward compat + `session.models` array | ✅ PASS | `modelName: currentActiveModel` (LAST active) at [`src/log-parser.js:283`](src/log-parser.js:283); `models` built at [`src/log-parser.js:267`](src/log-parser.js:267) and returned at `:284`. Probe P1 confirmed `modelName='Claude Opus 4.6 (Thinking)'` and `models=['Gemini 3.7 Flash (Low)','Claude Opus 4.6 (Thinking)']` for a Flash→Opus transcript. See note in §6 (implementation differs slightly from the architect's `modelsUsed` plan but is semantically equivalent). |
| **REQ-304** | `CACHE_SCHEMA_VERSION = 4` | ✅ PASS | [`src/cache-manager.js:14`](src/cache-manager.js:14) — `const CACHE_SCHEMA_VERSION = 4;` with v4 rationale comment (lines 11–13). [`loadCache()`](src/cache-manager.js:21) rejects any `version !== CACHE_SCHEMA_VERSION` (line 33) → old schema-3 caches auto-invalidate and re-parse once. |
| **REQ-305** | `buildDashboardPayload` aggregates by `turn.modelName` | ✅ PASS | Per-turn key `turnModel = turn.modelName \|\| sessionFallbackModel` at [`src/html-report.js:142`](src/html-report.js:142); fallback chain root `sessionFallbackModel = session.modelName \|\| modelName \|\| 'unknown'` at [`src/html-report.js:137`](src/html-report.js:137). `modelsMap` / `dailyModelsMap` both keyed by `turnModel` (lines 143, 182). Probe P3/P4 confirm the full chain. |
| **REQ-306** | Session count per model (`modelsSeenInSession` Set) | ✅ PASS | `modelsSeenInSession = new Set()` at [`src/html-report.js:138`](src/html-report.js:138); `+1 sessions` only on first sight of a model in a session at lines 160–163. Probe P5: a 2-model single session yields both `sessions===1` while `cacheStats.totalSessions===1`. |
| **REQ-307** | Suite 4 turn-level parser tests | ✅ PASS | Two tests at [`test/run-tests.js:662`](test/run-tests.js:662) (2-switch) and [`test/run-tests.js:719`](test/run-tests.js:719) (3-switch). Both ran green in the live suite. The 3-switch test asserts per-turn boundaries (turns 0-1 Flash-Low, 2-5 Flash-High, 6-7 Opus) and `costUsd === Σ turn.costUsd` within 1e-9. |
| **REQ-308** | Suite 15 multi-model payload test | ✅ PASS | [`test/run-tests.js:2208`](test/run-tests.js:2208) — fixture spans two dates with mixed `turn.modelName` values; asserts 2 independent `models[]` rows, each `sessions===1`, correct per-date `dailyModels` split, and `cacheStats.totalSessions===1`. Ran green. |
| **REQ-309** | All tests pass | ✅ PASS | 129/129, exit 0 (see §1). |

---

## 3. Regression Check — old sessions without `turn.modelName`

**PASS.** Old data is protected at two layers:

1. **Cache layer**: schema bump to 4 (REQ-304) forces every cached schema-3 session to re-parse once, so real cached transcripts re-acquire `turn.modelName`. There is no path for a stale schema-3 session to survive in the cache.
2. **Payload-builder layer**: even for hand-built / legacy fixtures that still lack `turn.modelName`, the fallback chain resolves them:
   - Existing suite-15 fixtures (e.g. the W4 effort-variant and single-model fixtures) supply `session.modelName` + turns **without** `modelName` → they resolve through `sessionFallbackModel` and produced **identical rows** (all 23 suite-15 tests stayed green).
   - Suite-4 legacy fixtures (`REQ-254`/`255` family) assert `parsed.modelName` only and are unaffected by the new `turn.modelName` field.

Probe P3 independently confirmed: a fixture with `session.modelName='Gemini 3.7 Flash (High)'` and 2 turns lacking `modelName` yields exactly one model row with `turns=2, sessions=1`.

---

## 4. Edge Cases

**No modelName anywhere → `'unknown'`, graceful. PASS.**

Probe P2 fed `buildDashboardPayload` a session whose turn had **no** `modelName`, the session had **no** `modelName`, and `opts` had **no** `modelName`:

- Result: exactly one model row keyed **`"unknown"`**, `turns=1`, `costUsd` a finite number, no exception, payload `version===3` intact.
- Chain resolution: `turn.modelName` (absent) → `session.modelName` (absent) → `opts.modelName` (absent) → `'unknown'`. The `'unknown'` row is then priced via the recompute fallback `calculateCostUsd(..., 'unknown')`, which resolves through the smart-heuristic default tier in [`src/config.js:getModelPricing`](src/config.js:454) without throwing.

**Empty-turns session**: [`src/log-parser.js:284`](src/log-parser.js:284) guards with `models.length > 0 ? models : (currentActiveModel ? [currentActiveModel] : [])`, and `currentActiveModel` is always a non-empty string (defaults to `'Gemini 3.7 Flash (High)'` from [`getActiveModelFromSettings()`](src/config.js:416) when no param/settings). No `undefined`/`null` can leak into `session.models`.

---

## 5. Pricing Correctness — per-turn vs session-level model

**PASS — proven with runtime evidence (probe P1), not assertion.**

Parsed a real transcript switching `Gemini 3.7 Flash (Low)` → `Claude Opus 4.6 (Thinking)` and compared each turn's `costUsd` against both candidate rates:

```text
turn[0] model=Gemini 3.7 Flash (Low)  cost=0.00018465  ownRate=0.00018465  sessionModelRate=0.018465   matchesOwn=true  equalsSessionRate=false
turn[1] model=Gemini 3.7 Flash (Low)  cost=0.0000036   ownRate=0.0000036   sessionModelRate=0.00045    matchesOwn=true  equalsSessionRate=false
turn[2] model=Claude Opus 4.6 (Think) cost=0.00242550  ownRate=0.00242550  sessionModelRate=0.00242550 matchesOwn=true  equalsSessionRate=true
turn[3] model=Claude Opus 4.6 (Think) cost=0.00045000  ownRate=0.00045000  sessionModelRate=0.00045000 matchesOwn=true  equalsSessionRate=true
```

- Flash turns were priced at **Flash rates** (0.000185 / 0.0000036), NOT at the session-level Opus rate (which would have been 0.0185 / 0.00045 — a **100× overcharge**). This is the decisive proof that the v3.3 split-brain is gone.
- `session.costUsd (0.00306375) === Σ turn.costUsd` exactly (< 1e-9).
- Note: `getModelPricing` strips the effort suffix via [`getBaseModelName()`](src/config.js:442), so `(Low)`/`(Thinking)` variants resolve to base-model rates — consistent with the v3.3 documented behavior and the suite-15 effort-variant test.

---

## 6. Issues Discovered

**None blocking.** Two informational observations (no action required):

1. **Implementation deviation from architect plan (semantically equivalent, OK).** The architect (AD-4) specified a `modelsUsed` array maintained in-loop via `includes()`. The shipped code instead derives `models` post-loop at [`src/log-parser.js:267`](src/log-parser.js:267) with `[...new Set(turns.map(t => t.modelName).filter(Boolean))]`. `Set` preserves insertion order, so first-appearance order is still guaranteed; the `.filter(Boolean)` also guards against any turn with a falsy `modelName`. Probe P1 confirmed correct ordering `['Gemini 3.7 Flash (Low)','Claude Opus 4.6 (Thinking)']`. This is a cleaner, equivalent implementation — not a defect.
2. **Pre-existing, out of scope (carried over from v3.3, previously documented).** [`summarizeTurns()`](src/aggregator.js:59) prices the today/7d/30d summary cards with the *global* `modelName`, while `models[]`/`dailyModels` are now turn-accurate. This was explicitly declared out of scope in the architect report (R9 / Issues #2) and is consistent with the estimate-only nature of the summary cards. Recommend tracking as a future REQ if per-turn summary pricing is ever desired — do **not** scope-creep into v3.4.

---

## 7. Affected File List

**Modified by the commit under review (verified against source):**
- [`src/log-parser.js`](src/log-parser.js) — `currentActiveModel` state machine, per-turn `modelName` + per-turn pricing, `session.models`
- [`src/cache-manager.js`](src/cache-manager.js) — `CACHE_SCHEMA_VERSION` 3 → 4
- [`src/html-report.js`](src/html-report.js) — `buildDashboardPayload` turn-level aggregation + `modelsSeenInSession`
- [`test/run-tests.js`](test/run-tests.js) — Suite 4 (+2, REQ-307), Suite 15 (+1, REQ-308)

**Created by this review (evidence artifacts, no source impact):**
- `docs/260827_0004_session_turn-level-model-attribution/review-probe.js` — independent runtime probe (12/12 PASS)
- `docs/260827_0004_session_turn-level-model-attribution/143100_debug-report.md` — this report

---

## 8. Recommendation

**Approve.** agy-tokens v3.4 meets every stated requirement with provable per-turn pricing correctness, intact backward compatibility, and graceful degradation on the `'unknown'` edge case. Ready for the P6 Final Ask Audit / VP review. No fixes required from the implementation agents.
