# Code Task Report — Batch 1: Turn-Level Model Attribution & Cache Bump

## Task Summary
Implemented Batch 1 of 3 for agy-tokens v3.4 turn-level model attribution. In [`src/log-parser.js`](src/log-parser.js), `parseTranscriptFile` was updated to track `currentActiveModel` across `<USER_SETTINGS_CHANGE>` blocks during stream parsing, stamp every turn object with `modelName: currentActiveModel`, compute each turn's cost using its active model's pricing rates, accumulate turn-accurate session costs/savings, and return `session.modelName` (last active model) along with `session.models` (ordered unique models used). In [`src/cache-manager.js`](src/cache-manager.js), `CACHE_SCHEMA_VERSION` was bumped from 3 to 4 to ensure single-pass cache auto-invalidation and re-parsing.

Report Folder: `docs/260827_0004_session_turn-level-model-attribution/`

---

## Actions Taken

1. **[`src/log-parser.js`](src/log-parser.js:113)**:
   - Added `currentActiveModel` tracking initialized from `modelName || getActiveModelFromSettings()`.
   - Updated `<USER_SETTINGS_CHANGE>` handling in `USER_INPUT`/`USER_EXPLICIT` blocks so that detected model changes take effect immediately on `currentActiveModel` for the containing turn and all subsequent turns.
   - Calculated each turn's cost via [`calculateCostUsd(turnInputTokens, turnCachedTokens, turnOutputTokens, currentActiveModel)`](src/log-parser.js:234) and cache savings via [`calculateCacheSavingsUsd(turnCachedTokens, currentActiveModel)`](src/log-parser.js:235).
   - Accumulated `sessionCostUsd` and `sessionCacheSavingsUsd` within the streaming loop.
   - Attached `modelName: currentActiveModel` to every turn object pushed to `turns`.
   - Post-loop: set `session.modelName = currentActiveModel` (preserving LAST-active model semantics for backward compatibility), `session.models = [...new Set(turns.map(t => t.modelName).filter(Boolean))]` (ordered unique models), and used accumulated `sessionCostUsd` / `sessionCacheSavingsUsd`.
2. **[`src/cache-manager.js`](src/cache-manager.js:14)**:
   - Bumped [`CACHE_SCHEMA_VERSION`](src/cache-manager.js:14) from `3` to `4` with rationale comment.
3. **[`docs/260827_0004_session_turn-level-model-attribution/requirement-checklist.md`](docs/260827_0004_session_turn-level-model-attribution/requirement-checklist.md)**:
   - Marked REQ-301, REQ-302, REQ-303, REQ-304 as completed.

---

## Result (+ Evidence)

### 1. Test Suite Verification
Executed full test suite via `node test/run-tests.js`:
- Baseline test count: **126 passed, 0 failed** across 18 test suites.
- All existing parser tests (Suite 4) and cache manager tests (Suite 5) passed cleanly with no regressions.

```text
=======================================================
   Antigravity CLI Developer Toolkit (agy-tools) Test Suite
=======================================================
...
▶ 4. Log Parser Unit Tests
  ✓ Should parse transcript.jsonl stream into structured session
  ✓ Should handle malformed or empty lines gracefully
  ✓ Should extract effort-suffixed model from USER_SETTINGS_CHANGE blocks (REQ-254)
  ✓ Should fall back to param model when no USER_SETTINGS_CHANGE present (REQ-254)
  ✓ Should use the LAST settings-change when multiple blocks exist (REQ-254)
  ✓ Should sanitize trailing boilerplate from settings-change model name (REQ-255)

▶ 5. Cache Manager Unit Tests
  ✓ Should return clean initial cache structure if file does not exist
  ✓ Should save and reload cache atomically
  ✓ Should clear cache file successfully
...
=======================================================
  Tests: 126 passed, 0 failed, 126 total
  Duration: 17890ms
=======================================================
```

### 2. Synthetic Multi-Model Transcript Verification
Created a synthetic transcript featuring 3 model settings transitions (`Gemini 3.7 Flash (Low)` → `Gemini 3.7 Flash (High)` → `Gemini 2.5 Pro (Low)`) and verified turn-level attribution:

```text
=== SESSION METRICS ===
sessionId: spotcheck-001
session.modelName (last active): Gemini 2.5 Pro (Low)
session.models: ["Gemini 3.7 Flash (Low)","Gemini 3.7 Flash (High)","Gemini 2.5 Pro (Low)"]
session.turnCount: 6
session.costUsd: 0.0007312
session.cacheSavingsUsd: 0.00134595

=== PER-TURN METRICS ===
Turn 0: step=0 source=USER_EXPLICIT model=Gemini 3.7 Flash (Low) cost=0.00018525
Turn 1: step=1 source=MODEL model=Gemini 3.7 Flash (Low) cost=0.0000024
Turn 2: step=2 source=USER_EXPLICIT model=Gemini 3.7 Flash (High) cost=0.0000527625
Turn 3: step=3 source=MODEL model=Gemini 3.7 Flash (High) cost=0.0000036
Turn 4: step=4 source=USER_EXPLICIT model=Gemini 2.5 Pro (Low) cost=0.00045718749999999997
Turn 5: step=5 source=MODEL model=Gemini 2.5 Pro (Low) cost=0.00003

Sum of turn costs: 0.0007312
Diff between session.costUsd and sum of turns: 0
```

- Each turn's `modelName` correctly matched the active model at that exact turn index.
- `session.models` correctly collected `["Gemini 3.7 Flash (Low)", "Gemini 3.7 Flash (High)", "Gemini 2.5 Pro (Low)"]` in first-appearance order.
- `session.modelName` correctly resolved to the last active model `Gemini 2.5 Pro (Low)`.
- `session.costUsd` matched the exact sum of individual turn costs.

---

## Issues Discovered
None. All existing logic and test assertions remain completely compatible.

---

## Next Step Recommendations
- Proceed with **Batch 2** in [`src/html-report.js`](src/html-report.js): update [`buildDashboardPayload()`](src/html-report.js:134) to aggregate `modelsMap` and `dailyModelsMap` by `turn.modelName` using the fallback chain (`turn.modelName → session.modelName → opts.modelName → 'unknown'`) and session-counting semantics per REQ-305 and REQ-306.

---

## Affected File List
- [`src/log-parser.js`](src/log-parser.js) (modified — `currentActiveModel` state machine, per-turn `modelName`, per-turn pricing, `session.models`)
- [`src/cache-manager.js`](src/cache-manager.js) (modified — `CACHE_SCHEMA_VERSION` 3 → 4)
- [`docs/260827_0004_session_turn-level-model-attribution/requirement-checklist.md`](docs/260827_0004_session_turn-level-model-attribution/requirement-checklist.md) (modified — marked REQ-301..304 complete)
- [`docs/260827_0004_session_turn-level-model-attribution/141100_code-report.md`](docs/260827_0004_session_turn-level-model-attribution/141100_code-report.md) (created — this report)
