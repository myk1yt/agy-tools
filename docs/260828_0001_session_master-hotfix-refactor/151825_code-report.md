# Code Task Report: B3 Part 2 - Turn-Level Model Attribution + Cost Calculation

## Status
COMPLETE: Implemented turn-level model attribution preservation, settings change regex capture for both from/to models, initial turn backtracking, per-turn cost summation in summarizeTurns with legacy fallback, and comprehensive test suite additions.

## Objective and Scope
- **Objective**: Fix turn-level model attribution and cost calculation across transcript parsing and aggregation so that initial turns in sessions with early model switches are correctly attributed to the starting model, and turn summaries sum per-turn costs rather than recalculating with a single model.
- **Acceptance Criteria**:
  1. `SETTINGS_CHANGE_RE` captures both `from` (group 1) and `to` (group 2) models.
  2. `parseTranscriptFile` tracks line indices for settings changes and turns, backtracking turns prior to the first settings change to `fromModel` when `fromModel` is valid and not "None".
  3. `parseTranscriptFile` recalculates `sessionCostUsd` and `sessionCacheSavingsUsd` when backtracking occurs.
  4. `summarizeTurns` sums `turn.costUsd` directly when available, falling back to single-model token calculation only when per-turn costs are missing.
  5. All 141 tests pass cleanly with zero new dependencies.
- **Problem Scope**: Model attribution inaccuracy in multi-model transcripts and token cost aggregation loss.
- **Expected Edit Scope**: [`src/log-parser.js`](src/log-parser.js), [`src/aggregator.js`](src/aggregator.js), [`test/run-tests.js`](test/run-tests.js).
- **Actual Edit Scope**: [`src/log-parser.js`](src/log-parser.js), [`src/aggregator.js`](src/aggregator.js), [`test/run-tests.js`](test/run-tests.js).
- **Scope Expansions**: None.
- **Risk Level**: LOW.

## Root Cause or Rationale
- **Symptom**: When a session started with a model different from current settings and switched models, early turns received the current active settings model rather than the historical initial model. Additionally, `summarizeTurns` recalculated costs using a single model for all turns, ignoring multi-model per-turn costs.
- **Root Cause**: `SETTINGS_CHANGE_RE` discarded the `from` capture group with `.+?`, and `summarizeTurns` unilaterally called `calculateCostUsd` over aggregate tokens with a single `modelName` parameter.
- **Why the Fix Works**: Capturing `fromModel` allows deterministic backtracking of all turns recorded prior to the first `<USER_SETTINGS_CHANGE>` line index. Summing `turn.costUsd` preserves heterogeneous model pricing without breaking legacy caller contracts via conditional fallback.

## Changes
| File | Change | Reason |
|------|--------|--------|
| [`src/log-parser.js`](src/log-parser.js:37) | Update `SETTINGS_CHANGE_RE` capture groups `from (.+?) to ([^\n]+?)` | REQ-002a: Capture both previous and new model |
| [`src/log-parser.js`](src/log-parser.js:138) | Add `settingsChanges`, `turnLineIndices`, `lineIndex` tracking and post-loop backtracking | REQ-002b: Backtrack pre-switch turns to initial `fromModel` and recalculate session totals |
| [`src/aggregator.js`](src/aggregator.js:59) | Update [`summarizeTurns()`](src/aggregator.js:59) to accumulate `turn.costUsd` with legacy fallback | REQ-002d: Support mixed-model turn arrays without cost distortion |
| [`test/run-tests.js`](test/run-tests.js:2714) | Added Suite 21 with 5 unit and integration tests | Verify turn-level attribution, backtracking, mixed-model sums, empty arrays, and legacy fallbacks |

## Preserved Invariants
- Zero new external dependencies.
- Private line index tracking kept in parallel `turnLineIndices` array (no `_lineIndex` leak into turn objects).
- Backward compatibility: `summarizeTurns` accepts `modelName` and falls back to single-model recalculation when `turn.costUsd` is absent.
- `cacheSavingsUsd` recalculated during backtracking and preserved across session summaries.

## Verification
| Level | Command/Check | Result | Evidence |
|-------|--------------|--------|----------|
| L1 (Structural) | `git diff src/log-parser.js src/aggregator.js test/run-tests.js` | PASS | Clean diff, verified syntax |
| L2 (Targeted) | `node test/run-tests.js` (Suite 21) | PASS | 5 new tests passing for turn-level attribution & cost sums |
| L3 (Affected Scope) | `node test/run-tests.js` (All Suites 1-21) | PASS | 141/141 tests passing |
| L4 (Regression) | `node scripts/verify-i18n.js`, `node scripts/verify-dashboard-link.js` | PASS | All hooks, locale switching, and live server endpoints functioning |

## Issues Found
| Classification | Issue | Action |
|----------------|-------|--------|
| None | N/A | None |

## Not Verified
None — all unit, regression, and script verification checks were executed locally and passed.

## Remaining Risks
None identified.

## Final Statement
COMPLETE — B3 Part 2 implementation satisfies all requirements (REQ-002a, REQ-002b, REQ-002d) with 100% test pass rate.
