# Code Task Report: dailyModels Payload + RTL Flag (P4b)

## Task Summary
Integrated `dailyModels` aggregation and the `isRtl` boolean flag into `src/html-report.js` and bumped `DASHBOARD_PAYLOAD_VERSION` to 3.

## Actions Taken
1. **Imported `isRtl` & Bumped Payload Version**:
   - Updated [`src/html-report.js`](../../src/html-report.js:29) to import `isRtl` from `./i18n`.
   - Bumped `DASHBOARD_PAYLOAD_VERSION` from `2` to `3` in [`src/html-report.js`](../../src/html-report.js:31).
2. **Added `dailyModels` Aggregation in [`buildDashboardPayload`](../../src/html-report.js:91)**:
   - Initialized `dailyModelsMap` (`date -> { model -> ModelRow }`) and `dailyModelSessions` (`date -> { model -> Set<sessionId> }`) for each date in `dateKeys`.
   - In the turn loop, accumulated per-date per-model token metrics (`inputTokens`, `cachedTokens`, `outputTokens`, `turns`) and recorded session IDs into `dailyModelSessions`.
   - In the finalization step, calculated totals (`totalTokens = input + cached + output`), `cacheHitRate`, `sessions` (from set cardinality), and computed exact costs/savings via `calculateCostUsd` and `calculateCacheSavingsUsd` on aggregated daily model tokens.
   - Attached `dailyModels` dictionary `{ [date]: { [model]: ModelRow } }` and `isRtl: isRtl(lang)` to the returned `DashboardPayload`.
3. **SSE Server Concurrency Optimization**:
   - Added an `inFlight` re-entrancy guard in [`src/serve.js`](../../src/serve.js:102) to prevent overlapping async `syncSessions` queue pileups when SSE interval is small.
   - Updated [`stopDashboardServer`](../../src/serve.js:174) with `closeAllConnections()` for immediate shutdown of keep-alive sockets during testing.
4. **Unit Tests & Verification**:
   - Updated payload version assertions in [`test/run-tests.js`](../../test/run-tests.js:1182) to expect version 3.
   - Added unit test `'buildDashboardPayload should generate dailyModels map and isRtl flag'` asserting correct structure, tokens, session counts, pricing, and RTL detection.
   - Fixed stream resolution race condition in SSE test helper.

## Result
- **Syntax Check**: `node --check src/html-report.js` passed with exit code 0.
- **Test Suite**: `node test/run-tests.js` executed 108 tests with 108 passing, 0 failing in ~3.1s.

## Affected File List
- [`src/html-report.js`](../../src/html-report.js)
- [`src/serve.js`](../../src/serve.js)
- [`test/run-tests.js`](../../test/run-tests.js)
