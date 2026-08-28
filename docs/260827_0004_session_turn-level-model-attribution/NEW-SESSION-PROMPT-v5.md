# NEW SESSION PROMPT — agy-tokens v3.4 hotfix: Turn-level models merge back after live update

## Session Folder
`docs/YYMMDD_NNNN_session_turn-model-merge-hotfix/` (VP creates at P1)

## Repo
`c:/Users/k1yt/OneDrive/Projects/Antigravity-cli` (agy-tools, zero-dependency Node.js, Node ≥16, npm-linked globally)

## Current State (read these first, in order)
1. `docs/260827_0004_session_turn-level-model-attribution/requirement-checklist.md` — v3.4 baseline (REQ-301..309 all PASS)
2. `docs/260827_0004_session_turn-level-model-attribution/143100_debug-report.md` — P5 technical review (PASS, 129 tests)
3. `docs/260827_0004_session_turn-level-model-attribution/143600_ask-report.md` — P6 audit (PASS)
4. Git log: `c0fb877` (docs) ← `f4ae9da` (v3.4 turn-level attribution) ← `8ce6618` (chart hover + estimate trim) ← `2c2ffee` (blank-screen fix) ← `0d7b1a8` ← `c9732c4` ← `1a1cd17` (v3.3). All on `main`.
5. Test baseline: **129 passed, 0 failed, 18 suites** (`node test/run-tests.js`)

## Current Architecture Snapshot (verified 260828)
- [`src/log-parser.js`](src/log-parser.js): `currentActiveModel` state machine tracks model per turn; `turn.modelName` stamped; per-turn `calculateCostUsd(..., currentActiveModel)`; `session.modelName` = last active; `session.models` = ordered-unique array. Cache schema = 4.
- [`src/html-report.js`](src/html-report.js): `buildDashboardPayload` aggregates by `turn.modelName` (fallback: `turn.modelName → session.modelName → opts.modelName → 'unknown'`); `modelsSeenInSession` Set for session counting; `DASHBOARD_PAYLOAD_VERSION = 3`.
- [`src/serve.js`](src/serve.js): SSE server routes `/`, `/events`, `/data.json`, `/dashboard-data.js`; SSE pushes `aggregate()` result every 5s.
- [`src/cache-manager.js`](src/cache-manager.js): `CACHE_SCHEMA_VERSION = 4`; `syncSessions` loads cache → re-parses stale → saves.

## Bug Description (user report, verbatim)
"처음에 대시보드를 열면 이번 수정한것처럼 턴별 모델들이 제대로 분리되어 표시되는데, 시간이 조금 지나면 다시 합쳐져서 모델 하나만 남아."

**Symptom**: Dashboard initially shows turn-level model separation correctly (e.g. "Gemini 3.7 Flash (High)" and "Claude Opus 4.6 (Thinking)" as separate rows). After some time (likely after the next SSE push or poll cycle), the models merge back into a single model row.

## Root Cause Hypothesis (VP Phase 0 analysis — VERIFY, do not trust)
The most likely cause is in the **SSE server's `aggregate()` function** or the **hook's `--write-dashboard` path**:

1. **SSE path**: `serve.js` `/events` handler calls `aggregate()` which calls `syncSessions()` → `buildDashboardPayload()`. If `syncSessions` returns sessions from cache (schema 4, with turn.modelName), the aggregation should work. BUT: check if `aggregate()` passes the correct `modelName` option — if it passes the CURRENT settings model (e.g. "Gemini 3.7 Flash (High)") as `opts.modelName`, and the fallback chain in `buildDashboardPayload` uses `opts.modelName` when `turn.modelName` is missing (old cached sessions without turn-level data), ALL turns would resolve to the same model.

2. **Hook path**: `index.js` hook branch calls `syncSessions` then `buildDashboardPayload` with `model: activeModel`. Same fallback issue.

3. **Cache staleness**: If `syncSessions` returns sessions from a schema-3 cache (before the bump to 4), those sessions won't have `turn.modelName`. The fallback chain would use `session.modelName` (which is the LAST model for the whole session) → all turns collapse to one model. The schema bump should force re-parse, but check if the re-parse actually populates `turn.modelName` correctly for ALL sessions.

4. **Polling path**: `pollOnce` loads `dashboard-data.js` which is written by `writeDashboardFiles`. If the data files are written with turn-level data but the SSE server pushes a payload WITHOUT turn-level data (different code path), the SSE update would overwrite the good data.

## Hard Constraints (unchanged)
- Zero new npm dependencies (Node core only).
- All writes atomic (tmp+rename); statusline script work <20ms after node startup.
- `--serve` binds 127.0.0.1 only; `file://` pages use script-tag polling only.
- 8.3 short paths, no quotes, in settings.json statusLine command.
- 🚫 Do NOT touch `C:\Users\k1yt\AppData\Local\agy\**` or agy binary/config beyond the statusLine value.
- i18n: any new key must be added to ALL 21 locales (suite 3 enforces parity).
- Client must keep stale-payload tolerance (`isFreshPayload`, version ≥ 3).

## Verification Gates
1. `node test/run-tests.js` → all suites green (129+ tests).
2. `node bin/agy-tokens.js --hook --raw --write-dashboard` → `dashboard-data.json` has turn-level model separation (multiple models per session if transcripts have settings-changes).
3. Start SSE server (`node bin/agy-tokens.js --serve --port 8799`), wait 10+ seconds, check `GET /data.json` multiple times → models stay separated (don't merge).
4. Open dashboard → models separated initially → wait 15+ seconds → models STILL separated (don't merge).
5. `file://` mode: open dashboard.html → models separated → poll updates keep them separated.
6. RTL (`AGY_LANG=ar`) intact; all 21 locales parity green.

## Report
Write report to: `docs/YYMMDD_NNNN_session_turn-model-merge-hotfix/HHMMSS_code-report.md`
Required sections: Task Summary / Root Cause Analysis / Actions Taken / Result (+evidence) / Issues Discovered / Next Step Recommendations / Affected File List.

Upon task completion, return using `attempt_completion` instead of `switch_mode`.

Report Folder: docs/YYMMDD_NNNN_session_turn-model-merge-hotfix/
