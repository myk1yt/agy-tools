# Architecture Document: Master Hotfix & Refactor

**Session**: `260828_0001_session_master-hotfix-refactor`
**Date**: 2026-08-28
**Author**: Architect Mode
**Status**: Design Complete, Ready for VP Subdivision

---

## Overview

Four-part hotfix and refactor for `agy-tools` (Antigravity CLI monitoring/dashboard tool). Each part targets a distinct failure domain. Parts 1 and 3 are independent and can execute in parallel. Part 2 has internal dependency ordering. Part 4 is client-side only and independent.

| Part | Domain | Files Touched | Complexity | Parallel-Safe |
|------|--------|---------------|------------|---------------|
| 1 | Statusline Fail-Safe | hook-handler.js, dashboard-link.js, html-report.js, index.js, agy-tokens.js | Medium | Yes (with Part 3) |
| 2 | Turn-Level Model Attribution | log-parser.js, aggregator.js, html-report.js | High | Partial (after Part 1 html-report) |
| 3 | Model Alias Priority | config.js | Low | Yes (with Part 1) |
| 4 | Dynamic Y-Axis Chart | html-report.js | Low | Yes (after Part 2 html-report) |

**Recommended execution order**: Part 3 + Part 1 (parallel) -> Part 2 -> Part 4

---

## [1. Technical Specification]

### Goals

1. **P1**: Eliminate all `exit status 1` crashes from the statusline hook path. The hook must always exit(0), even on broken pipes, file locks, or uncaught exceptions.
2. **P2**: Preserve per-turn model attribution through the entire pipeline: transcript parsing, cost calculation, period aggregation, and dashboard display.
3. **P3**: Fix substring matching in `getModelPricing` so `gpt-4o-mini` matches its own alias, not `gpt-4o`.
4. **P4**: Add dynamic Y-axis scaling to the 30-day token trend chart with nice-number labels and horizontal guidelines.

### Core Constraints

- Zero external dependencies (Node core only). No new packages.
- All changes backward-compatible with existing data formats (transcript.jsonl, dashboard-data.json, cache files).
- Statusline hook path must stay under 20ms steady-state.
- Dashboard HTML is a single self-contained file with inline JS. All client-side code lives in string templates inside `html-report.js`.

### FE/BE Data Flow (Dashboard Pipeline)

```
Transcript JSONL files
  |
  v
log-parser.js (parseTranscriptFile) --> sessions[{turns:[{modelName, costUsd, ...}]}]
  |
  v
cache-manager.js (syncSessions) --> sessions[] (cached or fresh)
  |
  v
aggregator.js (summarizeTurns, getToday, getLastNDays) --> summaries{costUsd, ...}
  |
  v
html-report.js (buildDashboardPayload) --> payload{daily, summaries, dailyModels}
  |
  v
html-report.js (writeDashboardFiles) --> dashboard.html + dashboard-data.js + dashboard-data.json
  |
  v
Browser renders chart via inline JS renderSvg()
```

---

## [2. Architecture Decisions]

---

### PART 1: Statusline Fail-Safe (Layered Defense)

**Problem**: The `--hook` mode process exits with code 1 from three failure vectors: (a) EPIPE/ECONNRESET on stdin after the `error` listener is removed, (b) Windows EBUSY collisions on fixed `.tmp` filenames during concurrent atomic writes, (c) uncaught exceptions anywhere in the hook block with no top-level guard.

**Strategy**: Five independent defense layers, each addressing one failure vector. Each layer is a minimal, targeted change.

---

#### REQ-001a: Permanent no-op `error` listener on `process.stdin`

**File**: `src/hook-handler.js`
**Function**: [`readStdinJson(timeoutMs)`](src/hook-handler.js:18)

**Current behavior**: After `finish()` runs (timeout or end), all three listeners (`data`, `end`, `error`) are removed via `removeListener`. If the parent process writes to the pipe after this point, Node emits an unhandled `error` event on `process.stdin`, which crashes the process.

**Change**: After the existing cleanup in `finish()`, attach a permanent no-op error listener:

```js
// Inside finish(), after the three removeListener calls:
process.stdin.on('error', () => {});
```

This is safe because:
- `readStdinJson` is called exactly once per hook invocation.
- The no-op listener swallows any late EPIPE/ECONNRESET.
- No memory leak: the process exits immediately after.

