# Architect Task Report — agy-tokens v3.4 (Turn-Level Model Attribution)

## Task Summary

Produce a complete architecture plan for agy-tokens v3.4 that replaces session-level model attribution with **turn-level model attribution**: the parser tracks `currentActiveModel` across `<USER_SETTINGS_CHANGE>` blocks inside one transcript, stamps every turn with `turn.modelName`, costs each turn with its own model's pricing, and the dashboard payload aggregates `modelsMap` / `dailyModelsMap` keyed by turn-level model. Client JS requires **zero changes** (it already keys off the model-name string). Baseline: git `8ce6618` (main), 126 tests / 18 suites PASS, payload v3.

Report Folder: `docs/260827_0004_session_turn-level-model-attribution/`

---

## [1. Technical Specification]

### 1.1 Goals & Core Constraints

| Goal | REQ | Constraint |
|---|---|---|
| Turn-level `currentActiveModel` tracking in parser | 301 | State initialized from param/`getActiveModelFromSettings()`; updated on each `<USER_SETTINGS_CHANGE>` block; settings change applies to the turn **containing** the block and all subsequent turns |
| Per-turn `modelName` + per-turn pricing | 302 | `turn.modelName = currentActiveModel` at push time; `turnCostUsd = calculateCostUsd(..., currentActiveModel)` inside the loop (replaces the current pre-pass fixed-model call) |
| Backward-compat session identity | 303 | `session.modelName` = LAST active model (unchanged semantics); NEW `session.models: string[]` = unique models used, in first-appearance order |
| Cache invalidation | 304 | `CACHE_SCHEMA_VERSION` 3 → 4; old cache auto-discarded by existing version check; no migration code |
| Turn-level aggregation in payload | 305 | `buildDashboardPayload` keys `modelsMap` / `dailyModelsMap` by `turn.modelName` with fallback chain `turn.modelName → session.modelName → opts.modelName → 'unknown'` |
| Session-count semantics | 306 | Each model used ≥1 turn in a session gets `+1 sessions`; `payload.cacheStats.totalSessions` and `summaries.*.totalSessions` stay session-based (unchanged) |
| Test coverage | 307–309 | Suite 4 multi-settings-change fixture; Suite 15 multi-model payload fixture; all 126+ tests green |
| Hard constraints | — | Zero new npm deps; Node ≥16; `DASHBOARD_PAYLOAD_VERSION` **stays 3** (schema unchanged — see AD-1); atomic cache writes preserved |

### 1.2 FE↔BE Data-Flow Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│ transcript.jsonl                                                           │
│   turn 0: USER_INPUT "<USER_SETTINGS_CHANGE> … to Gemini 3.7 Flash (High)" │
│   turn 1: MODEL  (response)                                                │
│   turn 2: USER_INPUT "<USER_SETTINGS_CHANGE> … to Claude Opus 4.6 (Think…" │
│   turn 3: MODEL  (response)                                                │
└────────────────────────────────────────────────────────────────────────────┘
                │ streaming parse (single pass)
                ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ src/log-parser.js — parseTranscriptFile()                                  │
│   let currentActiveModel = modelName(param) || getActiveModelFromSettings()│
│   loop per record:                                                         │
│     if USER_INPUT && content.includes('<USER_SETTINGS_CHANGE>')            │
│        → SETTINGS_CHANGE_RE → currentActiveModel = overrideCandidate       │
│     turnCostUsd = calculateCostUsd(in, cached, out, currentActiveModel)    │
│     turns.push({ …, modelName: currentActiveModel, costUsd: turnCostUsd }) │
│   post-loop:                                                               │
│     session.modelName = LAST currentActiveModel  (backward compat)         │
│     session.models    = unique(models in turn order)                       │
│     session.costUsd   = Σ turn.costUsd  (turn-accurate total)              │
│     session.cacheSavingsUsd = Σ per-turn cache savings                     │
└────────────────────────────────────────────────────────────────────────────┘
                │ sessions[] with turn.modelName + session.models
                ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ src/cache-manager.js                                                       │
