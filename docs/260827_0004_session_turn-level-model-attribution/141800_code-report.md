# Code Task Report — Batch 2: Turn-Level Aggregation in HTML Report

## Task Summary
Implemented Batch 2 of 3 for agy-tokens v3.4 turn-level model attribution. In [`src/html-report.js`](src/html-report.js:134), [`buildDashboardPayload()`](src/html-report.js:100) was restructured to aggregate `modelsMap` and `dailyModelsMap` by `turn.modelName` instead of `session.modelName`, with full backward-compatibility fallback (`turn.modelName || session.modelName || opts.modelName || 'unknown'`). For session counting (REQ-306), a `modelsSeenInSession` `Set` tracks distinct active models per session, granting +1 `sessions` count to every model used in ≥1 turn. Turn-level costs are accumulated from `turn.costUsd` (with recomputation fallback for legacy fixtures). `DASHBOARD_PAYLOAD_VERSION` remains at `3` (AD-1).

Report Folder: `docs/260827_0004_session_turn-level-model-attribution/`

---

## Actions Taken

1. **[`src/html-report.js`](src/html-report.js:134)**:
   - Modified the per-session loop in [`buildDashboardPayload(sessions, opts)`](src/html-report.js:100) to resolve `sessionFallbackModel = session.modelName || modelName || 'unknown'` and maintain a `modelsSeenInSession` `Set` per session.
   - For each turn in `session.turns`:
     - Resolved `turnModel = turn.modelName || sessionFallbackModel`.
     - Retrieved or initialized `modelsMap.get(turnModel)`.
     - Implemented session-counting semantics (REQ-306): if `!modelsSeenInSession.has(turnModel)`, incremented `modelRow.sessions += 1` and added `turnModel` to `modelsSeenInSession`.
     - Incremented `modelRow.turns += 1`, `inputTokens`, `cachedTokens`, `outputTokens`.
     - Cost accumulation: prioritized parser's accurate `turn.costUsd` (if typeof number), falling back to [`calculateCostUsd(turn.inputTokens, turn.cachedTokens, turn.outputTokens, turnModel)`](src/html-report.js:176) if absent; accumulated [`calculateCacheSavingsUsd(turn.cachedTokens, turnModel)`](src/html-report.js:177).
     - Keyed `dailyModelsMap[key][turnModel]` and `dailyModelSessions[key][turnModel]` by `turnModel`.
   - Removed obsolete session-level token/cost bulk additions to `modelRow`.
2. **[`docs/260827_0004_session_turn-level-model-attribution/requirement-checklist.md`](docs/260827_0004_session_turn-level-model-attribution/requirement-checklist.md)**:
   - Marked REQ-305 and REQ-306 complete.

---

## Result (+ Evidence)

### 1. Test Suite Verification
Executed full test suite via `node test/run-tests.js`:
- All 18 test suites passed: **126 passed, 0 failed, 126 total**.
- Suite 15 (HTML Dashboard Report Unit Tests) passed all 23 tests cleanly, verifying that fallback chains work seamlessly with existing fixtures (including effort variant pricing tests).

