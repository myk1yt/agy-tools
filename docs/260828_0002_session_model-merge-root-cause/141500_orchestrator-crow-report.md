# VP Diagnosis Report: Dashboard Model Merging Bug

**Date**: 2026-08-28 23:15 KST
**Mode**: Orchestrator + Crow (VP) — direct root-cause investigation
**Status**: ROOT CAUSE IDENTIFIED + IMMEDIATE REMEDIATION APPLIED + VERIFIED

---

## User Symptom (verbatim)

> "대시보드를 열면, 턴단위로 내가 사용했던 모델들이 분리되어서 일별상세 데이터와 모델별 사용량&비용을 볼 수 있거든? 문제는 잠시 후에 모델이 하나로 합쳐지면서 여러개 모델이 아닌 한개 모델만 쓴 것처럼 보인다."

Dashboard opens → multiple models correctly separated → after a while models merge into one.

---

## Root Cause (proven with live evidence)

**Stale `--serve` background servers running pre-fix code were (a) pushing merged-model SSE payloads to the open dashboard every 5 seconds and (b) overwriting the correct v4 cache with v3 merged data every 5 seconds.**

### The full causal chain

1. **Timeline mismatch**: The turn-level model attribution fix landed in commit `f4ae9da` (2026-08-28 14:26 KST). But THREE `--serve` dashboard servers were still running from BEFORE that commit:
   - PID 36268, started 06:36 KST (pre-v3.3 era)
   - PID 26420 + PID 41100, started 13:25 KST (v3.3 era, both bound 8787→8788→8789 via EADDRINUSE auto-increment)

2. **Node loads code at startup**: A long-running `--serve` process keeps its modules in memory forever. Code updates on disk do NOT affect running processes. All three servers were running pre-`f4ae9da` code with:
   - `log-parser.js` WITHOUT turn-level model attribution (one model per session)
   - `cache-manager.js` with `CACHE_SCHEMA_VERSION = 3`