│   CACHE_SCHEMA_VERSION 3 → 4 → loadCache() rejects old → re-parse once    │
└────────────────────────────────────────────────────────────────────────────┘
                │
                ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ src/html-report.js — buildDashboardPayload()                               │
│   for session:                                                             │
│     seenInSession = new Set()                                              │
│     for turn of session.turns:                                             │
│       m = turn.modelName || session.modelName || opts.modelName || 'unk…'  │
│       modelRow = modelsMap.get-or-create(m)                                │
│       modelRow.{input,cached,output,turns} += turn.*                       │
│       modelRow.costUsd += turn.costUsd (fallback: recompute w/ m)          │
│       if !seenInSession.has(m): modelRow.sessions++; seenInSession.add(m)  │
│       dailyModelsMap[date][m] same keying; dailyModelSessions[date][m]     │
│         .add(sessionId) (already Set-based — semantics unchanged)          │
│   summaries (today/7d/30d) UNCHANGED — still summarizeTurns(turns, opts)   │
└────────────────────────────────────────────────────────────────────────────┘
                │ models[] / dailyModels keyed by turn-level model string
                ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ payload (version STAYS 3)                                                  │
│   models[]: one row per model actually used (turn granularity)             │
│   dailyModels[date]: per-date per-model rows (turn granularity)            │
└────────────────────────────────────────────────────────────────────────────┘
                │ window.__AGY_DASH__ / SSE
                ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ Client JS (inline dashboard) — NO CHANGES                                  │
│   initFilters / renderSvg / renderTable all key off model-name string      │
│   → turn-level distinction is AUTOMATIC (same mechanism as v3.3 effort)    │
└────────────────────────────────────────────────────────────────────────────┘
```

**Critical architectural insight (verified)**: every downstream surface (`models[]`, `dailyModels`, filter checkboxes, chart segments, table sub-rows) keys off the model-name **string** — exactly the same mechanism that made v3.3 effort distinction work with zero client changes ([`html-report.js:165-191`](src/html-report.js:165)). Turn-level attribution therefore requires changes at exactly **two data-producing points** (parser + payload builder) and **one constant** (cache version). No client-JS, i18n, config, or CLI changes.

### 1.3 Type Definitions

```text
// Turn (CHANGED — one new field)
{
  stepIndex: number,
  source: string,
  type: string,
  toolName: string,
  inputTokens: number,
  cachedTokens: number,
  outputTokens: number,
  totalTokens: number,
  costUsd: number,          // NOW computed with currentActiveModel at push time
  createdAt: string,
  preview: string,
  modelName: string         // NEW — currentActiveModel at the moment of this turn
}

// ParsedSession (CHANGED — one new field; modelName semantics preserved)
{
  sessionId: string,
  title: string,
  workspace: string,
  startTime: string,
  endTime: string,
  turnCount: number,
  inputTokens/cachedTokens/outputTokens/totalTokens: number,
  costUsd: number,          // NOW = Σ turn.costUsd (turn-accurate)
  cacheSavingsUsd: number,  // NOW = Σ per-turn cache savings (turn-accurate)
  cacheHitRate: number,
  modelName: string,        // PRESERVED — LAST active model (backward compat)
  models: string[],         // NEW — unique models used, first-appearance order
  turns: Turn[]
}

// ModelRow / DailyModelRow (UNCHANGED schema — keying source changes)
{ model, displayName, totalTokens, inputTokens, cachedTokens, outputTokens,
  cacheHitRate, costUsd, cacheSavingsUsd, sessions, turns }
