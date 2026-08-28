# Debug Task Report — P5 Technical Review: R1 Dashboard Server Self-Termination

**Date**: 2026-08-29 00:14 KST
**Mode**: Debug (P5 adversarial technical review)
**Session Folder**: `docs/260828_0002_session_model-merge-root-cause/`
**Subject**: R1 "Dashboard Server Self-Termination on Code Staleness" implementation
**Inputs reviewed**: `234900_architect-report.md`, `000500_code-report.md`, `requirement-checklist.md` (REQ-101..108), `141500_orchestrator-crow-report.md`
**Overall Verdict**: **PASS** — implementation is correct, complete, and closes the original model-merge incident chain. No blocking defects. One cosmetic test-gap and one accepted design trade-off noted (non-blocking).

---

## 1. Verdict Per Requirement

| REQ | Requirement | Verdict | Evidence |
|---|---|---|---|
| **REQ-101** | Runtime staleness detection (any `src/*.js` mtime > start) checked per SSE push AND independent watchdog ≤60s | ✅ **PASS** | [`src/serve.js:166`](../../src/serve.js:166) per-push check before `aggregate()`; [`src/serve.js:242-253`](../../src/serve.js:242) 30s `unref`'d watchdog. Live: clientless watchdog exit in **30.1s** and **27.0s** (both ≤60s). Start time uses `MODULE_LOAD_TIME_MS` ([`src/serve-staleness.js:27`](../../src/serve-staleness.js:27)); the 2s margin is applied by callers passing `getProcessStartTimeMs()` and tests inject `startTimeMs` directly — see §4 note. |
| **REQ-102** | Graceful self-term: console reason, `removePortFileIfPort(boundPort)`, `closeAllConnections` (Node ≥18 guarded), `server.close` → `exit(0)`, 1s hard fallback | ✅ **PASS** | [`selfTerminate`](../../src/serve.js:77) idempotent via `terminated` flag ([`serve.js:68,78-79`](../../src/serve.js:68)); port-file guard conditional ([`dashboard-link.js:235-240`](../../src/dashboard-link.js:235) removes only when `record.port === port`); `closeAllConnections` feature-guarded in [`stopDashboardServer:280-282`](../../src/serve.js:280); 1s `unref`'d hard-exit timer ([`serve.js:92-93`](../../src/serve.js:92)); exit 0 on both resolve and reject ([`serve.js:94-96`](../../src/serve.js:94)). |
| **REQ-103** | Startup guard: on-disk cache schema NEWER than in-memory → refuse to start (reason + exit 0) before binding port | ✅ **PASS** | Guard at [`serve.js:54-66`](../../src/serve.js:54) runs before `tryListen` (no port bound, no port file written). 64-byte head read [`serve-staleness.js:89-112`](../../src/serve-staleness.js:89). Edge cases probed live: missing→null, corrupt→null, string version→null, mid-key 64B cut→null, BOM→parsed, empty→null, `"version":0`→0 (no falsy bug). All fail-open (server starts) except genuine newer-numeric-version. |
| **REQ-104** | Connected dashboards of a self-terminating server stop receiving stale payloads; existing fallback takes over | ✅ **PASS** | Server exit drops SSE; per-push check runs *before* `aggregate()` so no post-change payload is emitted. Client fallback (script-tag polling + hook respawn) untouched — verified unchanged in `dashboard-link.js`. |
| **REQ-105** | Clientless stale server self-terminates ≤60s via watchdog | ✅ **PASS** | 30s watchdog independent of SSE clients (`setInterval` in `listen` callback). Live clientless exit: 30.1s and 27.0s. |
| **REQ-106** | After self-termination, next hook render auto-respawns a fresh server via existing `ensureServerRunning` (verify-only) | ✅ **PASS** | `dashboard-link.js` untouched. Live: after 8790 died and port file removed, `ensureServerRunning()` linked/spawned correctly; spawn-intent → probe flow intact (see §5). |
| **REQ-107** | Zero new npm deps; full suite passes; unit tests cover both helpers (injectable dir+start; 64B head null-tolerant) | ✅ **PASS** | `package.json` **absent from `git status` modified list** (zero dep changes; still no `dependencies` block). Helpers use Node core `fs`/`path` only. Full suite: **165 passed, 0 failed**. Suite 23 = 10 tests covering both helpers with injected `srcDir`/`startTimeMs`/`cacheFile`. |
| **REQ-108** | Live: running server self-terminates after mtime touch (content unchanged), `dashboard-server.json` removed, fresh server starts cleanly | ✅ **PASS** | `scripts/verify-r1-live.js` PASSED: exit 0 in 30.1s, reason logged, port file `null` after. Independent P5 incident sim PASSED: fresh server stays up (no false positive), dies in 27.0s after mid-life touch, port closed. |

