# Requirement Checklist
## Task: /usage Instant Dashboard Integration for agy (Antigravity CLI)
## Date: 260827
## Session Folder: docs/260827_0001_session_usage-dashboard-integration/

- [ ] [REQ-001] When the user types `/usage` inside agy (Antigravity CLI), the agy-tokens rich dashboard (today's tokens, cost, cache hit rate, sessions, turns) is displayed immediately.
- [ ] [REQ-002] The integration survives agy auto-updates (agy.exe is replaced at C:\Users\k1yt\AppData\Local\agy\bin\agy.exe on every update; integration must live OUTSIDE the binary, in user config dirs).
- [ ] [REQ-003] Root cause documented: `/usage` is a built-in system slash command (quota panel) in agy 1.1.22; a custom skill named `usage` cannot shadow it because system commands take precedence over skill-derived slash commands.
- [ ] [REQ-004] Alternative trigger paths implemented and verified: (a) renamed skill slash command (e.g. `/tokens`, `/cost`, `/dashboard`) that expands the skill and runs agy-tokens; (b) PostInvocation hook badge (already working); (c) optional custom statusLine showing live token/cost badge.
- [ ] [REQ-005] Updated SKILL.md installed to ~/.gemini/skills/usage/SKILL.md with explicit instructions to run `agy-tokens` via run_command and render output; verified discoverable via `agy -p "/skills"`.
- [ ] [REQ-006] hooks.json PostInvocation config remains in ~/.gemini/hooks.json (verified loaded: "loaded 1 named hooks from 1 hooks.json file(s)").
- [ ] [REQ-007] All changes verified by running agy print-mode commands (`agy -p "/skills"`, `agy -p "/tokens"`) and CLI (`agy-tokens --hook`, `agy-tokens --hook --raw`).
- [ ] [REQ-008] Workspace repo files (integrations/, scripts/install.bat, scripts/install.sh, README.md) updated to match the new integration so fresh installs get the same behavior.