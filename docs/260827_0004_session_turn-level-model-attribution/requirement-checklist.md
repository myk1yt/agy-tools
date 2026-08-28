# Requirement Checklist
## Task: Turn-Level Model Attribution (v3.4)
## Date: 260827
## Session Folder: docs/260827_0004_session_turn-level-model-attribution/
## Baseline: git `8ce6618` (main), 126 tests / 18 suites PASS, payload v3

### A. log-parser.js — Turn-level model tracking
- [x] [REQ-301] `currentActiveModel` state tracked during transcript parsing; initialized from param or `getActiveModelFromSettings()`; updated on each `<USER_SETTINGS_CHANGE>` block
- [x] [REQ-302] Each turn object includes `modelName: currentActiveModel`; turn cost computed with `getModelPricing(currentActiveModel)`
- [x] [REQ-303] `session.modelName` preserved (last active model, backward compat); `session.models` array added (unique model names used in session)

### B. cache-manager.js — Schema bump
- [x] [REQ-304] `CACHE_SCHEMA_VERSION` 3 → 4; old cache auto-invalidated

### C. html-report.js — Turn-level aggregation
- [x] [REQ-305] `buildDashboardPayload` aggregates by `turn.modelName` (fallback to `session.modelName` then `'unknown'`); `modelsMap` and `dailyModelsMap` keyed by turn-level model
- [x] [REQ-306] Session count (`sessions`) per model: each model used ≥1 turn in a session gets +1 session count; total summary sessions stays consistent

### D. Tests
- [x] [REQ-307] Suite 4: transcript with 2+ settings-changes → each turn's `modelName` matches expected model at that point
- [x] [REQ-308] Suite 15: payload with multi-model session → `models[]` and `dailyModels` show both models as independent entries
- [x] [REQ-309] All 126+ tests pass (0 failures)