**Edge cases**:
- Multiple `readStdinJson` calls (not current usage, but defensive): each adds one no-op listener. Node warns at 11+ listeners. Mitigation: use `process.stdin.listenerCount('error')` check before adding.

---

#### REQ-001b: PID in `atomicWriteJson` tmp filename

**File**: `src/dashboard-link.js`
**Function**: [`atomicWriteJson(filePath, data)`](src/dashboard-link.js:138)

**Current behavior**: `const tmp = \`${filePath}.tmp\`;` -- fixed suffix. Two concurrent hook renders (each in its own process) write to the same `.tmp` file, causing EBUSY on Windows.

**Change**:
```js
const tmp = `${filePath}.${Date.now()}.${process.pid}.tmp`;
```

**Edge cases**:
- PID reuse after process exit: harmless, `Date.now()` differentiates.
- Tmp file accumulation: `renameSync` moves the tmp file, so no orphans in the happy path. On rename failure, the existing retry logic in `atomicWriteFile` (html-report) handles cleanup. For `atomicWriteJson`, the function is called in fire-and-forget contexts where a leaked tmp file is harmless (overwritten on next write or cleaned by OS tmp reaper).

---

#### REQ-001c: PID in `atomicWriteFile` tmp filename

**File**: `src/html-report.js`
**Function**: [`atomicWriteFile(filePath, content)`](src/html-report.js:1149)

**Current behavior**: `const tmpFile = \`${filePath}.${Date.now()}.tmp\`;` -- timestamp but no PID. Two hook renders in the same millisecond collide.

**Change**: Both the initial tmp and the retry tmp:
```js
const tmpFile = `${filePath}.${Date.now()}.${process.pid}.tmp`;
// ...
const tmpFile2 = `${filePath}.${Date.now()}.${process.pid}.tmp`;
```

---

#### REQ-001d: Top-level try-catch around `--hook` block

**File**: `src/index.js`
**Scope**: Lines 357-441 (the `if (options.hook)` block)

**Current behavior**: Any exception (from `syncSessions`, `handlePostInvocation`, `buildDashboardPayload`, `writeDashboardFiles`, etc.) propagates up to `runCli().catch()` in `bin/agy-tokens.js`, which calls `process.exit(1)`.

**Change**: Wrap the entire `if (options.hook)` block in try-catch:

```js
if (options.hook) {
  try {
    // ... existing hook logic unchanged ...
  } catch (_hookErr) {
    // Fail-safe: output minimal valid hook response, exit clean
    try {
      console.log(JSON.stringify({ injectSteps: [{ ephemeralMessage: '' }] }));
    } catch (_e) { /* last resort: silent exit */ }
    process.exit(0);
  }
  return;
}
```

**Design rationale**: The Antigravity hook runner interprets exit(1) as a hook failure and shows an error to the user. The hook's purpose is informational (badge display). A silent empty response is always preferable to a crash.

---

#### REQ-001e: `bin/agy-tokens.js` fail-safe

**File**: `bin/agy-tokens.js`

**Current behavior**: `.catch()` logs the error and calls `process.exit(1)`.

**Change**: Detect hook mode and exit(0) instead:

```js
const isHookMode = process.argv.includes('--hook') || process.argv.includes('--badge');

runCli().catch(err => {
  if (isHookMode) {
    try {
      console.log(JSON.stringify({ injectSteps: [{ ephemeralMessage: '' }] }));
    } catch (_e) { /* silent */ }
    process.exit(0);
  }
  console.error('\x1b[31m[Antigravity Token Tracker Error]\x1b[0m', err.message || err);
  process.exit(1);
});
```

This is the outermost safety net. REQ-001d catches errors inside the hook block; REQ-001e catches errors before the hook block executes (e.g., in `parseArgs`, `loadUserConfig`, or module initialization).

---

### PART 2: Turn-Level Model Attribution Preservation

**Problem**: Three sub-problems:
1. The `SETTINGS_CHANGE_RE` regex only captures the `to` model, not the `from` model. When a session starts with a different model than the current `settings.json` value, all turns before the first settings-change get the wrong model.
2. `summarizeTurns(turns, modelName)` recalculates cost using a single model for all turns, ignoring per-turn `turn.costUsd` and `turn.modelName` that were correctly computed during parsing.
3. Period summaries in `html-report.js` pass a single `modelName` to `summarizeTurns`, propagating the same bug to today/yesterday/7d/30d cards.

