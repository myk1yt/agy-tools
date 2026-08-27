# New Session Prompt — Statusline-Only Token Dashboard v2

> 이 프롬프트를 새 세션(orchestrator-crow 모드)에 그대로 붙여넣으세요.

---

## Task: Rework agy-tools into a statusline-only real-time dashboard (v2 concept)

## Original Reports / Context (read these first, in order)
1. Architect report (data-flow & payload schema still valid): docs/260827_0001_session_usage-dashboard-integration/212115_architect-report.md
2. Latest code report: docs/260827_0001_session_usage-dashboard-integration/123345_code-report.md
3. Requirement checklist: docs/260827_0001_session_usage-dashboard-integration/requirement-checklist.md
- Repo: c:/Users/k1yt/OneDrive/Projects/Antigravity-cli (agy-tools, zero-dependency Node.js, Node ≥16, npm-linked globally)

## User Requirements (verbatim — these are the 4 mandates)
1. "Agy를 새로 시작했지만 statusline에 📊 Dashboard 가 보이지 않아." → FIX the missing dashboard link in the statusline badge.
2. "/tokens 기능은 완전히 삭제해야해." → DELETE the /tokens skill entirely (and the /tokens-related skill wiring).
3. "컨셉이 바뀌었으므로 readme를 포함한 설명 전체를 수정해야해. agy의 어떤것도 건드리지 않고 오로지 statusline만 사용할 필요가 있어." → Concept change: statusline-ONLY integration. No skills, no hooks.json, no slash commands. agy itself must not be touched in any way beyond the statusLine entry in ~/.gemini/antigravity-cli/settings.json (which is a user config file, not agy itself).
4. "Dashboard에는 모델별 사용량, 그리고 비용계산이 포함되어야해." → The dashboard.html must include PER-MODEL usage breakdown and per-model cost calculation.

## VP-Verified Root Cause for Requirement 1 (do not re-litigate, just fix)
The OSC 8 link was NEVER wired into the badge:
- src/hook-handler.js line 146: `const badgeStr = renderRealTimeBadge(badgeData, currency, isFree);` — the 4th `link` parameter is never passed.
- src/index.js hook branch (lines ~342-387) never builds the link either; `dashboardFileUrl()` is only used in the `--html` branch (line 303).
- src/formatter.js renderRealTimeBadge(badgeData, currencyCode, isFree, link=null) already supports the link param (line 620, appends at 637-639).
- src/osc8.js already has formatOsc8Link(uri,label) + dashboardFileUrl() (pathToFileURL).
- Fix: in the hook branch, build `const link = options.noLink ? null : osc8.formatOsc8Link(osc8.dashboardFileUrl(), i18n.t('dashboardLink'))` and pass it through handlePostInvocation → renderRealTimeBadge. Verify with `agy-tokens --hook --raw` → output must contain `📊 Dashboard` (OSC 8 wrapped). ALSO verify live in agy TUI after restart — if agy's statusline renderer strips OSC 8 escapes (architect report Risk table, likelihood Medium), the fallback plan is: keep the plain-text `📊 Dashboard` label AND make the whole badge clickable via a different mechanism, or drop the link and rely on `agy-tokens --html --open`. Decide based on live evidence.

## Work Items

### W1. Fix the missing 📊 Dashboard link (Requirement 1)
- Wire the link param through src/index.js hook branch → src/hook-handler.js handlePostInvocation → renderRealTimeBadge.
- Respect --no-link and NO_COLOR/TERM=dumb (osc8.isOsc8Supported already handles env detection).
- Live verification: restart agy → statusline shows `⚡ [Antigravity] Turn: ... | Today: ... | Cache: ...% | 📊 Dashboard`; Ctrl+Click opens dashboard.html in browser. If agy strips OSC 8 in statusline rendering, document it and implement fallback (see above).

### W2. Delete /tokens skill completely (Requirement 2)
- Delete integrations/skills/tokens/ directory (SKILL.md).
- Delete C:\Users\k1yt\.gemini\skills\tokens\ directory (live deployment).
- integrations/skills/usage/SKILL.md: remove /tokens, /cost, /dashboard slash-command trigger language. Per Requirement 3, the new concept is statusline-only — evaluate whether the usage skill should ALSO be deleted. Default: DELETE both skills (user said "오로지 statusline만 사용"), remove skills/ copies from scripts/install.bat + install.sh, and remove skill references from README.
- Update test/run-tests.js suite 10 (SKILL.md/hooks.json integrity) to match the new reality (no skills).
- Note: hooks.json PostInvocation hook — per Requirement 3 ("오로지 statusline만"), the hook should ALSO be removed from ~/.gemini/hooks.json and integrations/hooks.json deleted, since the statusline --write-dashboard side effect already refreshes data on every state change. Confirm: statusline runs on EVERY state change (more often than PostInvocation), so the hook is redundant. Remove it.

