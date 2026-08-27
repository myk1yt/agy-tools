# Code Task Report — Batch 3.5: Settings-Change Model Name Sanitization (REQ-255)

## Task Summary
Sanitized the `SETTINGS_CHANGE_RE` capture in `src/log-parser.js` so the extracted model identity is a clean display string (e.g. `Claude Opus 4.6 (Thinking)`), free of trailing prompt boilerplate that live transcripts append to the settings-change line. Added fixture coverage for the polluted live format. Bumped the tracker cache schema to 3 after the live check confirmed stale polluted identities persisted in the schema-2 cache.

## Actions Taken
1. **`src/log-parser.js` — regex tightening (root-cause fix at capture point)**
   - Replaced the end-of-line capture `/changed setting \`Model Selection\` from .+? to (.+?)(?:\n|$)/` with a sentence-boundary-terminated capture:
     `/changed setting \`Model Selection\` from .+? to ([^\n]+?)(?:[.!?;:,。！？；：](?:\s|$)|\n|[`—–<]|$)/`
   - The capture now stops at the first occurrence of: sentence punctuation (`. ! ? ; : ,` + CJK/fullwidth equivalents) followed by whitespace or end-of-string, a newline, a backtick, `<`, or an em/en dash. Model display names never contain these sequences internally (dots in names are dot-without-space like `4.6`), so clean synthetic lines (`... to Gemini 3.7 Flash (High)` at line end) and polluted live lines are both handled.
   - Updated the JSDoc block to document the boilerplate-pollution rationale.
2. **`src/log-parser.js` — defense-in-depth trim at capture site**
   - At the capture site (formerly line 167–175), added a trailing-punctuation strip before storing the override: `settingsMatch[1].replace(/[.!?;:,。！？；：]+$/, '').trim()` — guards against a bare trailing `.` at line end surviving the regex boundary.
   - LAST-match tracking, `<USER_SETTINGS_CHANGE>` pre-filter, and fallback precedence (override > param > settings) left untouched.
3. **`test/run-tests.js` — new fixture test (suite 4)**
   - Added `Should sanitize trailing boilerplate from settings-change model name (REQ-255)`: a settings-change line with trailing boilerplate (`... from None to Claude Opus 4.6 (Thinking). No need to comment on this change.`) must yield `session.modelName === 'Claude Opus 4.6 (Thinking)'` exactly, with explicit negative assertions for `. No need` and `No need to comment`. Existing 3 suite-4 tests untouched and passing.
4. **`src/cache-manager.js` — cache schema bump 2 → 3**
   - Justification: the first live check (`--hook --raw --write-dashboard`) showed polluted names still in `dashboard-data.json` (`Gemini 3.6 Flash (Medium). No need to comment on this change...` as a `dailyModels` key) because the schema-2 cache was written with polluted identities and `loadCache()` accepts only exact version matches. Per task instruction ("bump to 3 ONLY if the live check shows stale polluted names persisting"), bumped `CACHE_SCHEMA_VERSION` to 3 with an explanatory comment. This forced a full re-parse of all 489 sessions through the sanitized parser.

## Result
**Success.** Evidence:

- **Test suite** (`node test/run-tests.js`, run twice — before and after the schema bump):
  `Tests: 124 passed, 0 failed, 124 total` (123 prior + 1 new REQ-255 test). Suite 4 output confirms all four settings-change tests green, including the new sanitization test.
- **Live-data check (before schema bump)**: `dashboard-data.json` `dailyModels` still contained the polluted key `Gemini 3.6 Flash (Medium). No need to comment on this change if the user doesn't ask about it. If reporting what model you are, please use a human readable name instead of the exact string.` — confirming the schema-2 cache held stale polluted identities.
- **Live-data check (after schema bump)**: `node bin/agy-tokens.js --hook --raw --write-dashboard` (exit 0, ko locale badge rendered). Regenerated `dashboard-data.json`:
  - `dailyModels` keys: `Gemini 3.6 Flash (Medium)`, `Gemini 3.7 Flash (High)`, `Gemini 3.6 Flash (High)`, `Claude Opus 4.6 (Thinking)` — **polluted count: 0** (grep for `No need|human readable|exact string` matched nothing).
  - `models` array: 4 clean distinct rows, e.g. `{"model":"Claude Opus 4.6 (Thinking)","sessions":18,...}` and `{"model":"Gemini 3.7 Flash (High)","sessions":457,...}` — no prose suffixes, no split variants.
  - Cache file `C:/Users/k1yt/.gemini/token_tracker_cache.json`: `version: 3`, 489 sessions, distinct modelNames exactly `["Gemini 3.7 Flash (High)","Gemini 3.6 Flash (High)","Claude Opus 4.6 (Thinking)","Gemini 3.6 Flash (Medium)"]`.

## Issues Discovered
- The task's example path `data.json` did not match the actual artifact name (`dashboard-data.json`); located via directory listing. No code impact.
- The execute_command terminal runs cmd.exe, not PowerShell (`$env:` and `Get-ChildItem` failed); worked around with plain `node -e` and `dir`. No code impact.
- The schema-2 cache indeed persisted polluted identities across runs, validating the pre-authorized conditional schema bump.

## Next Step Recommendations
- None blocking. Optional future hardening: if Antigravity ever emits model names containing a sentence punctuation character followed by a space (none exist today across known catalogs), the boundary set would need revisiting.
- VP may want to note the cache schema is now 3; any external tooling reading `token_tracker_cache.json` should expect `version: 3`.

## Affected File List
- `src/log-parser.js` (regex + capture-site trim + JSDoc)
- `src/cache-manager.js` (CACHE_SCHEMA_VERSION 2 → 3 + comment)
- `test/run-tests.js` (1 new REQ-255 fixture test in suite 4)