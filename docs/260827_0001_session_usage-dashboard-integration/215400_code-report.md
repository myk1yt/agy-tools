# Code Report — Batch B: W2 (delete /tokens skill + hooks) + W3 (statusline-only docs/installers)

**Mode:** code | **Date:** 2026-08-27 | **Session:** docs/260827_0001_session_usage-dashboard-integration/
**Task:** W2 — delete `integrations/skills/tokens/`, `integrations/skills/usage/`, `integrations/hooks.json` and re-point test suite 10 at the no-skills reality; W3 — rewrite README + both installers for the statusline-ONLY concept. Repo files only; live deployment (`~/.gemini/**`, `AppData\Local\agy\**`) untouched per mandate.

---

## Task Summary

Executed the v2 concept change end-to-end on the repo side: removed every skill and hook artifact from the repository (via Recycle Bin, no permanent deletion), converted test suite 10 from "SKILL.md/hooks.json integrity" into "statusline-only concept integrity" regression guards, rewrote [README.md](../../README.md) around the new headline ("one `statusLine` entry in `~/.gemini/antigravity-cli/settings.json` is the ONLY integration point"), and stripped all skill/hooks copy logic from both installers, replacing it with printed manual statusLine instructions (8.3 short paths, `--write-dashboard` included). All 90 tests green; all 4 verification gates pass with grep evidence.

## Actions Taken (per work item)

### W2.1 — Delete skills + hooks (repo side)
- Deleted `integrations/skills/tokens/` (SKILL.md), `integrations/skills/usage/` (SKILL.md), `integrations/hooks.json` via PowerShell `Microsoft.VisualBasic.FileIO.FileSystem` → **Recycle Bin** (data-safety rule: no permanent deletion).
- Removed the now-empty `integrations/skills/` and `integrations/` parent directories the same way. `Test-Path integrations` → **False**.
- Environment note: this workspace's `execute_command` runs cmd.exe despite system info saying PowerShell (known from v1 report) — first attempt failed with `'Add-Type' is not recognized`; fixed by invoking `powershell -NoProfile -Command` explicitly.

### W2.2 — Test suite 10 rewrite ([test/run-tests.js](../../test/run-tests.js#L733-L765))
- Suite renamed: `10. Toolkit Subcommand & Extensibility Unit Tests` → `10. Toolkit Subcommand & Statusline-Only Concept Integrity`.
- Removed the 2 obsolete tests (usage SKILL.md frontmatter; hooks.json PostInvocation schema).
- Added 3 regression guards:
  1. `integrations/skills/` must **NOT** exist (no-skills regression guard).
  2. `integrations/hooks.json` must **NOT** exist (no-hooks regression guard; message explains `--write-dashboard` supersedes PostInvocation).
  3. README integrity: must contain `statusLine`, `--write-dashboard`, `PROGRA~1` (8.3 short paths), and must NOT match `/\/usage|\/tokens|skill|hooks\.json/i`.
- Kept the 2 existing package/bin integrity tests. Suite count 4 → 5 tests; total 89 → 90.

### W3.5 — README rewrite ([README.md](../../README.md))
- **Intro (L9)**: new headline — "Its flagship **agy-tokens** command is a **statusline-powered real-time token dashboard**. Zero agy modification: one `statusLine` entry in `~/.gemini/antigravity-cli/settings.json` is the ONLY integration point".
- **Feature bullet (L21)**: `🪝 Antigravity Lifecycle Hook Integration` (skills + slash commands + /usage reservation note) → `🔗 Statusline-Only Integration` (one settings.json entry, no background processes, `--write-dashboard` refresh).
- **Architecture diagram (L62)**: `PostInvocation Hook Badge` box → `Statusline Badge (--hook)`.
- **Section 7 (L177)**: retitled `Real-Time Statusline Badge (--hook)`; raw output sample now ends with `| 📊 Dashboard` (matches Batch A reality); wording changed from "PostInvocation hook output" to "statusline payload consumed by the agy statusline runner".
- **Options table (L246)**: `--hook` row no longer says "PostInvocation hook contract".
- **Integration section (L281–299)**: the entire `🪝 Antigravity Lifecycle Hook Integration` section (hooks.json JSON, skills copy instructions, `/usage` reservation warning, `/tokens` `/cost` `/dashboard` trigger list) replaced by `🔗 Statusline Integration — The ONLY Integration Point`:
  - Exact statusLine snippet with **8.3 short paths, no inner quotes**: `C:\PROGRA~1\nodejs\node.exe C:\Users\k1yt\AppData\Roaming\npm\NODE_M~1\AGY-TO~1\bin\AGY-TO~1.JS --hook --raw --write-dashboard` (JSON-escaped as `\\` inside the json code fence).
  - Bullets: 8.3 short-path rationale (`dir /x` hint), OSC 8 `📊 Dashboard` segment behavior + `--no-link`, `--write-dashboard` refreshes on **every state change** (more often than any lifecycle event), restart-agy note, one-time `agy-tokens --html`.
- **Kept intact per mandate**: `--html` (§8), `--serve` (§9), `--write-dashboard` (§10), `--open`, `--no-link`, `--refresh` rows, dashboard features including the Batch-A per-model usage & cost section.