---

#### REQ-002a: Capture both `from` and `to` in `SETTINGS_CHANGE_RE`

**File**: `src/log-parser.js`
**Constant**: [`SETTINGS_CHANGE_RE`](src/log-parser.js:37)

**Current regex**:
```
/changed setting `Model Selection` from .+? to ([^\n]+?)(?:[.!?;:,。！？；：](?:\s|$)|\n|[`—–<]|$)/
```

This captures group 1 = the `to` model. The `from` portion is consumed by `.+?` but not captured.

**New regex**:
```
/changed setting `Model Selection` from (.+?) to ([^\n]+?)(?:[.!?;:,。！？；：](?:\s|$)|\n|[`—–<]|$)/
```

- Group 1: `from` model (the previous model)
- Group 2: `to` model (the new model)

**Usage change** in `parseTranscriptFile`:
```js
if (settingsMatch && settingsMatch[2]) {
  const overrideCandidate = settingsMatch[2].replace(/[.!?;:,。！？；：]+$/, '').trim();
  if (overrideCandidate) {
    currentActiveModel = overrideCandidate;
  }
}
```

**Edge cases**:
- `from None to <model>`: The `from` group captures "None". This is valid; the backtracking logic (REQ-002b) should skip "None" as a model name.
- Model names containing " to ": Not possible in practice (model display names use spaces, hyphens, dots, parentheses). The regex is anchored on the literal ` from ` and ` to ` with backtick-wrapped "Model Selection", so ambiguity is negligible.
- Backward compatibility: The regex change is internal. The transcript format is read-only.

---

#### REQ-002b: Backtrack initial model from first `from <model>`

**File**: `src/log-parser.js`
**Function**: [`parseTranscriptFile(transcriptPath, sessionId, metadata, modelName)`](src/log-parser.js:113)

**Problem**: `currentActiveModel` is initialized from `modelName` param or `getActiveModelFromSettings()`. If the session started with Model A (different from current settings) and later switched to Model B, all turns before the switch incorrectly get attributed to the current settings model.

**Strategy**: Two-pass approach within the existing single-pass stream.

**Pass 1 (inline)**: During the existing `for await` loop, collect all `SETTINGS_CHANGE` events with their `from` and `to` values and the line index where they occur. Also track the `turns` array as before.

**Post-processing (after loop)**: If the first settings-change event has a `from` model that is not "None", backfill all turns before that event's line index with the `from` model.

**Implementation**:

Add a tracking array:
```js
const settingsChanges = []; // { lineIndex, fromModel, toModel }
let lineIndex = 0;
```

Inside the settings-change detection block:
```js
if (settingsMatch && settingsMatch[2]) {
  const fromCandidate = settingsMatch[1].replace(/[.!?;:,。！？；：]+$/, '').trim();
  const toCandidate = settingsMatch[2].replace(/[.!?;:,。！？；：]+$/, '').trim();
  settingsChanges.push({ lineIndex, fromModel: fromCandidate, toModel: toCandidate });
  if (toCandidate) {
    currentActiveModel = toCandidate;
  }
}
```

After the `for await` loop, before the return statement:
```js
// Backtrack: if the first settings change has a meaningful `from` model,
// all turns before that change should be attributed to the `from` model.
if (settingsChanges.length > 0) {
  const first = settingsChanges[0];
  if (first.fromModel && first.fromModel !== 'None' && first.fromModel.toLowerCase() !== 'none') {
    // Find the turn index boundary: turns created before the first settings change
    // were attributed to the initial model. Recalculate their cost.
    for (let i = 0; i < turns.length; i++) {
      // Turns at lineIndex < first.lineIndex belong to the fromModel
      // We need to track which turns were created before that line.
      // Implementation: store lineIndex on each turn.
      if (turns[i]._lineIndex < first.lineIndex) {
        turns[i].modelName = first.fromModel;
        turns[i].costUsd = calculateCostUsd(
          turns[i].inputTokens, turns[i].cachedTokens, turns[i].outputTokens, first.fromModel
        );
      } else {
        break; // Turns are ordered by line index
      }
    }
  }
}
```

**Supporting change**: Store `_lineIndex` on each turn object (internal field, stripped before serialization or prefixed with underscore to signal private):
```js
turns.push({
  stepIndex,
  // ... existing fields ...
  modelName: currentActiveModel,
  _lineIndex: lineIndex
});
lineIndex++;
```

**Data flow impact**: The `_lineIndex` field is added to turn objects. It should be stripped in `buildDashboardPayload` or in the return value of `parseTranscriptFile` to avoid polluting the dashboard JSON. Alternative: use a separate parallel array `turnLineIndices[]` to avoid modifying the turn shape. **Decision**: Use a separate `turnLineIndices` array to keep the turn shape clean.

**Revised implementation**:
```js
const turnLineIndices = []; // parallel to turns[]
let lineIndex = 0;

// In the loop, after turns.push(...):
turnLineIndices.push(lineIndex);
lineIndex++;

// After the loop:
if (settingsChanges.length > 0) {
  const first = settingsChanges[0];
  if (first.fromModel && first.fromModel.toLowerCase() !== 'none') {
    for (let i = 0; i < turns.length; i++) {
      if (turnLineIndices[i] < first.lineIndex) {
        turns[i].modelName = first.fromModel;
        turns[i].costUsd = calculateCostUsd(
          turns[i].inputTokens, turns[i].cachedTokens, turns[i].outputTokens, first.fromModel
        );
      } else {
        break;
      }
    }
    // Recalculate session totals
    sessionCostUsd = turns.reduce((sum, t) => sum + t.costUsd, 0);
  }
}
```

Also update `models` array computation (already exists at line 267) -- it runs after backtracking, so it picks up the corrected model names automatically.

**Edge cases**:
- No settings changes in the entire session: `settingsChanges` is empty, no backtracking. `currentActiveModel` (from settings) is used for all turns. This is correct because there is no evidence of a different model.
- First settings change has `from None`: No backtracking. The session started fresh with the `to` model.
- Multiple settings changes: Only the first `from` matters for backtracking. Subsequent changes are already handled by the existing `currentActiveModel` update logic.
- Session starts with Model A, switches to B, then back to A: The backtracking sets initial turns to A, the first switch sets subsequent turns to B, the second switch sets later turns to A. All correct.

---

#### REQ-002c: State machine isolation (no overwrite of past turns)

This is already satisfied by the current architecture: `turns.push()` captures `modelName: currentActiveModel` at push time, and the object is never mutated afterward (except by the new backtracking logic in REQ-002b, which is intentional and bounded to turns before the first settings change).

**Verification**: No code changes needed. Add a test to confirm: parse a multi-model transcript twice, verify per-turn models are identical across parses.

---

#### REQ-002d: `summarizeTurns` uses per-turn cost sum

**File**: `src/aggregator.js`
**Function**: [`summarizeTurns(turns, modelName)`](src/aggregator.js:59)

**Current behavior**: Lines 75-81 recalculate `costUsd` from aggregate token counts using a single `modelName`. This ignores per-turn `turn.costUsd` values that were correctly computed during parsing with per-turn models.

**New behavior**: Sum `turn.costUsd` directly. Only fall back to recalculation when `turn.costUsd` is unavailable (legacy cached data).

```js
function summarizeTurns(turns, modelName = null) {
  const summary = createEmptySummary();
  summary.totalTurns = turns.length;

  let hasPerTurnCosts = true;
  for (const turn of turns) {
    summary.inputTokens += turn.inputTokens || 0;
    summary.cachedTokens += turn.cachedTokens || 0;
    summary.outputTokens += turn.outputTokens || 0;
    if (typeof turn.costUsd !== 'number') {
      hasPerTurnCosts = false;
    }
    summary.costUsd += (typeof turn.costUsd === 'number') ? turn.costUsd : 0;
  }

  summary.totalTokens = summary.inputTokens + summary.cachedTokens + summary.outputTokens;
  summary.cacheHitRate =
    summary.inputTokens + summary.cachedTokens > 0
      ? (summary.cachedTokens / (summary.inputTokens + summary.cachedTokens)) * 100
      : 0;

  if (!hasPerTurnCosts) {
    // Legacy fallback: recalculate from aggregate tokens with single model
    summary.costUsd = calculateCostUsd(
      summary.inputTokens, summary.cachedTokens, summary.outputTokens, modelName
    );
  }

  summary.cacheSavingsUsd = calculateCacheSavingsUsd(summary.cachedTokens, modelName);

  return summary;
}
```

**Backward compatibility**: The `modelName` parameter is retained in the signature. It is only used for the legacy fallback and for `cacheSavingsUsd` calculation. All existing callers continue to work.

**Edge cases**:
- Mixed turns (some with `costUsd`, some without): `hasPerTurnCosts` becomes false, falls back to single-model recalculation. This is a conservative fallback. In practice, all turns from `parseTranscriptFile` have `costUsd`.
- Empty turns array: `costUsd` is 0, no fallback triggered. Correct.
- Cached sessions from old format (before per-turn costs): Fallback recalculation kicks in. On next `--fresh` sync, turns get per-turn costs.

---

#### REQ-002e: Period summaries in html-report.js use per-turn cost

**File**: `src/html-report.js`
**Lines**: 248-281

**Current behavior**: All calls to `summarizeTurns` pass `modelName` as the second argument, triggering single-model recalculation.

**Change required**: None at the call site. Once `summarizeTurns` (REQ-002d) sums per-turn costs, the existing calls automatically produce correct results because the turns already have `costUsd`.

However, the `modelName` parameter is still passed. After REQ-002d, it is only used for legacy fallback and `cacheSavingsUsd`. The call sites can remain unchanged.

**Additional fix for `dailyModels`**: Lines 230-244 compute per-model-per-day costs using `calculateCostUsd(row.inputTokens, row.cachedTokens, row.outputTokens, model)` where `model` is the key from `dailyModelsMap`. This is already per-model and correct.

**Edge case**: If `dailyModelsMap` is missing entries for some models (e.g., from cached data), the `daily` array (line 248-253) uses `summarizeTurns` which now sums per-turn costs, so the daily totals are still correct.

---

#### REQ-002f: SSE/client filter preserves all models

**File**: `src/html-report.js` (client-side JS in string templates)

**Verification**: The `allModels` array is populated from `payload.models` (line 292 in `buildDashboardPayload`), which comes from `session.models` (line 267 in log-parser.js). After REQ-002a/b, the `models` array correctly includes all models seen in the session.

The client-side `renderSvg` function filters by `filterState.models`, which is a `Set` initialized from `allModels`. No data loss occurs as long as `payload.models` is complete.

**No code changes needed** for REQ-002f beyond what REQ-002a/b/d/e provide. The existing SSE re-parse path re-runs `buildDashboardPayload` with fresh sessions, which includes the corrected model attribution.

---

### PART 3: Model Alias Priority Fix

**File**: `src/config.js`
**Function**: [`getModelPricing(modelName)`](src/config.js:454)
**Lines**: 466-472

**Problem**: The alias search iterates `Object.keys(MODEL_PRICING)` in insertion order and checks `target.includes(alias.toLowerCase())`. Since `gpt-4o` appears before `gpt-4o-mini` in the object, the shorter alias `gpt-4o` matches the input `gpt-4o-mini` first.

**Fix**: Sort aliases by length descending before matching. The most specific (longest) alias wins.

```js
// 2. Exact or substring match against known model aliases
// Sort by alias length descending: longest match wins (prevents 'gpt-4o' from
// matching 'gpt-4o-mini' input).
const aliasEntries = [];
for (const key of Object.keys(MODEL_PRICING)) {
  if (key === 'default') continue;
  const info = MODEL_PRICING[key];
  if (!info.aliases) continue;
  for (const alias of info.aliases) {
    aliasEntries.push({ alias: alias.toLowerCase(), info });
  }
}
aliasEntries.sort((a, b) => b.alias.length - a.alias.length);

for (const { alias, info } of aliasEntries) {
  if (alias === target || target.includes(alias)) {
    return info;
  }
}
```

**Performance note**: This builds and sorts an array on every call. `getModelPricing` is called from `calculateCostUsd` (per-turn) and `calculateCacheSavingsUsd` (per-turn). For a 100-turn session, this is 200 calls. The alias array has ~50 entries. Sort cost is negligible (< 0.1ms). If profiling shows a bottleneck, a pre-computed sorted cache can be added (lazy-initialized on first call, invalidated by `mergePricingDict`).

**Optimization (recommended)**: Pre-compute the sorted alias array at module load and after each `mergePricingDict` call:

```js
let _sortedAliases = null;

function _buildSortedAliases() {
  const entries = [];
  for (const key of Object.keys(MODEL_PRICING)) {
    if (key === 'default') continue;
    const info = MODEL_PRICING[key];
    if (!info.aliases) continue;
    for (const alias of info.aliases) {
      entries.push({ alias: alias.toLowerCase(), info });
    }
  }
  entries.sort((a, b) => b.alias.length - a.alias.length);
  _sortedAliases = entries;
}

// Call _buildSortedAliases() at module init and at the end of mergePricingDict.
// In getModelPricing, use _sortedAliases directly.
```

**Edge cases**:
- Two models with identical-length aliases: Order between them is insertion order (stable sort). Deterministic.
- Empty alias array: Skipped by the `if (!info.aliases)` guard.
- Case sensitivity: Both target and alias are lowercased before comparison. No change from current behavior.

---

### PART 4: Dynamic Y-Axis Chart Scaling

**File**: `src/html-report.js`
**Function**: Client-side [`renderSvg(daily, dailyModels)`](src/html-report.js:571) (inline JS string template)

**Current behavior**: `max` is the raw maximum daily total. Bars are normalized to `max`. No Y-axis labels, no guidelines, no nice-number rounding.

---

#### REQ-004a: Nice Numbers algorithm for `y_max`

**New function** (client-side, inside the JS template):

```js
function niceMax(rawMax) {
  if (rawMax <= 0) return 1;
  var headroom = rawMax * 1.15; // 15% headroom
  var mag = Math.pow(10, Math.floor(Math.log10(headroom)));
  var norm = headroom / mag; // 1.0 - 9.99...
  var nice;
  if (norm <= 1) nice = 1;
  else if (norm <= 2) nice = 2;
  else if (norm <= 5) nice = 5;
  else nice = 10;
  return nice * mag;
}
```

This implements the 1/2/5/10 rule with 15% headroom. Examples:
- rawMax = 3,200 -> headroom = 3,680 -> mag = 1000, norm = 3.68 -> nice = 5 -> y_max = 5,000
- rawMax = 850,000 -> headroom = 977,500 -> mag = 100,000, norm = 9.775 -> nice = 10 -> y_max = 1,000,000
- rawMax = 42 -> headroom = 48.3 -> mag = 10, norm = 4.83 -> nice = 5 -> y_max = 50

**Integration**: Replace `if (max <= 0) max = 1;` with `max = niceMax(max);`

---

#### REQ-004b: Y-axis guideline lines

Add horizontal lines at 0%, 25%, 50%, 75%, 100% of `y_max`. These are SVG `<line>` elements rendered before the bars (so bars paint over them).

```js
var guides = '';
for (var gi = 0; gi <= 4; gi++) {
  var gy = H - PAD_B - Math.round((gi / 4) * innerH);
  guides += '<line x1="' + PAD_L + '" y1="' + gy + '" x2="' + (W - PAD_L) + '" y2="' + gy + '" class="guide"/>';
}
```

CSS for `.guide` class (add to the `<style>` block in the HTML template):
```css
.guide { stroke: var(--border, #30363d); stroke-width: 0.5; stroke-dasharray: 4,4; }
```

---

#### REQ-004c: Y-axis labels with smart compact formatting

```js
function fmtAxis(v) {
  if (v >= 1000000) return (v / 1000000).toFixed(v % 1000000 === 0 ? 0 : 1) + 'M';
  if (v >= 1000) return (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + 'K';
  return String(Math.round(v));
}
```

Render labels at each guideline position. Requires increasing `PAD_L` from 8 to 48 to make room for text:

```js
var W = 760, H = 200, PAD_L = 48, PAD_B = 22, PAD_T = 8;
```

Label rendering:
```js
for (var gi = 0; gi <= 4; gi++) {
  var gv = (gi / 4) * max; // max is now y_max from niceMax
  var gy = H - PAD_B - Math.round((gi / 4) * innerH);
  guides += '<text x="' + (PAD_L - 4) + '" y="' + (gy + 3) + '" class="yaxis" text-anchor="end">' + fmtAxis(gv) + '</text>';
}
```

CSS for `.yaxis`:
```css
.yaxis { fill: var(--text-secondary, #8b949e); font-size: 10px; }
```

---

#### REQ-004d: Bar heights normalized to `y_max`

No code change needed. The existing normalization `Math.round((st.total / max) * innerH)` already works correctly once `max` is set to the nice-number `y_max` instead of the raw maximum. Bars will simply not reach the top of the chart (leaving headroom), which is the desired visual effect.

---

## [3. Implementation Plan]

### Sub-Task 1: Part 3 - Model Alias Priority Fix

**Files to modify**: `src/config.js` (lines 454-476, and `mergePricingDict` end)

**Prerequisites**: None

**Changes**:
1. Add `_sortedAliases` module-level variable and `_buildSortedAliases()` function.
2. Call `_buildSortedAliases()` at module init (after `loadUserConfig()` at line 626) and at the end of `mergePricingDict`.
3. Replace the alias loop in `getModelPricing` (lines 466-472) with iteration over `_sortedAliases`.

**Test protocol**:
- Existing suite: `npm test` (runs `test/run-tests.js`)
- New tests to add in `test/run-tests.js`:
  - `getModelPricing('gpt-4o-mini')` returns the `gpt-4o-mini` entry (not `gpt-4o`).
  - `getModelPricing('gpt-4o')` returns the `gpt-4o` entry.
  - `getModelPricing('gemini-2.0-flash-lite')` returns `gemini-2.0-flash-lite` (not `gemini-2.0-flash`).
  - `getModelPricing('gemini-2.0-flash')` returns `gemini-2.0-flash`.
  - `getModelPricing('claude-3.5-haiku')` returns `claude-3.5-haiku` (not `claude-3.5-sonnet`).
  - `getModelPricing('sonnet')` still returns `claude-3.5-sonnet` (exact alias match).

**CLI**: `node test/run-tests.js`

---

### Sub-Task 2: Part 1 - Statusline Fail-Safe

**Files to modify**:
- `src/hook-handler.js` (line 33, in `finish()`)
- `src/dashboard-link.js` (line 139, `atomicWriteJson`)
- `src/html-report.js` (lines 1155, 1163, `atomicWriteFile`)
- `src/index.js` (lines 357-441, `--hook` block)
- `bin/agy-tokens.js` (lines 9-12)

**Prerequisites**: None (can run parallel with Sub-Task 1)

**Changes** (in order):
1. `hook-handler.js`: Add `process.stdin.on('error', () => {})` after listener cleanup in `finish()`.
2. `dashboard-link.js`: Change tmp filename to include `process.pid`.
3. `html-report.js`: Change both tmp filenames to include `process.pid`.
4. `index.js`: Wrap `--hook` block in try-catch with fallback JSON output + `process.exit(0)`.
5. `bin/agy-tokens.js`: Add hook-mode detection, exit(0) with fallback JSON on error.

**Test protocol**:
- Existing suite: `npm test`
- New tests to add in `test/run-tests.js`:
  - `readStdinJson` timeout path: verify no unhandled error after timeout resolves.
  - `atomicWriteJson` with concurrent calls: two calls in quick succession do not throw.
  - Hook mode with simulated exception: run `node bin/agy-tokens.js --hook` with a corrupt cache, verify exit code 0.
- Integration: `node bin/agy-tokens.js --hook --raw` executes without error and outputs a badge string.
- Integration: `echo '{}' | node bin/agy-tokens.js --hook` outputs valid JSON with `injectSteps`.

**CLI**: `node test/run-tests.js` then `node bin/agy-tokens.js --hook --raw`

---

### Sub-Task 3: Part 2 - Turn-Level Model Attribution

**Files to modify**:
- `src/log-parser.js` (lines 37, 113-287)
- `src/aggregator.js` (lines 59-84)

**Prerequisites**: Sub-Task 2 should complete first if `html-report.js` changes conflict (both touch `html-report.js`, but different sections: Part 1 touches `atomicWriteFile` at line 1149+, Part 2 touches lines 37 and 248-281 only if `summarizeTurns` import changes, which it does not). **Actual dependency**: None. Can run parallel with Sub-Task 2.

**Changes** (in order):
1. `log-parser.js`: Update `SETTINGS_CHANGE_RE` to capture `from` group.
2. `log-parser.js`: Add `settingsChanges` array and `turnLineIndices` array tracking.
3. `log-parser.js`: Update settings-change block to record both `from` and `to`.
4. `log-parser.js`: Add post-loop backtracking logic.
5. `aggregator.js`: Modify `summarizeTurns` to sum per-turn `costUsd` with legacy fallback.

**Test protocol**:
- Existing suite: `npm test`
- New tests to add in `test/run-tests.js`:
  - Parse a synthetic transcript with model change mid-session: verify turns before change have `from` model, turns after have `to` model.
  - Parse a synthetic transcript with no model change: verify all turns have the settings model.
  - Parse a synthetic transcript with `from None`: verify no backtracking, all turns have the `to` model.
  - `summarizeTurns` with mixed-model turns: verify `costUsd` equals sum of per-turn costs (not single-model recalculation).
  - `summarizeTurns` with legacy turns (no `costUsd`): verify fallback recalculation works.
  - Multi-parse stability: parse same transcript 3 times, verify identical per-turn models each time.
  - VG-003: Multi-model session parsing preserves per-turn model across 10+ re-parses.

**CLI**: `node test/run-tests.js`

---

### Sub-Task 4: Part 4 - Dynamic Y-Axis Chart

**Files to modify**: `src/html-report.js` (client-side JS template, lines 571-628, and CSS block)

**Prerequisites**: None (independent of Parts 1-3, but should run after Part 2 to avoid merge conflicts in `html-report.js`)

**Changes**:
1. Add `niceMax(rawMax)` function to the JS template.
2. Add `fmtAxis(v)` function to the JS template.
3. Change `PAD_L` from 8 to 48.
4. Replace `if (max <= 0) max = 1;` with `max = niceMax(max);`
5. Add guideline rendering loop (lines + labels) before the bars loop.
6. Add `.guide` and `.yaxis` CSS classes to the style block.
7. Include guidelines in the SVG return string.

**Test protocol**:
- Existing suite: `npm test`
- New tests to add in `test/run-tests.js`:
  - `niceMax(0)` returns 1.
  - `niceMax(3200)` returns 5000.
  - `niceMax(850000)` returns 1000000.
  - `niceMax(42)` returns 50.
  - `fmtAxis(0)` returns "0".
  - `fmtAxis(500)` returns "500".
  - `fmtAxis(5000)` returns "5K".
  - `fmtAxis(1500000)` returns "1.5M".
  - `fmtAxis(2000000)` returns "2M".
- Visual verification (VG-004): Generate a dashboard with `node bin/agy-tokens.js --html`, open in browser, confirm Y-axis labels and guidelines are visible.

**CLI**: `node test/run-tests.js` then `node bin/agy-tokens.js --html --open`

---

## Verification Gates Mapping

| Gate | Covered By | How |
|------|-----------|-----|
| VG-001: `npm test` passes 100% | All sub-tasks | Each sub-task runs `npm test` |
| VG-002: Statusline pipe error exits 0 | Sub-Task 2 | New test: simulate hook with error, check exit code |
| VG-003: Multi-model parsing preserves models | Sub-Task 3 | New test: 10x re-parse stability check |
| VG-004: Chart renders with Y-axis | Sub-Task 4 | New test: `niceMax`/`fmtAxis` unit tests + visual check |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Regex change breaks existing transcript parsing | Low | High | SETTINGS_CHANGE_RE change is additive (new capture group). Existing tests cover the `to` extraction. |
| Backtracking introduces wrong model for edge case | Medium | Medium | Conservative guard: only backtrack when `from` is not "None" and not empty. Extensive synthetic transcript tests. |
| `summarizeTurns` fallback path never triggers | Low | Low | Legacy cached sessions without `costUsd` exercise the fallback. Test with hand-crafted turn objects. |
| Nice number algorithm produces too-large y_max | Low | Low | 15% headroom cap. Algorithm tested with boundary values (0, 1, powers of 10). |
| PID in tmp filename breaks on long paths (Windows) | Low | Low | PID is 4-6 digits. Adds ~10 chars to filename. Well within 260-char limit. |

---

## Cross-Part Interaction Notes

1. **Part 1 and Part 2 both touch `html-report.js`**: Part 1 modifies `atomicWriteFile` (line 1149+), Part 2 touches lines 37 and 248-281 only if the `summarizeTurns` import changes (it does not). No conflict.

2. **Part 2 and Part 4 both touch `html-report.js`**: Part 2 modifies the `buildDashboardPayload` function (lines 248-281), Part 4 modifies the `renderSvg` JS template (lines 571-628) and CSS block. Different sections, no conflict.

3. **Part 3 is fully independent**: Only touches `src/config.js`.

4. **Part 1 REQ-001d (index.js try-catch) wraps the entire hook block**: This means any Part 2 changes to `log-parser.js` or `aggregator.js` that introduce new exceptions in the hook path will be caught by the REQ-001d guard. This is correct behavior: the fail-safe should catch all hook errors regardless of source.