**All 8 requirements PASS.**

---

## 2. Test Evidence

### 2.1 Full unit/integration suite (self-executed)
```
Command: node test/run-tests.js
Result:  165 passed, 0 failed, 165 total   (Duration ~2.9s)
```
Suite 23 (10 new tests) all green, including the two console-logging integration tests:
- `startup guard refuses to start ... v99 newer than v4` → spy invoked, returns `null`, no port bound
- `self-termination triggers on code update during SSE push` → reason contains filename, port probe fails after

### 2.2 Live verification (self-executed)
- **`node scripts/verify-r1-live.js`** → `=== R1 Live Self-Termination Verification PASSED ===`
  - spawned 8790, port file `{port:8790,...payloadVersion:3}` written, touched `serve-staleness.js` to +5s, **exit code 0 in 30.1s**, port record `null` after.
- **Independent P5 incident sim** (`verify-p5-incident.js`, temp, since removed): spawned fresh server on 8791 → confirmed **NO false-positive** after 3s (the already-past earlier touch did not kill it) → touched `config.js` to +5s mid-life → **exit 0 in 27.0s**, reason logged, port closed. `config.js` mtime restored (content never modified).

### 2.3 Adversarial edge-case probe (temp script, since removed)
`readCacheVersionHeader` results:
| Fixture | Result | Expected | OK |
|---|---|---|---|
| BOM (`EF BB BF` + `{"version":5`) | `5` | 5 | ✅ |
| `"version": "5"` (string) | `null` | null (fail-open) | ✅ |
| `"version"` key cut at 64B boundary (starts byte 61) | `null` | null (fail-open) | ✅ |
| deep-indented version beyond 64B | `null` | null (fail-open) | ✅ |
| `"version": 4.5` (float) | `4` | 4 (regex `\d+` truncation) | ✅ acceptable |
| empty file | `null` | null | ✅ |
| `"version": 0` | `0` | 0 | ✅ (confirms `match[1]` guard has no falsy bug) |

---

## 3. Regression Check (original model-merge bug)

**The original bug does NOT reproduce and the fix does not regress it.**

- The pre-R1 server still running on **8787** (Terminal 1, started before R1 landed, no watchdog) was probed live with `node probe-sse-capture.js`:
  ```
  SSE models: 8 distinct | Disk models: 8 distinct | SSE == Disk? YES
  ```
  It serves **correct v4/8-model data**, not merged data — because it was started *after* the turn-level fix (`readOnly:true`) per the remediation in `141500_orchestrator-crow-report.md`. The merged-model poisoning came from *older* servers running pre-fix code; those were already killed.
- **Why R1 matters (verified)**: a stale server only poisons when its in-memory code is older than disk. R1 guarantees any server kills itself within 30s of a code change, so a pre-fix-era server can never survive long enough to push merged payloads. The incident sim proved a fresh server dies on mid-life change.
- **Per-push ordering guarantee**: the staleness check at [`serve.js:166`](../../src/serve.js:166) runs **before** `aggregate()` ([`serve.js:174`](../../src/serve.js:174)), so a stale server dies *before* it can emit one more merged/old-schema payload. This is the exact ordering REQ-101 demands and it directly defends the cache-poison path.

### Per-push latency (regression risk quantified)
- `sourceCodeChangedSinceStart` over the real `src/` (15 `.js` files): **~0.6 ms/call** (avg over 1000 calls, warm), ~0.67ms single call.
- Per 5s SSE push that is **0.012%** of the interval — negligible. No measurable SSE latency regression.
- Watchdog: one 0.6ms scan per 30s — negligible.