### W3.6/7 — Installers
- [scripts/install.bat](../../scripts/install.bat): removed the entire `%GEMINI_DIR%` block (usage/tokens skill `copy /y`, merge-safe hooks.json `findstr` logic). Kept node check, `npm link`, npm-link-failure fallback launcher, and the "Try running" block. Added a printed statusLine instruction block: target path `%USERPROFILE%\.gemini\antigravity-cli\settings.json`, the exact 8.3 short-path JSON snippet, and 4 explanation lines (short paths, `dir /x`, `--write-dashboard`, one-time `--html`). **Does NOT auto-edit settings.json.**
- [scripts/install.sh](../../scripts/install.sh): same removals (skill `cp`, merge-safe `grep -q token-tracker` hooks logic). Added the same printed instructions, plus a Linux/macOS note that the short-path form is Windows-specific and the POSIX form is `"command": "agy-tokens --hook --raw --write-dashboard"`.

### W3.8 — Stale-reference sweep
- `search_files` over `*.{js,json,md,bat,sh}` for `skill|hooks\.json|/usage|/tokens`:
  - `src/**`, `bin/**`, `scripts/**`, `README.md`: **0 stale references** (src/i18n.js `PostInvocation` strings describe the `--hook` I/O contract, which remains a real CLI flag; i18n.js is Batch-A-protected — untouched).
  - `test/run-tests.js`: only the 3 intentional new regression guards.
  - `docs/**`: historical session reports (read-only records per Report Protocol) — not user-facing docs, left as-is.
- `--help`/usage text ([src/formatter.js](../../src/formatter.js) `renderHelp`) contains no skill/hooks.json references — verified by the sweep; no changes needed.

## Result

**SUCCESS — all 4 verification gates pass with live evidence.**

| Gate | Evidence |
|---|---|
| 1. Full suite | `node test/run-tests.js` → **90 passed, 0 failed, 90 total** (17 suites), exit 0. Suite 10 output: all 5 tests ✓ including the 3 new statusline-only guards |
| 2. Deletions | `Test-Path integrations` → **False** (skills/, hooks.json, and the parent dir all gone from the repo) |
| 3. README | `Select-String -Pattern '/usage|/tokens|skill|hooks\.json'` on README.md → **0 matches**; required refs present: L9 + L283 headline ("ONLY integration point"), L288–291 statusLine snippet with `PROGRA~1`/`NODE_M~1`/`AGY-TO~1` + `--write-dashboard`, L296 8.3 short-path explanation |
| 4. Installers | install.bat: `skill|hooks\.json|SKILL` → **0 matches**; statusLine instruction block at L35–49 (echo-only, no settings.json edit). install.sh: same → **0 matches**; instruction block at L39–53 incl. POSIX variant note |
| Constraints | Zero new npm deps ✓ · no git commit/push ✓ · `C:\Users\k1yt\AppData\Local\agy\**` and `~/.gemini/**` untouched ✓ · Batch-A files (hook-handler/html-report/formatter/osc8/i18n/aggregator/log-parser/config) untouched ✓ · deletions via Recycle Bin ✓ |

## Issues Discovered

1. **execute_command runs cmd.exe, not PowerShell** (recurring, already logged in v1 report): `Add-Type` failed on the first deletion attempt. Workaround: wrap in `powershell -NoProfile -Command`. Consider a `docs/feedbacks/` entry or environment fix.
2. **apply_diff multi-block format rejected** when blocks were chained with bare `=======` separators between them — the parser treats every `=======` as a block delimiter. Fixed by issuing 6 single-block diffs sequentially. No file corruption (error occurred before any write).
3. **Suite-10 README guard regex tightened twice**: first version checked `/usage|/tokens|hooks\.json|SKILL\.md`; widened to bare `skill` so the guard matches the VP's grep gate exactly (README must contain no "skill" substring at all).
4. **Live deployment cleanup remains open** (out of scope by mandate): `C:\Users\k1yt\.gemini\skills\tokens\`, `C:\Users\k1yt\.gemini\skills\usage\`, and the token-tracker entry in `C:\Users\k1yt\.gemini\hooks.json` still exist on disk; `~/.gemini/antigravity-cli/settings.json` statusLine still points at the bare `agy-tokens --hook --raw` shim rather than the 8.3 short-path command. All are REQ-102/103/104/111/112 live-side items for the separate later batch.

## Next Step Recommendations

1. **Live deployment cleanup batch** (REQ-102/103/104 live side + REQ-111): delete `~/.gemini/skills/tokens/` + `~/.gemini/skills/usage/`, remove the token-tracker PostInvocation entry from `~/.gemini/hooks.json`, and update the settings.json statusLine command to the 8.3 short-path form with `--write-dashboard`; then restart agy and verify badge + `agy -p "/skills"` lists neither skill.
2. Refresh the npm-global copy (`npm link`) before the live statusline picks up repo changes (statusline runs the global install, not this checkout).
3. Optionally log the cmd.exe-vs-PowerShell terminal mismatch to `docs/feedbacks/fromcode/` (2nd occurrence across batches).

## Affected File List

**Deleted (Recycle Bin):**
- `integrations/skills/tokens/SKILL.md`
- `integrations/skills/usage/SKILL.md`
- `integrations/hooks.json`
- `integrations/skills/` + `integrations/` (empty parents)

**Modified:**
- [test/run-tests.js](../../test/run-tests.js) (suite 10 rewritten: −2 obsolete tests, +3 statusline-only regression guards)
- [README.md](../../README.md) (intro, feature bullet, diagram label, §7, options table, integration section → statusline-only)
- [scripts/install.bat](../../scripts/install.bat) (skill/hooks copy removed; statusLine instructions printed)
- [scripts/install.sh](../../scripts/install.sh) (same)

**Untouched (verified):** `src/**` (all 13 files incl. Batch-A territory), `bin/*`, `package.json`, `data/pricing.json`, `docs/**` historical reports, `C:\Users\k1yt\AppData\Local\agy\**`, `~/.gemini/**`.