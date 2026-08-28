# Requirement Checklist
## Task: R1 — Dashboard Server Self-Termination on Code Staleness
## Date: 260828
## Session: docs/260828_0002_session_model-merge-root-cause/

Background: proven incident (see 141500_orchestrator-crow-report.md) — stale `--serve`
servers running pre-update code pushed merged-model SSE payloads every 5s and
downgraded the v4 cache to v3. R1 = stale servers must detect their own staleness
and terminate so the hook auto-respawns a fresh server.

- [ ] [REQ-101] serve.js detects at runtime that source code on disk is newer than the code loaded at process start (any src/*.js mtime > process start time) — checked per SSE push AND via an independent watchdog interval (≤60s) so clientless stale servers also exit
- [ ] [REQ-102] Self-termination is graceful: one-line console reason, removePortFileIfPort(boundPort) so the badge never links to the dead port, closeAllConnections (Node ≥18 feature-guarded), server.close → exit(0), 1s hard-exit fallback
- [ ] [REQ-103] Startup guard: if the on-disk cache schema version is NEWER than the in-memory CACHE_SCHEMA_VERSION, the server refuses to start (console reason + exit 0) — proceeding would downgrade/poison the cache written by newer code
- [ ] [REQ-104] Connected dashboards of a self-terminating server stop receiving stale payloads (server exits → SSE drops); existing client fallback (script-tag polling + hook respawn) takes over with no manual action
- [ ] [REQ-105] A clientless stale server self-terminates within ≤60s via the watchdog
- [ ] [REQ-106] After self-termination, the next statusline hook render auto-respawns a fresh server via the existing ensureServerRunning flow (verify only — no changes expected there)
- [ ] [REQ-107] Zero new npm dependencies; full test suite passes; new unit tests cover sourceCodeChangedSinceStart (injectable dir + start time) and readCacheVersionHeader (64-byte head parse, null-tolerant on missing/corrupt file)
- [ ] [REQ-108] Live verification: a running server self-terminates after a source-file mtime touch (content unchanged) and dashboard-server.json is removed; a fresh server then starts cleanly