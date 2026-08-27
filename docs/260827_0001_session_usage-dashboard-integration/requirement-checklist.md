# Requirement Checklist
## Task: agy-tokens v2 — Statusline-Only Real-Time Dashboard
## Date: 260827
## Session Folder: docs/260827_0001_session_usage-dashboard-integration/

> v2 concept change (user mandate): statusline-ONLY integration. No skills, no hooks.json,
> no slash commands. The ONLY integration point is the statusLine entry in
> ~/.gemini/antigravity-cli/settings.json (user config, not agy itself).
> v1 requirements (REQ-001..008, skill/hook-based) are SUPERSEDED and closed.

- [ ] [REQ-101] Statusline badge ends with a `📊 Dashboard` segment wrapped in an OSC 8 hyperlink (link param wired: src/index.js hook branch → src/hook-handler.js handlePostInvocation → renderRealTimeBadge). Respects --no-link and NO_COLOR/TERM=dumb.
- [ ] [REQ-102] `/tokens` skill deleted entirely: integrations/skills/tokens/ removed from repo AND C:\Users\k1yt\.gemini\skills\tokens\ removed from live deployment.
- [ ] [REQ-103] `usage` skill also deleted (statusline-only concept): integrations/skills/usage/ removed from repo AND C:\Users\k1yt\.gemini\skills\usage\ removed from live deployment.
- [ ] [REQ-104] hooks.json removed: integrations/hooks.json deleted from repo; token-tracker PostInvocation hook removed from C:\Users\k1yt\.gemini\hooks.json (statusline --write-dashboard refreshes data on every state change, making the hook redundant).
- [ ] [REQ-105] README.md fully rewritten for the statusline-only concept: "one statusLine entry in ~/.gemini/antigravity-cli/settings.json is the ONLY integration point". All /usage, /tokens, skill, hooks.json sections removed. Documents --html, --serve, --write-dashboard, --open, --no-link, --refresh, settings.json snippet (8.3 short paths, no quotes), dashboard features.
- [ ] [REQ-106] scripts/install.bat + install.sh: skill copying removed; installer prints statusLine snippet instructions instead of auto-editing settings.json.
- [ ] [REQ-107] Dashboard includes PER-MODEL usage breakdown and per-model cost calculation: payload gains `models: ModelRow[]` (model, displayName, totalTokens, inputTokens, cachedTokens, outputTokens, cacheHitRate, costUsd, cacheSavingsUsd, sessions, turns), costed per session/turn model (not global active model). Payload schema version bumped to 2.
- [ ] [REQ-108] dashboard.html renders a "Models" section: per-model table (model, tokens, cache %, cost, savings) + per-model share bar; zero-dependency, inline everything.
- [ ] [REQ-109] i18n: new keys (modelsTitle, modelColumn, etc.) added to all 4 locales in one batch (suite 3 parity holds).
- [ ] [REQ-110] Tests: suite 10 updated for no-skills reality; suite 15 extended for models array; `node test/run-tests.js` all suites green.
- [ ] [REQ-111] Live verification: `agy-tokens --hook --raw` ends with `📊 Dashboard` (OSC 8); `--write-dashboard` payload contains models array with ≥1 entry and per-model costUsd; agy restart shows badge; `agy -p "/skills"` lists no tokens/usage skills; ~/.gemini/hooks.json has no token-tracker; agy starts clean.
- [ ] [REQ-112] Hard constraints hold: zero new npm deps; atomic writes; --serve binds 127.0.0.1 only; file:// polling via script-tag injection only; 8.3 short-path statusLine command; no touching C:\Users\k1yt\AppData\Local\agy\** or agy binary/config beyond the statusLine value.