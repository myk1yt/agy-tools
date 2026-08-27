# Code Light Task Report

## Task Summary
P5 fix for `getModelPricing()` settings-fallback path (Issue 1 from technical review `074200_debug-report.md`). When `modelName` is empty/undefined, the settings fallback string was NOT suffix-stripped, causing potential 12× under-costing for suffixed model names without alias substring matches.

## Actions Taken
1. **Read** [`getModelPricing()`](src/config.js:454) and [`getBaseModelName()`](src/config.js:442) in `src/config.js` to confirm the bug on line 457.
2. **Applied one-line fix** in [`src/config.js`](src/config.js:457): changed `getBaseModelName(modelName) || getActiveModelFromSettings()` → `getBaseModelName(modelName || getActiveModelFromSettings())` so the settings fallback is always suffix-stripped.
3. **Added one test** in [`test/run-tests.js`](test/run-tests.js:271): new assertion "Should resolve suffixed model name via settings-fallback path (REQ-256)" covering:
   - `getBaseModelName(getActiveModelFromSettings())` returns a string with no parenthesized suffix
   - `getModelPricing('Claude Opus 4.6 (Thinking)')` resolves to `claude-3-opus` (pro tier)
4. **Ran full test suite**: 125 passed, 0 failed.
5. **Spot-checked** no-arg and empty-string paths: both resolve to `gemini-3.7-flash` (base model, suffix stripped).

## Result
✅ **Success** — all 125 tests green. The fix is minimal, surgical, and correctly ensures pricing always resolves on the base model (suffix stripped) including the no-arg/settings-fallback path.

### Evidence
```
node test/run-tests.js
→ Tests: 125 passed, 0 failed, 125 total (Duration: 2675ms)

node -e "..." → no-arg pricing id: gemini-3.7-flash, inputPerMillion: 0.15
                 empty-string id: gemini-3.7-flash
                 settings base: Gemini 3.7 Flash
```

## Issues Discovered
None. The fix is clean and self-contained.

## Next Step Recommendations
- VP can proceed with P5 completion marking.
- No follow-up fixes needed for this issue.

## Affected File List
- [`src/config.js`](src/config.js:457) — line 457: parenthesization change in `getModelPricing()`
- [`test/run-tests.js`](test/run-tests.js:271) — lines 271–278: new REQ-256 assertion in suite 2