---

## 4. False-Positive Risk Assessment (Windows / OneDrive)

| Risk | Finding | Severity |
|---|---|---|
| Cache file scanned by staleness check? | **No.** `CACHE_FILE = ~/.gemini/token_tracker_cache.json` is outside the scan dir (`serve.js` `__dirname` = `src/`); and the filter is `endsWith('.js')` only. Cache writes (constant mtime churn) cannot trigger self-termination. | 🟢 None |
| Atomic rename during cache write | Irrelevant to the src scan (different dir). For the cache head read, `saveCache` uses tmp+rename; a 64B read sees old-or-new complete header — both parse. | 🟢 None |
| Non-`.js` files in `src/` | None exist today (verified `readdir`); filter excludes any future `.json`/`.tmp`. | 🟢 None |
| OneDrive content-identical re-sync bumps `src/*.js` mtime | Server exits + hook respawns with identical code → harmless churn, SSE reconnects. Accepted trade-off, documented in architect §2.2. | 🟡 Accepted |
| 2s safety margin (`MTIME_SAFETY_MARGIN_MS`) | Test 3 confirms mtime within margin before start → `{stale:false}`. **Note**: the margin constant is exported and asserted `>= 1000`, but the *production comparison* in `sourceCodeChangedSinceStart` compares `mtimeMs > startTimeMs` directly; the margin is applied by callers passing an already-margined baseline. In `serve.js` the baseline is `getProcessStartTimeMs()` = `MODULE_LOAD_TIME_MS` with **no `-2000` subtraction at the call site**. The architect spec (§1.2) described `startTime - MTIME_SAFETY_MARGIN_MS`. **In practice the constant is never subtracted in the production path** — `getProcessStartTimeMs()` returns the raw module-load time. See Defect D1. | 🟡 Minor |

---

## 5. Defects Found

### D1 — 🟡 MINOR (non-blocking): `MTIME_SAFETY_MARGIN_MS` is not applied in the production staleness comparison
- **File/line**: [`src/serve-staleness.js:34-36`](../../src/serve-staleness.js:34) (`getProcessStartTimeMs` returns raw `MODULE_LOAD_TIME_MS`); call sites [`src/serve.js:166`](../../src/serve.js:166) and [`src/serve.js:247`](../../src/serve.js:247) pass it unmodified.
- **Root cause**: The architect design (§1.2) specified the comparison baseline as `startTime - MTIME_SAFETY_MARGIN_MS` to immunize against coarse/OneDrive-shifted mtimes within 2s of spawn. The implementation defines and exports the 2000ms constant (and Suite 23 test 10 asserts `>= 1000`, and test 3 manually passes a margined `startTimeMs`), but **no production caller ever subtracts it**. Result: a `.js` file written 0–2s *before* process spawn with a slightly-future/coarse mtime could read as `mtimeMs > startTimeMs` → a single spurious self-termination immediately after boot (the server would then be respawned by the hook with identical code — self-healing, one harmless respawn).
- **Impact**: Low. Realistic update scenario is "code pulled minutes-to-hours after server start", far outside the 2s window. Worst case is one harmless respawn loop iteration at boot, not a crash or stale-serve. The startup-guard (REQ-103) and all other paths are unaffected.
- **Suggested fix** (for VP to re-delegate, NOT applied per constraints): subtract the margin at the source, e.g. `const MODULE_LOAD_TIME_MS = Date.now() - MTIME_SAFETY_MARGIN_MS;` (or have `getProcessStartTimeMs()` return `MODULE_LOAD_TIME_MS - MTIME_SAFETY_MARGIN_MS`). One-line change; existing tests still pass (test 3 injects its own baseline).
- **Severity**: 🟡 Minor / cosmetic-robustness. Does not block PASS.

### D2 — 🟢 INFORMATIONAL (not a defect): 8787 has no port-file record
- Observed: live 8787 server (pre-R1) is reachable but `dashboard-server.json` is `null`. Traced to [`dashboard-link.js:330`](../../src/dashboard-link.js:330) path #3: "running server without a port file → probe default port → link". This is **existing, intended** behavior, not introduced by R1. When 8787 eventually dies, the next hook render takes path #4 and spawns fresh. No action needed.