```

---

## [2. Architecture Decisions]

### 2.1 AD-1: `DASHBOARD_PAYLOAD_VERSION` stays 3 (do NOT bump)

The payload schema — field names and types of `models[]`, `dailyModels`, `summaries`, `daily`, `cacheStats` — is **identical** before and after. Only the *keying source* of the model string changes (session-level → turn-level), producing possibly *more rows* but never differently-shaped rows. Precedent: v3.3 effort distinction shipped under payload v3 for the same reason ([v3.3 architect report AD-1](docs/260827_0003_session_dashboard-v33-effort-estimates/220520_architect-report.md)).

- [`DASHBOARD_PAYLOAD_VERSION`](src/html-report.js:40) remains `3`.
- [`isFreshPayload()`](src/html-report.js) (`p.version >= 3 && p.dailyModels`) stays valid; suite 15 assertions `payload.version === 3` ([`test/run-tests.js:1522,1809`](test/run-tests.js:1522)) remain green.
- [`dashboard-link.js`](src/dashboard-link.js:158) `payloadVersion: 3` record untouched; no stale-server respawn triggered.

**Risk avoided**: bumping to 4 would invalidate every open dashboard tab and require synchronized edits to `isFreshPayload`, `dashboard-server.json` records, and multiple suite-15/17 assertions — pure churn with zero functional gain.

### 2.2 AD-2: `currentActiveModel` state machine in `parseTranscriptFile` (REQ-301, REQ-302)

**Decision**: introduce a single mutable local `currentActiveModel` in [`parseTranscriptFile()`](src/log-parser.js:113), initialized from the existing `model` variable (`modelName(param) || getActiveModelFromSettings()`, [`log-parser.js:114`](src/log-parser.js:114)). The existing `SETTINGS_CHANGE_MARKER` pre-filter + `SETTINGS_CHANGE_RE` extraction block ([`log-parser.js:173-184`](src/log-parser.js:173)) changes its assignment target from `sessionModelOverride` to `currentActiveModel`. The turn push ([`log-parser.js:240-252`](src/log-parser.js:240)) gains `modelName: currentActiveModel`.

```text
BEFORE (v3.3):
  let sessionModelOverride = null;              // LAST-match-wins, post-loop
  …on settings block: sessionModelOverride = candidate
  turnCostUsd = calculateCostUsd(..., model);   // fixed pre-pass model
  turns.push({ …, costUsd: turnCostUsd });      // no modelName on turn
  finalModel = sessionModelOverride || model;   // session-level only

AFTER (v3.4):
  let currentActiveModel = model;               // param || settings
  const modelsUsed = [];                        // first-appearance order
  …on settings block: currentActiveModel = candidate   // effective immediately
  turnCostUsd = calculateCostUsd(..., currentActiveModel);
  if (!modelsUsed.includes(currentActiveModel)) modelsUsed.push(currentActiveModel);
  turns.push({ …, costUsd: turnCostUsd, modelName: currentActiveModel });
  finalModel = currentActiveModel;              // LAST active = backward compat
  models = modelsUsed;
```

**Boundary rule — settings change applies to the turn containing the block**: the `<USER_SETTINGS_CHANGE>` block arrives inside a `USER_INPUT` record. Since the block is processed *before* the turn is pushed, the turn carrying the settings change is already stamped with the NEW model. Rationale: in the Antigravity transcript format, the settings-change user message is itself handled by the newly selected model (the change takes effect for that request). This matches the REQ-307 expectation "each turn's `modelName` matches expected model **at that point**".

**`sessionModelOverride` variable is retired** — its only consumer was the post-loop `finalModel` computation, now replaced by `currentActiveModel` directly. This removes the v3.3 split-brain (pre-pass model for turns vs post-pass model for session).

### 2.3 AD-3: Turn-accurate session totals (REQ-302)

**Decision**: session aggregates become sums of turn-level figures instead of single post-loop calls with the final model.

```text
BEFORE: costUsd         = calculateCostUsd(sessionTotals…, finalModel)
        cacheSavingsUsd = calculateCacheSavingsUsd(sessionCachedTokens, finalModel)

AFTER:  costUsd         = Σ turn.costUsd                        (accumulate in loop)
        cacheSavingsUsd = Σ calculateCacheSavingsUsd(turn.cachedTokens, turn.modelName)