```text
=======================================================
   Antigravity CLI Developer Toolkit (agy-tools) Test Suite
=======================================================
...
▶ 15. HTML Dashboard Report Unit Tests
  ✓ buildDashboardPayload should produce the DashboardPayload schema
  ✓ renderDashboardHtml should embed payload, polling script, and SSE upgrade
  ✓ writeDashboardFiles should atomically write all 3 artifacts (force mode)
  ✓ writeDashboardFiles should throttle unchanged payloads (skip)
  ✓ ensureDashboardHtml should self-heal missing HTML only
  ✓ buildDashboardPayload should emit per-model rows costed with each session model (W4)
  ✓ buildDashboardPayload should generate dailyModels map and isRtl flag
  ✓ renderDashboardHtml should include the Models section with share bars
  ✓ buildDashboardPayload should include full i18n object for each supported locale
  ✓ writeDashboardFiles should force regeneration on locale change
  ✓ writeDashboardFiles should rewrite HTML when embedded payload is stale (E13b)
  ✓ renderDashboardHtml should include updateI18N function and lang attribute
  ✓ renderDashboardHtml should include Filter UI (CSS, HTML, and client-side JS)
  ✓ renderDashboardHtml should use v3.1 layout order: chart panel before cards before filters
  ✓ renderDashboardHtml should order date filter buttons today/yesterday/7d/30d/custom with today default active (REQ-241)
  ✓ renderDashboardHtml should guard against stale (pre-v3) SSE/poll payloads (REQ-244)
  ✓ renderSvg should fall back to single-series bars when dailyModels is missing (REQ-244)
  ✓ getFilteredData should degrade gracefully when dailyModels is missing (REQ-244)
  ✓ renderTable should render per-model sub-rows from dailyModels (REQ-243)
  ✓ renderDashboardHtml should include stacked per-model chart JS with legend and custom 5th card logic
  ✓ renderDashboardHtml should include estimate panel markup, CSS, and client JS (REQ-250..253)
  ✓ renderDashboardHtml should render disclaimer text and activeModel label logic (REQ-250, 258)
  ✓ buildDashboardPayload should keep effort variants distinct but costed at base-model rates (REQ-255, 256)

=======================================================
  Tests: 126 passed, 0 failed, 126 total
  Duration: 22211ms
=======================================================
```

### 2. Live Gate Verification (`dashboard-data.json`)
Executed `node bin/agy-tokens.js --hook --raw --write-dashboard` and inspected the written `dashboard-data.json`:

```text
Version: 3
Models count: 8
Models summary: [
  { model: 'Claude Opus 4.6 (Thinking)', sessions: 21, turns: 864, costUsd: 35.605164 },
  { model: 'Gemini 3.7 Flash (High)', sessions: 462, turns: 42081, costUsd: 15.053368 },
  { model: 'Gemini 3.6 Flash (High)', sessions: 8, turns: 1710, costUsd: 1.098854 },
  { model: 'Gemini 3.6 Flash (Medium)', sessions: 6, turns: 384, costUsd: 0.141978 },
  { model: 'Gemini 3.7 Flash (Medium)', sessions: 2, turns: 12, costUsd: 0.003775 },
  { model: 'Gemini 3.1 Pro (Low)', sessions: 1, turns: 2, costUsd: 0.002911 },
  { model: 'Gemini 3.6 Flash (Low)', sessions: 1, turns: 2, costUsd: 0.000359 },
  { model: 'Gemini 3.5 Flash (Low)', sessions: 1, turns: 2, costUsd: 0.000332 }
]
Dates with models: [ '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28' ]
Date 2026-08-27 models: [ 'Gemini 3.7 Flash (High)', 'Claude Opus 4.6 (Thinking)' ]
Date 2026-08-28 models: [
  'Gemini 3.7 Flash (High)',
  'Gemini 3.7 Flash (Medium)',
  'Gemini 3.6 Flash (Low)',
  'Gemini 3.5 Flash (Low)',
  'Gemini 3.1 Pro (Low)'
]
```

- Multi-model sessions properly populated 8 distinct model rows in `models[]`.
- `dailyModels` keys accurately split across models per day.
- Per-model `sessions` and `turns` counts aggregated correctly.

---

## Issues Discovered
None. All existing payload structures, client rendering paths, and tests remain 100% compatible.

---

## Next Step Recommendations
- Proceed with **Batch 3** in [`test/run-tests.js`](test/run-tests.js):
  - Add Suite 4 test for multi-settings-change turn-level attribution (REQ-307).
  - Add Suite 15 test for multi-model session payload aggregation (REQ-308).
  - Verify overall test count increases (126 → 129+).

---

## Affected File List
- [`src/html-report.js`](src/html-report.js) (modified — turn-level aggregation in [`buildDashboardPayload`](src/html-report.js:100))
- [`docs/260827_0004_session_turn-level-model-attribution/requirement-checklist.md`](docs/260827_0004_session_turn-level-model-attribution/requirement-checklist.md) (modified — marked REQ-305, REQ-306 complete)
- [`docs/260827_0004_session_turn-level-model-attribution/141800_code-report.md`](docs/260827_0004_session_turn-level-model-attribution/141800_code-report.md) (created — this report)