### W3. Statusline-only concept + full docs rewrite (Requirement 3)
- README.md: rewrite the integration story. New concept: "agy-tokens = statusline-powered real-time token dashboard. Zero agy modification: one statusLine entry in ~/.gemini/antigravity-cli/settings.json is the ONLY integration point."
- Remove/replace all /usage, /tokens, skill, hooks.json sections in README.
- Keep documented: --html, --serve, --write-dashboard, --open, --no-link, --refresh, statusline settings.json snippet (8.3 short paths, no quotes), dashboard features.
- scripts/install.bat + install.sh: remove skill copying; keep npm link + optionally write the statusLine snippet guidance (do NOT auto-edit settings.json in installer; print instructions instead).
- integrations/hooks.json: delete file (concept removed).
- integrations/skills/usage/SKILL.md: delete (concept removed).

### W4. Per-model usage & cost in dashboard (Requirement 4)
- Data layer: sessions already carry modelName (src/log-parser.js parseTranscriptFile returns modelName per session; aggregator aggregates across sessions). Extend src/html-report.js buildDashboardPayload to add a `models` array: for each distinct model found in sessions → { model, displayName, totalTokens, inputTokens, cachedTokens, outputTokens, cacheHitRate, costUsd, cacheSavingsUsd, sessions, turns }. Cost per model uses existing calculateCostUsd/getModelPricing from src/config.js with each session's own modelName (NOT the global active model) — check how log-parser assigns cost per turn today; if turns are costed with the global model, fix to use per-session/per-turn model for accuracy.
- dashboard.html: add a "Models" section — per-model table (model name, tokens, cache %, cost, savings) + per-model share bar (inline SVG/CSS). Keep zero-dependency, inline everything.
- Payload schema: extend the §1.4 schema in the architect report with `models: ModelRow[]`; bump version to 2.
- i18n: new keys (modelsTitle, modelColumn, etc.) ×4 locales in the same batch (suite 3 parity).
- Tests: extend suite 15 (html-report) for the models array; keep all suites green.

## Hard Constraints (unchanged)
- Zero new npm dependencies (Node core only).
- All writes atomic (tmp+rename); statusline script work <20ms after node startup.
- --serve binds 127.0.0.1 only.
- file:// pages: script-tag injection polling ONLY (fetch/XHR is CORS-blocked).
- 8.3 short paths, no quotes, in the settings.json statusLine command: C:\PROGRA~1\nodejs\node.exe C:\Users\k1yt\AppData\Roaming\npm\NODE_M~1\AGY-TO~1\bin\AGY-TO~1.JS --hook --raw --write-dashboard
- 🚫 NO git commit/push (VP does that). 🚫 Do NOT touch C:\Users\k1yt\AppData\Local\agy\** or any agy binary/config beyond the statusLine value in ~/.gemini/antigravity-cli/settings.json.

## Verification Gates
1. `node test/run-tests.js` → all suites green after every batch.
2. `agy-tokens --hook --raw` → single line ending with `📊 Dashboard` (OSC 8 wrapped).
3. `agy-tokens --html` → dashboard.html contains per-model section with real data (verify by opening the file and checking the models table renders).
4. `agy-tokens --hook --raw --write-dashboard` → dashboard-data.js contains `models` array with ≥1 entry and per-model costUsd values.
5. Live: restart agy → statusline badge visible with Dashboard segment; no skills listed in `agy -p "/skills"` for tokens/usage; no errors in agy startup.
6. `~/.gemini/hooks.json` no longer contains token-tracker (or file deleted); agy starts clean.

## Report
Write report to: docs/260827_0001_session_usage-dashboard-integration/HHMMSS_code-report.md (HHMMSS = current 24h time, must be later than 123345)
Required sections: Task Summary / Actions Taken (per work item) / Result (+evidence) / Issues Discovered / Next Step Recommendations / Affected File List.

Upon task completion, return using `attempt_completion` instead of `switch_mode`.

Report Folder: docs/260827_0001_session_usage-dashboard-integration/