---

## 6. Correctness Deep-Dive Notes (verified against code, not the report)

- **Idempotency race (SSE check + watchdog + signal)**: single `terminated` closure flag guards all paths; `removePortFileIfPort` is conditional and unlink-tolerant; `stopDashboardServer` tolerates the close callback. `selfTerminate._started` from the design was implemented as the closure `terminated` — equivalent and cleaner. ✅
- **Unhandled rejection**: `stopDashboardServer(server)` never rejects (its executor has no `reject` and wraps `closeAllConnections` in try/catch), and both `.then`/`.catch` branches exit 0. No unhandled-rejection path. ✅
- **`boundPortRef` closure**: declared `let boundPortRef = null` in `tryListen` scope ([`serve.js:129`](../../src/serve.js:129)), set in the `listen` callback ([`serve.js:239`](../../src/serve.js:239)) before any request can arrive (requests can't precede `listening`), referenced from `push()` ([`serve.js:168`](../../src/serve.js:168)). Always set when `push` runs. ✅
- **Watchdog lifecycle**: `unref()`'d ([`serve.js:254`](../../src/serve.js:254)) so it never extends process lifetime; cleared on `server 'close'` ([`serve.js:255`](../../src/serve.js:255)) and on `terminated`. Test process exits cleanly. ✅
- **Test safety**: Suite 23 uses `fs.mkdtempSync` temp dirs and the `opts.srcDir`/`opts.cacheFile`/`opts.onSelfTerminate` injection hooks — it never touches real `src/*.js` mtimes or the real 18MB cache, and `onSelfTerminate` replaces `process.exit` in unit tests. ✅
- **Node ≥16 compat**: only `readdirSync`/`statSync`/`openSync`/`readSync`/`closeSync`/`setInterval`/`setTimeout` — all ≤Node12. `closeAllConnections` guarded for Node 16/17. ✅

---

## 7. Next Step Recommendations

1. **VP**: proceed to **P6 Final Ask Audit** — all REQ-101..108 verified PASS with live + unit evidence. This report satisfies the P5 quality gate.
2. **Optional hardening (P7 backlog, not blocking)**: apply the D1 one-line fix (subtract `MTIME_SAFETY_MARGIN_MS` at the baseline source) in a future pass to fully honor the architect's 2s-margin intent. Low priority.
3. **P7 commit**: VP may commit. Recommend including `src/serve-staleness.js`, `src/serve.js`, `test/run-tests.js`, `src/index.js` (comment), `scripts/verify-r1-live.js`. Note `git status` shows many other unrelated modified files from prior sessions — VP should bisect the R1 commit to only R1 files per commit conventions.
4. **Operational**: the pre-R1 server on 8787 (no watchdog) will never self-terminate. It currently serves correct v4 data, so no urgency — but after commit, a one-time manual restart (`taskkill` the old PID, next hook render respawns) brings it under R1 supervision.

---

## 8. Affected File List

| File | Role in R1 | Review outcome |
|---|---|---|
| [`src/serve-staleness.js`](../../src/serve-staleness.js:1) | NEW — pure helpers | Correct; D1 margin note |
| [`src/serve.js`](../../src/serve.js:1) | MODIFIED — guard, watchdog, per-push check, `selfTerminate`, test hooks | Correct |
| [`test/run-tests.js`](../../test/run-tests.js:2910) | MODIFIED — Suite 23 (10 tests) | Correct; tests isolated via injection |
| [`src/index.js`](../../src/index.js:337) | MODIFIED — comment only | Correct |
| [`scripts/verify-r1-live.js`](../../scripts/verify-r1-live.js:1) | NEW — REQ-108 live verification | Correct; PASSED live |

No changes to `src/dashboard-link.js`, `src/cache-manager.js`, `src/config.js`, `package.json`, `bin/*` (constraint compliance confirmed — `package.json` untouched).

**Review artifacts created and cleaned up during P5**: `scripts/verify-p5-probe.js`, `scripts/verify-p5-incident.js` (both temporary; sent to Recycle Bin after use). No application code was modified by this review.