```

Implementation detail: accumulate `sessionCostUsd += turnCostUsd` and `sessionCacheSavingsUsd += calculateCacheSavingsUsd(turnCachedTokens, currentActiveModel)` inside the loop, right where `sessionInputTokens += turnInputTokens` already happens ([`log-parser.js:236-238`](src/log-parser.js:236)). Post-loop, use the accumulated values directly.

**Single-model equivalence**: when a session never changes model, `Σ calculateCostUsd(per-turn…, m)` ≈ `calculateCostUsd(session totals…, m)` — both are linear in token counts, so the result is identical up to floating-point summation order (differences < 1e-12, invisible after `round6`). **Existing suite-4 assertions (`parsed.costUsd > 0`, token totals) remain green** because single-model fixtures produce the same numbers.

**Why not keep the post-loop call**: a post-loop call can only price with ONE model; with mid-session switches that under-charges the cheaper model's turns. Summing per-turn costs is the only correct option and costs nothing extra (the pricing call already happens per turn).

### 2.4 AD-4: `session.models` array construction (REQ-303)

**Decision**: maintain `const modelsUsed = []` alongside the loop; on every turn push, `if (!modelsUsed.includes(currentActiveModel)) modelsUsed.push(currentActiveModel);`. Array + `includes` (not `Set`) to guarantee **first-appearance order** and JSON-serializability without conversion. Session turn counts are small (tens to low hundreds), models per session ≤ a handful — O(turns × models) is trivially cheap.

- `session.modelName = currentActiveModel` post-loop (LAST active model — identical value to v3.3's `finalModel`).
- `session.models = modelsUsed` — for a never-changed session this is `[modelName]`; for a switched session e.g. `['Gemini 3.7 Flash (High)', 'Claude Opus 4.6 (Thinking)']`.

### 2.5 AD-5: Cache invalidation via `CACHE_SCHEMA_VERSION` 3 → 4 (REQ-304)

[`loadCache()`](src/cache-manager.js:21) rejects any cache whose `version !== CACHE_SCHEMA_VERSION` ([`cache-manager.js:33`](src/cache-manager.js:33)) and returns a fresh empty root. Bumping the constant ([`cache-manager.js:14`](src/cache-manager.js:14)) from `3` to `4`:

- Old caches (schema ≤3, turns without `modelName`) are discarded on next load → every session re-parses **exactly once** → turn-level `modelName` and `session.models` picked up → new cache written with `version: 4`.
- Existing proven mechanism; no migration logic, no new code paths.
- Suite 5 references `cacheManager.CACHE_SCHEMA_VERSION` **symbolically** ([`test/run-tests.js:502,508`](test/run-tests.js:502)) → no test breakage.
- Update the comment above the constant to document the v4 rationale (turn-level attribution).

**Cost**: one full re-parse of all transcripts on first run after upgrade (identical trade-off accepted in v3.3 AD-4).

**Why a bump is mandatory even though the payload builder has fallbacks**: without it, cached schema-3 sessions would silently render under session-level attribution indefinitely (until each transcript's mtime changes), making the fix appear to "not work" for old sessions — the exact bug class v3.3's bump prevented.

### 2.6 AD-6: Turn-level aggregation in `buildDashboardPayload` (REQ-305, REQ-306)

**Decision**: restructure the per-session loop in [`buildDashboardPayload()`](src/html-report.js:134-208) so that the model key is resolved **per turn**:

```text
for (const session of list) {
  if (!session || !Array.isArray(session.turns)) continue;
  const sessionFallbackModel = session.modelName || modelName || 'unknown';
  const modelsSeenInSession = new Set();

  for (const turn of session.turns) {
    const turnModel = turn.modelName || sessionFallbackModel;   // REQ-305 chain
    const modelRow = getOrCreateModelRow(modelsMap, turnModel);
    if (!modelsSeenInSession.has(turnModel)) {                  // REQ-306
      modelRow.sessions += 1;
      modelsSeenInSession.add(turnModel);
    }
    modelRow.turns += 1;
    modelRow.inputTokens  += turn.inputTokens  || 0;
    modelRow.cachedTokens += turn.cachedTokens || 0;
    modelRow.outputTokens += turn.outputTokens || 0;
    // Cost: prefer the parser's turn-accurate figure; recompute only when absent
    modelRow.costUsd += (typeof turn.costUsd === 'number')
      ? turn.costUsd
      : calculateCostUsd(turn.inputTokens||0, turn.cachedTokens||0, turn.outputTokens||0, turnModel);
    modelRow.cacheSavingsUsd += calculateCacheSavingsUsd(turn.cachedTokens || 0, turnModel);

    // daily bucketing — same key (turnModel), inside the existing date-keyed branch
    … dailyModelsMap.get(key)[turnModel] accumulate (existing pattern) …
    … dailyModelSessions.get(key)[turnModel].add(sessionId)     (already Set-based) …
  }
}
```

Key points:

1. **Fallback chain** (REQ-305): `turn.modelName → session.modelName → opts.modelName → 'unknown'`. The middle two preserve today's behavior for fixtures/sessions that predate turn stamping (old cache entries are impossible post-bump, but hand-built test fixtures and defensive robustness still need it).
2. **Session-count semantics** (REQ-306): `modelRow.sessions` counts *distinct sessions in which this model had ≥1 turn* — enforced by `modelsSeenInSession`. A session using two models contributes +1 to each model's `sessions`. `payload.cacheStats.totalSessions` ([`html-report.js:297`](src/html-report.js:297)) and `summaries.*.totalSessions` (Set-based, [`html-report.js:252,269`](src/html-report.js:252)) remain **session-identity counts — untouched and consistent**.
3. **Cost source**: prefer `turn.costUsd` (turn-accurate, already priced with the right model by the parser). Recompute-from-tokens fallback only for fixtures lacking `costUsd`. This removes the current session-level `calculateCostUsd(session totals, sessionModel)` call ([`html-report.js:201-206`](src/html-report.js:201)) which would mis-price mixed-model sessions.
4. **`dailyModelSessions` unchanged**: it is already a per-date per-model `Set` of sessionIds ([`html-report.js:186-192`](src/html-report.js:186)) — keying it by `turnModel` instead of `sessionModel` is the only change; `.size` finalization ([`html-report.js:235`](src/html-report.js:235)) is untouched.
5. **`daily[]` / `summaries` untouched**: `summarizeTurns(turns, modelName)` ([`aggregator.js:59`](src/aggregator.js:59)) buckets turns by date regardless of model and prices with the *global* model — that is existing behavior for the summary cards (documented v3.3 scope, estimate-only). Per REQ scope, only `modelsMap`/`dailyModelsMap` change granularity.

**Existing-suite compatibility**: the suite-15 effort-variant fixture ([`test/run-tests.js:1985-2010`](test/run-tests.js:1985)) provides sessions with `modelName` + turns **without** `turn.modelName` → fallback chain resolves to `session.modelName` → identical rows as today → the test stays green. The single-session fixtures ([`test/run-tests.js:1363,1462`](test/run-tests.js:1363)) likewise resolve through the fallback unchanged.

### 2.7 AD-7: Design options considered (mandatory 3)

| | A (Standard/Right Way) — CHOSEN | B (Practical/Pragmatic) | C (Staging/Incremental) |
|---|---|---|---|
| Parser | `currentActiveModel` state machine; per-turn `modelName` + per-turn pricing; session totals = Σ turns | Stamp turns but keep session totals from post-loop single call | Keep session-level parsing; infer turn models in payload builder by re-scanning turn previews |
| Aggregation | Per-turn keying with fallback chain; cost from `turn.costUsd` | Per-turn keying but recompute all costs from tokens in builder | Two-pass: group turns by contiguous model runs |
| Cache | Schema bump 3→4 (auto re-parse) | Schema bump 3→4 | No bump; tolerate stale session-level rows until mtime changes |
| Effort | Medium (3 files + tests) | Low-Medium | Low |
| Risk | Low (reuses v3.3-proven regex/bump mechanisms) | Medium (turn rows sum ≠ session row cost; rounding drift) | High (stale cache silently shows old attribution; preview re-scan is brittle) |
| Outcome | Complete: turn-accurate tokens AND cost everywhere | Partial: tokens right, session cost slightly off vs Σ models | Temporary: works only for newly parsed sessions |

Chosen: **Option A** — technically correct at both layers, addresses the root cause (cost must follow the model that generated the tokens), matches the "boil the ocean" preference, and reuses every mechanism v3.3 already proved (settings regex, schema bump, string-keyed downstream surfaces).

---

## [3. Implementation Plan]

Constraint compliance: 2–3 sequential batches, ≤2 disjoint files each, never the same file twice in one batch. Order chosen so every batch is independently revertible and the suite stays green after each batch.

### Batch 1 — Parser + cache (2 items, disjoint files)

1. **[`src/log-parser.js`](src/log-parser.js)** — AD-2/AD-3/AD-4:
   - Replace `sessionModelOverride` with `currentActiveModel` (init from existing `model`).
   - Settings-change block assigns to `currentActiveModel`.
   - Per-turn `turnCostUsd = calculateCostUsd(..., currentActiveModel)`; add `modelName: currentActiveModel` to the pushed turn object.
   - Accumulate `sessionCostUsd` / `sessionCacheSavingsUsd` in-loop; post-loop `costUsd`/`cacheSavingsUsd` use accumulators.
   - Build `modelsUsed` (ordered unique); return `modelName: currentActiveModel` (last active) and `models: modelsUsed`.
   - Update the function JSDoc (`@returns` description) and the AD-2 comment block to describe turn-level semantics.
2. **[`src/cache-manager.js`](src/cache-manager.js)** — AD-5: `CACHE_SCHEMA_VERSION` 3 → 4 with updated rationale comment.

Prerequisites: none. Verification: `node test/run-tests.js` — suite 4 (single-model fixtures → identical numbers), suite 5 (symbolic version constant), all 126 tests green. New behavior not yet consumed downstream, so no visible change.

### Batch 2 — Payload aggregation (1 item)

1. **[`src/html-report.js`](src/html-report.js)** — AD-6: restructure the per-session loop in `buildDashboardPayload` to per-turn model keying with the REQ-305 fallback chain, `modelsSeenInSession` session counting (REQ-306), `turn.costUsd`-first cost accumulation, and `dailyModelsMap`/`dailyModelSessions` keyed by turn model. `DASHBOARD_PAYLOAD_VERSION` stays 3 (AD-1). No client-JS/HTML/CSS/i18n changes.

Prerequisites: Batch 1 (turn.modelName producers). Verification: `node test/run-tests.js` — suite 15 fixtures (no `turn.modelName`) exercise the fallback chain and must produce byte-identical rows (effort-variant cost assertions at [`test/run-tests.js:2013-2045`](test/run-tests.js:2013) are the canary). All tests still green.

### Batch 3 — Tests (1 item)

1. **[`test/run-tests.js`](test/run-tests.js)** — new tests:
   - **Suite 4 (REQ-307)**: synthetic transcript with TWO `<USER_SETTINGS_CHANGE>` blocks (e.g. start `Gemini 3.7 Flash (High)` → turn 2 switches to `Claude Opus 4.6 (Thinking)`), interleaved MODEL turns. Assert: turns before switch carry model A, the switch-carrying turn and all after carry model B; `session.modelName` = model B (last); `session.models` deep-equals `[A, B]` in order; per-turn `costUsd` > 0 and session `costUsd` ≈ Σ turn costs within 1e-9.
   - **Suite 4 (companion)**: single-settings transcript asserts `session.models` length 1 and turn-level `modelName` uniformity.
   - **Suite 15 (REQ-308)**: one session fixture whose turns carry two distinct `turn.modelName` values across two days; assert `payload.models` has both models as independent rows, each with `sessions === 1` (REQ-306); `payload.dailyModels[date]` shows the correct model per date; Σ of model-row costs ≈ session cost; existing fallback fixtures still pass.
   - Run full suite → all green (projected 126 → ~131 tests).

Prerequisites: Batches 1 + 2. Verification protocol: `node test/run-tests.js` (full run — single-command gate; this project has one aggregate test entry point). No new test files needed — the existing suite structure covers parser (4), cache (5), payload (15).

**Manual verification gate (post-Batch 3, optional VP gate)**: `node bin/agy-tokens.js --hook --raw --write-dashboard` on a real brain dir containing a mid-session-switched transcript → dashboard shows two model rows with correct split.

---

## [4. Risk Analysis]

| Risk | Severity | Mitigation |
|---|---|---|
| **R1: Pricing correctness per turn** — mid-session switch Flash→Opus must price each segment at its own rate | 🟠 High | AD-2 costs inside the loop with `currentActiveModel`; AD-3 makes session totals the Σ of turn costs. REQ-307 test asserts Σ(turn costs) ≈ session cost and both segments priced |
| **R2: Stale cache without turn.modelName** | 🟠 High | AD-5 bump 3→4 forces one-time full re-parse via existing version gate; suite 5 uses symbolic constant → green. Fallback chain in AD-6 additionally protects hand-built fixtures |
| **R3: Backward compat of `session.modelName` consumers** — header label, `displayName`, filters | 🟡 Med | Semantics preserved (LAST active model, identical to v3.3 `finalModel`). All consumers key off the string value, not its provenance. Suite-15 effort fixture (no turn.modelName) exercises fallback → identical rows |
| **R4: Session-count inflation** — one mixed-model session counted under 2 models could confuse totals | 🟡 Med | REQ-306 semantics explicitly per-model; `cacheStats.totalSessions` and `summaries.*.totalSessions` remain session-identity counts (Set-based, untouched). REQ-308 test asserts per-model `sessions === 1` for a 2-model single session |
| **R5: Settings-change regex false positive** — user pastes the literal text into a prompt | 🟡 Med | Inherited v3.3 mitigations unchanged: `<USER_SETTINGS_CHANGE>` substring pre-filter + anchored regex + trailing-punctuation sanitizer ([`log-parser.js:37,173-184`](src/log-parser.js:173)). Blast radius now per-turn instead of session-wide — strictly smaller |
| **R6: Floating-point drift** — Σ per-turn costs vs single aggregate call | 🟢 Low | Linear pricing ⇒ identical up to summation order; `round6` at row finalization ([`html-report.js:217,236`](src/html-report.js:217)) absorbs <1e-12 deltas. Existing assertions use `> 0` or `< 5e-7` tolerances — unaffected |
| **R7: `session.models` array ordering assumptions** | 🟢 Low | First-appearance order guaranteed by array+`includes` (AD-4); test asserts deep-equal order |
| **R8: Fixture design gaps** — old fixtures lack `turn.modelName`, silently testing only the fallback | 🟡 Med | REQ-308 fixture explicitly stamps turn-level models; existing effort fixture intentionally retained as the fallback-path regression guard |
| **R9: `summaries`/`daily` cards price with global model while `models[]` is turn-accurate — apparent inconsistency** | 🟢 Low | Pre-existing v3.3 documented scope (estimate-only cards). Not in REQ-301..309 scope. If later desired, `summarizeTurns` could accept per-turn pricing — flag as future work, do NOT scope-creep into v3.4 |

**Test-suite additions summary**: Suite 4 +2 (multi-switch attribution + single-model `models[]` shape), Suite 15 +1 (multi-model payload, REQ-308). Suites 2/3/5/17/18 unaffected. Projected total: 126 → ~129–131 tests, 0 failures (REQ-309).

---

## [5. Cross-Domain Mapping — Every File/Function Touched]

| # | File | Function/Location | Change | REQ |
|---|---|---|---|---|
| 1 | [`src/log-parser.js`](src/log-parser.js:113) | `parseTranscriptFile()` — state decl | Replace `sessionModelOverride` with `currentActiveModel` + `modelsUsed[]`; accumulate session cost/savings in-loop | 301, 302, 303 |
| 2 | [`src/log-parser.js`](src/log-parser.js:173) | settings-change block | Assign override to `currentActiveModel` (effective immediately) | 301 |
| 3 | [`src/log-parser.js`](src/log-parser.js:234) | turn cost + push | `calculateCostUsd(..., currentActiveModel)`; push `modelName`; accumulate session totals; track `modelsUsed` | 302, 303 |
| 4 | [`src/log-parser.js`](src/log-parser.js:261) | post-loop return | `costUsd`/`cacheSavingsUsd` from accumulators; `modelName: currentActiveModel`; new `models` field | 302, 303 |
| 5 | [`src/cache-manager.js`](src/cache-manager.js:14) | `CACHE_SCHEMA_VERSION` | 3 → 4 + comment | 304 |
| 6 | [`src/html-report.js`](src/html-report.js:134) | `buildDashboardPayload()` session loop | Per-turn model keying w/ fallback chain; `modelsSeenInSession` counting; `turn.costUsd`-first accumulation; daily maps keyed by turn model | 305, 306 |
| 7 | [`test/run-tests.js`](test/run-tests.js:452) | Suite 4 | +2 tests: multi-switch turn attribution (REQ-307); single-model `models[]` shape | 307 |
| 8 | [`test/run-tests.js`](test/run-tests.js:1341) | Suite 15 | +1 test: multi-model session payload (REQ-308) | 308 |

**Untouched (verified no change needed)**: [`src/config.js`](src/config.js) (`getModelPricing`/`getBaseModelName` already handle effort-suffixed strings — reused as-is), [`src/aggregator.js`](src/aggregator.js) (summaries stay global-model per scope), [`src/i18n.js`](src/i18n.js) (no new user-facing strings), [`src/dashboard-link.js`](src/dashboard-link.js) (payload v3 unchanged), [`src/serve.js`](src/serve.js), [`src/hook-handler.js`](src/hook-handler.js), [`src/formatter.js`](src/formatter.js), [`src/index.js`](src/index.js) (no CLI changes), `bin/*`, `data/pricing.json`, client JS (string-keyed — automatic).

---

## Issues Discovered

1. **Resolved by this design**: v3.3 report §"Issues Discovered" #1 flagged that per-turn costs used the pre-pass model while session totals used the final model (split-brain). v3.4 AD-2/AD-3 eliminates this entirely — turns and session totals now share one per-turn pricing path.
2. **Pre-existing, out of scope (report-only)**: `summarizeTurns` in [`aggregator.js:75-81`](src/aggregator.js:75) prices summary cards with the global active model, not per-turn models. After v3.4, `models[]` is turn-accurate while summary cards remain global-estimates — consistent with v3.3's documented estimate-only scope. Recommend a future REQ if per-turn summary pricing is desired.

## Next Step Recommendations

- VP: proceed with Batch 1 → 2 → 3 as specified; each batch is one `code` delegation (≤2 disjoint files).
- After Batch 3: run the full `node test/run-tests.js` gate plus the optional manual dashboard verification, then P6 Final Ask Audit.

## Affected File List

- `src/log-parser.js` (modify — turn-level state machine, per-turn pricing, `models` array)
- `src/cache-manager.js` (modify — 1 constant + comment)
- `src/html-report.js` (modify — `buildDashboardPayload` loop restructure only)
- `test/run-tests.js` (modify — suite 4 +2, suite 15 +1)
- `docs/260827_0004_session_turn-level-model-attribution/140100_architect-report.md` (this report)
