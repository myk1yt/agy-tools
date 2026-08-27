# Debug Task Report — Technical Review: agy-token v3.3 (commit `1a1cd17`)

## Task Summary
Independent technical review of commit `1a1cd17` (`feat(dashboard): add long-term estimate panel, reasoning-effort distinction, and perfect i18n (v3.3)`) against its baseline. The requested baseline hash `0e2f9b6` does NOT exist in this repository (17 commits total, no object matches). The v3.3 requirement checklist ([`requirement-checklist.md`](docs/260827_0003_session_dashboard-v33-effort-estimates/requirement-checklist.md:5)) designates `a940bbf` as the baseline, so the review was performed against `a940bbf` (the parent of `1a1cd17`).

## Actions Taken

### 1. Baseline verification
- `git cat-file -t 0e2f9b6` → `fatal: Not a valid object name` (baseline hash from task message is invalid).
- `git log --all` → 17 commits; `1a1cd17` is HEAD on `main`; parent is `a940bbf`.
- Cross-checked [`requirement-checklist.md`](docs/260827_0003_session_dashboard-v33-effort-estimates/requirement-checklist.md:5): "Baseline: git `a940bbf` (main), 116 tests / 18 suites PASS, payload v3" → review baseline = `a940bbf`.

### 2. Diff review (13 files, +1342/−29)
| File | Change | Assessment |
|---|---|---|
| [`src/config.js`](src/config.js:442) | New `getBaseModelName()` + wiring into `getModelPricing()` | ✅ Correct |
| [`src/i18n.js`](src/i18n.js:174) | 6 estimate keys × 21 locales (126 entries) | ✅ Complete |
| [`src/log-parser.js`](src/log-parser.js:181) | `SETTINGS_CHANGE_RE` + LAST-match override + fallback precedence | ✅ Correct |
| [`src/cache-manager.js`](src/cache-manager.js:14) | `CACHE_SCHEMA_VERSION` 1 → 3 | ⚠️ Doc discrepancy (see Issues #2) |
| [`src/html-report.js`](src/html-report.js:480) | Estimate panel CSS/HTML + `computeEstimates`/`renderEstimates` + `updateI18N`/`render()` updates | ✅ Correct |
| [`test/run-tests.js`](test/run-tests.js:346) | +8 tests (suite 3 +1, suite 4 +4, suite 15 +3) | ✅ All pass |
| `docs/260827_0003_session_dashboard-v33-effort-estimates/*` | 7 session docs (architect + 4 code reports + checklist + prompt) | ✅ Consistent |

### 3. Independent verification (beyond the commit's own tests)

**a. Full test suite** — `node test/run-tests.js`:
```
Tests: 124 passed, 0 failed, 124 total (18 suites, 2748ms)
```

**b. Regex edge cases** (direct `node -e` execution of `SETTINGS_CHANGE_RE`):
- `... from None to Gemini 3.7 Flash (High)` → `"Gemini 3.7 Flash (High)"` ✅
- `... to Claude Opus 4.6 (Thinking). No need to comment on this change.` → `"Claude Opus 4.6 (Thinking)"` ✅ (boilerplate stripped)
- `... from Gemini 3.7 Flash (High) to Claude Opus 4.6 (Thinking)` → `"Claude Opus 4.6 (Thinking)"` ✅
- Trailing-newline variant → clean capture ✅

**c. `getBaseModelName()` edge cases**:
- `'Gemini 3.7 Flash (High)'` → `'Gemini 3.7 Flash'` ✅
- `'Claude Opus 4.6 (Thinking)'` → `'Claude Opus 4.6'` ✅
- `'(High)'` → `'(High)'` (empty-result guard) ✅
- `null` → `null` (passthrough) ✅
- `calculateCostUsd(1000,500,200,'Gemini 3.7 Flash (High)') === calculateCostUsd(...,'Gemini 3.7 Flash')` → `true` ✅ (REQ-256)

**d. Client JS syntax** — extracted the 32,962-char inline IIFE from rendered HTML → `node --check` passes ✅

**e. Estimate math simulation** (synthetic 30-day constant series, 1000 tokens/$0.50 per day, 31-day month, day 28):
- MTD = 28,000 (expect 28,000) ✅
- avg7 = 1,000 ✅ · avg30 = 1,000 ✅
- monthEnd = 31,000 (expect 31,000) ✅
- total30 = 30,000 ✅

**f. Live CLI gate (ko)** — `AGY_LANG=ko node bin/agy-tokens.js --hook --raw --write-dashboard`:
- Badge renders single-line with OSC 8 link ✅
- `dashboard.html`: `lang="ko"`, disclaimer text, `id="estimatePanel"`, `computeEstimates` present ✅
- `dashboard-data.json`: version 3; models = `Claude Opus 4.6 (Thinking) | Gemini 3.7 Flash (High) | Gemini 3.6 Flash (High) | Gemini 3.6 Flash (Medium)`; **polluted keys: NONE** ✅ (REQ-255 live check)
- `token_tracker_cache.json`: version 3, 489 sessions ✅

**g. Live RTL gate (ar)** — `AGY_LANG=ar ... --write-dashboard`:
- `dir="rtl"` ✅ · Arabic disclaimer text ✅

## Result
**APPROVE with 3 minor findings.** All 10 REQs (250–259) are implemented and independently verified. No functional defects found.

## Issues Discovered

### 🟡 Issue 1 — `getModelPricing()` no-arg fallback skips suffix stripping
[`src/config.js:457`](src/config.js:457): `const rawTarget = getBaseModelName(modelName) || getActiveModelFromSettings();`
When `modelName` is null/undefined (aggregator paths calling `summarizeTurns(turns, null)`), the settings fallback is used **without** stripping. If `settings.json` holds a suffixed name whose base model is not substring-matched by an alias, pricing falls to the heuristic:
- Verified: `getModelPricing('Claude Opus 4.6 (Thinking)')` → `claude-3-opus` rates (15/75) via alias substring match.
- But the unstripped no-arg path would hit `smartHeuristicPricing('Claude Opus 4.6 (Thinking)')` → **1.25/5** (12× under-cost).
- Gemini suffixed names are saved by the `'gemini 3.7 flash'` alias substring match, so today's default model is unaffected.
- **Recommendation**: change to `getBaseModelName(modelName || getActiveModelFromSettings())` so the fallback is also stripped. One-line fix; no test breakage expected.

### 🟢 Issue 2 — Cache schema version history discrepancy (documentation only)
The commit comment at [`src/cache-manager.js:10`](src/cache-manager.js:10) says "bumping invalidates **schema-2** caches", and the Batch 3.5 report claims "2 → 3". Git history shows `CACHE_SCHEMA_VERSION = 1` at `a940bbf` and every prior commit — the intermediate value 2 never existed in any committed state (Batch 2's 1→2 bump was evidently superseded before commit). Final value 3 is correct and the invalidation works; only the comment/report narrative is inaccurate.

### 🟢 Issue 3 — Version label mismatch (pre-existing, not introduced here)
`package.json` `version` is `1.0.0`; `agy-tokens --version` prints `v1.0.0` while the commit message and docs label the release "v3.3". The dashboard payload version (3) and cache schema (3) are consistent, but the CLI-reported package version lags the feature versioning scheme. Cosmetic; flag for VP housekeeping.

### Observations (no action required)
- On first render, `updateI18N(p)` calls `renderEstimates(lastPayload)` while `lastPayload` is still null (it is set in `initFilters(p)` afterwards); the panel briefly shows zeros before `render()` calls `renderEstimates(p)` with real data. Harmless.
- `estAvgLabel` is overwritten by `renderEstimates` to include inline values (`Daily Average (7d / 30d) (1.0K / 1.0K)`), duplicating the `estAvgValue` node. Design choice, not a bug.
- `computeEstimates` uses the client's local `new Date()` while `daily[].date` strings come from the server's local timezone; same-machine usage makes divergence negligible.

## Next Step Recommendations
1. Apply the one-line Issue 1 fix (`getBaseModelName(modelName || getActiveModelFromSettings())`) in a follow-up code delegation, with a suite-2 assertion for the no-arg suffixed path.
2. VP housekeeping: correct the cache-schema comment narrative (1 → 3, not 2 → 3) and decide whether `package.json` version should track the v3.x feature line.
3. Proceed to P6 Final Ask Audit; no blocking defects.

## Affected File List
- Reviewed (no modifications made): `src/config.js`, `src/i18n.js`, `src/log-parser.js`, `src/cache-manager.js`, `src/html-report.js`, `test/run-tests.js`
- Report only: `docs/260827_0002_session_dashboard-v3-i18n-filters/074200_debug-report.md` (this file)