3. **The old serve.js had a cache-poisoning bug** (verified via `git show 4084983:src/serve.js`):
   ```js
   const syncResult = await syncSessions({ modelName: payloadOpts.modelName }); // NO readOnly!
   ```
   The current code ([src/serve.js:56](src/serve.js#L56)) passes `readOnly: true`, but the stale servers' embedded code did not. So every 5 seconds (SSE_INTERVAL_MS), each stale server:
   - Re-aggregated with single-model-per-session logic → **merged models**
   - **Wrote the merged v3 cache back to disk**, clobbering the correct v4 cache the hook had just written

4. **The race the user experienced**:
   - User opens dashboard → first paint uses the correct embedded payload (8 models) ✓
   - Dashboard's SSE client connects to the stale server (port file pointed at 8789) → within seconds receives a merged payload (4 models) → **models "merge" before the user's eyes**
   - Meanwhile the statusline hook re-writes the correct v4 cache, but the stale server clobbers it again 5s later → the corruption is self-sustaining

### Evidence captured

| Artifact | Observation |
|---|---|
| `dashboard-server.json` | `{port: 8789, pid: 41100, startedAt: 2026-08-28T04:25:57Z, payloadVersion: 3}` |
| Process list | 3 × `node bin/agy-tokens.js --serve --port 8787` (PIDs 36268, 26420, 41100) |
| SSE capture (stale 8789) | **4 models**, payload version 3 |
| Disk `dashboard-data.json` (hook-written) | **8 models** |
| Disk cache | version 3, 0 multi-model sessions (poisoned) — despite current code writing v4 |
| Fresh SSE capture (new 8787 server, v4 code) | **8 models**, identical to disk ✓ |
| `--fresh --html` re-parse | cache → v4, 8 multi-model sessions preserved, dashboard 8 models ✓ |

### Why previous sessions never found it

All prior debugging tested the CODE (unit tests, re-parse stability, payload builders) — all of which were correct. The bug lived in a **process lifetime** problem: stale long-running processes executing old code. No unit test can catch that; only live-artifact inspection (port file + process list + SSE capture) reveals it.

---

## Immediate Remediation (already applied & verified)

1. Killed all 3 stale servers (`taskkill /PID 36268 /PID 26420 /PID 41100 /F`)
2. Deleted stale `dashboard-server.json` (pointed at dead port 8789)
3. `node bin/agy-tokens.js --fresh --html` → cache upgraded to v4, 486 sessions re-parsed, 8 multi-model sessions preserved
4. Started a fresh `--serve` on 8787 with current code
5. **Verified**: SSE now returns 8 distinct models, identical to disk payload

The dashboard is NOW correct and will stay correct as long as the running server is current.

---

## Residual Risks & Recommended Permanent Fixes

The immediate fix resolves today's incident, but the same failure can recur after ANY future code upgrade. Recommended hardening (needs proper implementation via code mode):

| # | Risk | Recommendation | Priority |
|---|---|---|---|
| R1 | Stale servers survive code updates | **Version-gate the SSE payload**: serve.js should compare its own loaded `DASHBOARD_PAYLOAD_VERSION`/`CACHE_SCHEMA_VERSION` against the on-disk cache version at startup (or per push) and **exit itself** when older than disk. Self-terminating stale servers is the only robust fix — the port-file check in `ensureServerRunning` ([src/dashboard-link.js:302-309](src/dashboard-link.js#L302)) only prevents *linking* to stale servers, it does not stop them from *poisoning the cache*. | 🔴 High |
| R2 | Old serve.js writes cache (readOnly missing in old builds) | Already fixed in current code (`readOnly: true`), but R1 is what defends against old builds still running. | Covered by R1 |
| R3 | Multiple servers accumulate (3 found today) | On startup, `--serve` could detect an existing healthy server with same-or-newer version and exit instead of binding a new port. | 🟡 Medium |
| R4 | Orphaned `.tmp` files in dashboard dir (7 found) | Add opportunistic cleanup of `*.tmp` files older than 1 hour during `writeDashboardFiles`. | 🟢 Low |
| R5 | User cannot see why data "went wrong" | Consider logging server start time + code version into `dashboard-server.json` display or the dashboard footer ("server v4 started 23:13"). | 🟢 Low |

### User-facing operational guidance (until R1 is implemented)

After updating the code, restart the dashboard server:
```powershell
# Kill any running dashboard servers, then regenerate + restart
taskkill /F /IM node.exe /FI "WINDOWTITLE eq agy*"   # or find PIDs via dashboard-server.json
node bin\agy-tokens.js --fresh --html
node bin\agy-tokens.js --serve
```
Or simply reboot / kill stray `node.exe` processes after pulling updates.

---

## Verification Performed

- `node probe-reparse-merge.js` — re-parse path preserves models (0 merges; probe ran against poisoned cache so 0 multi-model sessions found — superseded by `--fresh` evidence)
- `node probe-sse-capture.js` — BEFORE: SSE 4 models ≠ disk 8 models (bug reproduced live); AFTER: SSE 8 models == disk 8 models (fix verified)
- Cache file: version 3 → 4, multi-model sessions 0 → 8
- `node bin/agy-tokens.js --fresh --html` — clean run, exit 0

## Affected File List

| File | Change |
|---|---|
| `probe-reparse-merge.js` | NEW — diagnostic probe (re-parse stability) |
| `probe-sse-capture.js` | NEW — diagnostic probe (SSE vs disk comparison) |
| `C:/Users/k1yt/.gemini/token_tracker_cache.json` | Regenerated (v4) by `--fresh --html` |
| `C:/Users/k1yt/.gemini/antigravity-dashboard/*` | Regenerated dashboard artifacts |
| Running processes | 3 stale servers killed; 1 fresh server started on 8787 |

No source files were modified — this was a diagnosis + environment remediation task. Code changes (R1–R5) are recommendations for a follow-up implementation session.