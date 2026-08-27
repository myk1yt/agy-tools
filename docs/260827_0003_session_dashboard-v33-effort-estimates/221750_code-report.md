# Code Task Report — agy-tokens v3.3, Batch 2 of 3 (Pipeline + Cache)

## Task Summary
Implemented Mandate 2 data-pipeline changes per [`220520_architect-report.md`](220520_architect-report.md) §2.2 (AD-2) and §2.4 (AD-4): [`parseTranscriptFile()`](../../src/log-parser.js) now scans `USER_INPUT` turns for `<USER_SETTINGS_CHANGE>` blocks and attributes each session to the LAST `Model Selection` change (effort-suffixed, e.g. `Gemini 3.7 Flash (High)`), with fallback precedence `override > modelName param > getActiveModelFromSettings()`. [`CACHE_SCHEMA_VERSION`](../../src/cache-manager.js) bumped 1 → 2 so historical sessions re-parse exactly once. REQ-254 and REQ-257 satisfied.

## Actions Taken
1. **[`src/log-parser.js`](../../src/log-parser.js)** (AD-2 / REQ-254):
   - Added module-level constants: `SETTINGS_CHANGE_MARKER = '<USER_SETTINGS_CHANGE>'` (cheap substring pre-filter) and `SETTINGS_CHANGE_RE = /changed setting \`Model Selection\` from .+? to (.+?)(?:\n|$)/` — compiled once, deliberately non-global so repeated `.exec()` calls never resume from a stale `lastIndex`.
   - In the existing streaming loop of [`parseTranscriptFile()`](../../src/log-parser.js:87): on `USER_INPUT`/`USER_EXPLICIT` turns, when `content.includes(SETTINGS_CHANGE_MARKER)`, apply the regex and track the LAST trimmed capture as `sessionModelOverride` (empty captures ignored).
   - After the loop: `finalModel = sessionModelOverride || model` where `model` already encodes the existing `param || settings` precedence — the override is inserted strictly as highest precedence, preserving the old chain exactly.
   - Session `modelName` = full effort-suffixed string (no stripping here — pricing strips via `getBaseModelName()` from Batch 1, AD-3).
   - Session-level `costUsd` and `cacheSavingsUsd` now computed with `finalModel` (the authoritative post-loop figures). Per-turn `costUsd` intentionally unchanged (pre-pass model) per AD-2 scope note: session-level granularity in v3.3; turn-level re-attribution is a documented future extension.
2. **[`src/cache-manager.js`](../../src/cache-manager.js)** (AD-4 / REQ-257): `CACHE_SCHEMA_VERSION` `1` → `2` (line 11). Nothing else changed — the existing [`loadCache()`](../../src/cache-manager.js:18) version-mismatch rejection discards old caches and returns a fresh root, forcing a one-time full re-parse; new caches are written with `version: 2`.
3. No other files touched. No git commands run.

## Result
✅ Success — all verification evidence below.

### Evidence 1: Full test suite
`node test/run-tests.js` → exit code 0:
```
Tests: 116 passed, 0 failed, 116 total
Duration: 17237ms
```
All 18 suites green, including Suite 4 (Log Parser — no settings-change fixtures yet, so no breakage, as predicted in §7 Batch 2) and Suite 5 (Cache Manager — references `CACHE_SCHEMA_VERSION` symbolically, unaffected by the bump).

### Evidence 2: Manual spot-check (synthetic transcripts in OS temp dir, outside the repo)
Script created 3 synthetic `.jsonl` transcripts in `%TEMP%`, called `parseTranscriptFile()` directly, then deleted them:
```
CASE1 with-block  modelName="Gemini 3.7 Flash (High)" costUsd=0.000189
CASE1 expect ["Gemini 3.7 Flash (High)"] => PASS
CASE2 no-block    modelName="Param Fallback Model" costUsd=0.000185
CASE2 expect ["Param Fallback Model"] => PASS
CASE3 last-wins   modelName="Claude Opus 4.6 (Thinking)"
CASE3 expect ["Claude Opus 4.6 (Thinking)"] => PASS
temp transcript files cleaned from C:\Users\k1yt\AppData\Local\Temp
ALL SPOT-CHECKS PASS
```
- **CASE1** (mandated check): transcript with a `USER_INPUT` turn containing `<USER_SETTINGS_CHANGE>` + line `changed setting \`Model Selection\` from None to Gemini 3.7 Flash (High)` plus a token-bearing assistant turn → `session.modelName === 'Gemini 3.7 Flash (High)'` ✅
- **CASE2** (mandated check): transcript WITHOUT the block → falls back to the passed-in `modelName` param (`'Param Fallback Model'`) ✅
- **CASE3** (bonus, AD-2 LAST-match semantics): two settings changes in one session → LAST one wins (`Claude Opus 4.6 (Thinking)`) ✅

### Evidence 3: Cleanup
- Temp transcripts removed by the verification script itself (confirmed in output above).
- The temporary verification script `tmp-verify-batch2.js` was deleted to the Recycle Bin (no permanent deletion).

## Issues Discovered
1. **Environment (transient, resolved)**: inline `node -e` with single-quoted JS broke under the shell's quoting; per tool discipline switched to a temp script file, which was deleted after use. No product impact.
2. **Pre-existing, report-only (matches architect report §7 "Issues Discovered" #1)**: per-turn `costUsd` inside the loop still uses the pre-pass model. With a session override, turn-level costs are attributed to the param/settings model while session totals use the final model. This is the documented AD-2 v3.3 scope decision (session-level granularity); session totals are the authoritative figure. Flagged for the future turn-level extension.
3. **Regex residual risk (accepted per AD-2 R4)**: a user pasting the literal settings-change phrasing inside a real `<USER_SETTINGS_CHANGE>` block would be captured — but the block marker only appears in genuine settings blocks, so false positives require the marker itself. Accepted (estimate-only tool).

## Next Step Recommendations
- VP: proceed to **Batch 3** (dashboard surface + tests): [`src/html-report.js`](../../src/html-report.js) estimate panel/disclaimer/`activeModel` label, and [`test/run-tests.js`](../../test/run-tests.js) suite 3 (+1), suite 4 (+2: settings-change extraction + fallback — the fixtures validated manually here), suite 15 (+3).
- After Batch 3: first production run will show a one-time full re-parse (cache v1 rejected by `loadCache()`); expected and bounded per AD-4.
- Batch 3's suite-4 tests can mirror CASE1/CASE2/CASE3 from Evidence 2 exactly.

## Affected File List
- [`src/log-parser.js`](../../src/log-parser.js) (modify — AD-2 settings-change scan, LAST-match override, fallback precedence, post-loop costing with final model)
- [`src/cache-manager.js`](../../src/cache-manager.js) (modify — `CACHE_SCHEMA_VERSION` 1 → 2, single line)
- `docs/260827_0003_session_dashboard-v33-effort-estimates/221750_code-report.md` (this report)