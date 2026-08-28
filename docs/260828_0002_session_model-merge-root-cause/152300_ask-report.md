# Ask Task Report — P6 Final Audit: R1 Dashboard Server Self-Termination

**Date**: 2026-08-29 00:23 KST
**Mode**: Ask (CPO — Full Audit)
**Session Folder**: `docs/260828_0002_session_model-merge-root-cause/`
**Audit Scope**: REQ-101..108 vs actual code + test evidence
**Inputs**: `requirement-checklist.md`, `234900_architect-report.md`, `000500_code-report.md`, `001440_debug-report.md`, `151836_code-light-report.md`, actual code files

---

## [1. Philosophy & UX/UI Diagnostics]

**Intent alignment**: The user asked "R1 서버 자가 종료 기능 구현해줘" — a server self-termination feature. The delivered implementation is exactly that: a Node.js `--serve` process that (a) detects its own code staleness via mtime comparison, (b) gracefully self-terminates with port-file cleanup, and (c) refuses to start when the on-disk cache schema is newer than the running build. No scope creep (no new CLI flags, no client changes, no new dependencies). No missing pieces (all 8 REQs addressed).

**UX impact**: The feature is invisible to the user in normal operation — it only activates when code on disk changes. The single console line `[agy-dashboard] self-terminating: ...` is greppable and informative. The hook auto-respawn flow (`ensureServerRunning`) takes over seamlessly, so the dashboard badge never links to a dead port. This is the correct UX for a background lifecycle feature: silent when healthy, informative when acting.

**Root cause closure**: The proven incident (stale server pushing merged-model SSE + v4→v3 cache downgrade every 5s) is permanently closed. The per-push staleness check at [`src/serve.js:166`](../../src/serve.js:166) runs **before** `aggregate()`, so a stale server dies **before** it can emit one more poisoned payload. The 30s watchdog at [`src/serve.js:242-253`](../../src/serve.js:242) covers clientless servers. The startup guard at [`src/serve.js:54-66`](../../src/serve.js:54) prevents a stale server from booting against a newer cache. All three poisoning vectors are closed.

---

## [2. 1:1 Cross-Validation Results]

### Per-REQ Verdict Table

| REQ | Requirement | Verdict | Evidence (file:line) |
|-----|-------------|---------|----------------------|
| **REQ-101** | Runtime staleness detection (any `src/*.js` mtime > start) checked per SSE push AND independent watchdog ≤60s | ✅ | Per-push check: [`src/serve.js:166`](../../src/serve.js:166) before `aggregate()` at L174. Watchdog: [`src/serve.js:242-253`](../../src/serve.js:242) 30s `unref`'d interval. Start time: [`src/serve-staleness.js:27`](../../src/serve-staleness.js:27) `MODULE_LOAD_TIME_MS` captured at module load. Margin: [`src/serve-staleness.js:38-40`](../../src/serve-staleness.js:38) `getProcessStartTimeMs()` returns `MODULE_LOAD_TIME_MS - MTIME_SAFETY_MARGIN_MS` (2000ms). Suite 23 tests 1-5, 9, 10. |
| **REQ-102** | Graceful self-term: console reason, `removePortFileIfPort(boundPort)`, `closeAllConnections` (Node ≥18 guarded), `server.close` → `exit(0)`, 1s hard fallback | ✅ | `selfTerminate` at [`src/serve.js:77-97`](../../src/serve.js:77): idempotent via `terminated` flag (L68,78-79), console log (L80), `removePortFileIfPort` (L82), 1s `unref`'d hard-exit timer (L92-93), `stopDashboardServer` → `exit(0)` (L94-96). `closeAllConnections` feature-guarded at [`src/serve.js:280-282`](../../src/serve.js:280). Suite 23 test 9 (spy + port closed). |
| **REQ-103** | Startup guard: on-disk cache schema NEWER than in-memory → refuse to start (reason + exit 0) before binding port | ✅ | Guard at [`src/serve.js:54-66`](../../src/serve.js:54) runs before `tryListen` (L266). 64-byte head read at [`src/serve-staleness.js:93-116`](../../src/serve-staleness.js:93). Test hook `opts.cacheFile` honored (L50). Suite 23 test 8 (version 99 → spy + null return; valid version → normal start). |
| **REQ-104** | Connected dashboards of a self-terminating server stop receiving stale payloads; existing fallback takes over | ✅ | Server exit drops SSE. Per-push check runs **before** `aggregate()` (L166 → L174), so no post-change payload is emitted. Client fallback (script-tag polling + hook respawn) untouched in `dashboard-link.js`. Live verification: `scripts/verify-r1-live.js` confirmed port file removed + server exit. |
| **REQ-105** | Clientless stale server self-terminates ≤60s via watchdog | ✅ | 30s watchdog independent of SSE clients: [`src/serve.js:242-253`](../../src/serve.js:242). `unref()`'d (L254), cleared on `server 'close'` (L255). Live: clientless exit in 30.1s and 27.0s (both ≤60s, from debug report §2.2). Suite 23 test 10 asserts `STALENESS_WATCHDOG_MS ≤ 60000`. |
| **REQ-106** | After self-termination, next hook render auto-respawns fresh server via existing `ensureServerRunning` (verify-only) | ✅ | `dashboard-link.js` untouched — `ensureServerRunning` at [`src/dashboard-link.js:294`](../../src/dashboard-link.js:294) and `removePortFileIfPort` at [`src/dashboard-link.js:235`](../../src/dashboard-link.js:235) intact. Port file removed by `selfTerminate` enables fresh spawn intent. Debug report §5 verified live: after 8790 died, `ensureServerRunning()` linked/spawned correctly. |
| **REQ-107** | Zero new npm deps; full suite passes; unit tests cover both helpers (injectable dir+start; 64B head null-tolerant) | ✅ | `package.json` has **no `dependencies` block** (confirmed L1-46). `serve-staleness.js` uses only Node core `fs`/`path`. Full suite: **165 passed, 0 failed, 165 total** (user-executed, 1286ms). Suite 23 = 10 tests covering `sourceCodeChangedSinceStart` (tests 1-5, 9) and `readCacheVersionHeader` (tests 6-8) with injected `srcDir`/`startTimeMs`/`cacheFile`. |
| **REQ-108** | Live: running server self-terminates after mtime touch (content unchanged), `dashboard-server.json` removed, fresh server starts cleanly | ✅ | `scripts/verify-r1-live.js` PASSED: spawned 8790, port file written, touched `serve-staleness.js` to +5s, exit 0 in 30.1s, port record `null` after. Debug report §2.2 independent sim: fresh server stays up (no false positive), dies in 27.0s after mid-life touch, port closed. |

**All 8 requirements PASS with direct code evidence.**

### Plan vs Code Discrepancies

| Design Spec (Architect) | Actual Code | Verdict |
|------------------------|-------------|---------|
| `selfTerminate._started` idempotency flag | `terminated` closure variable | ✅ Equivalent, cleaner |
| `startTime - MTIME_SAFETY_MARGIN_MS` subtraction | `getProcessStartTimeMs()` returns `MODULE_LOAD_TIME_MS - MTIME_SAFETY_MARGIN_MS` | ✅ Fixed by D1 (151836_code-light-report.md) |
| `opts.onSelfTerminate` test hook | Implemented at [`src/serve.js:52,59-61,84-88`](../../src/serve.js:52) | ✅ Matches spec |
| `opts.srcDir` test hook | Implemented at [`src/serve.js:51`](../../src/serve.js:51) | ✅ Matches spec |
| `opts.cacheFile` test hook | Implemented at [`src/serve.js:50`](../../src/serve.js:50) | ✅ Matches spec |
| `STALENESS_WATCHDOG_MS = 30000` | [`src/serve.js:28`](../../src/serve.js:28) | ✅ Matches spec |
| Export `STALENESS_WATCHDOG_MS` | [`src/serve.js:289`](../../src/serve.js:289) | ✅ Matches spec |
| `boundPortRef` closure | [`src/serve.js:129,239`](../../src/serve.js:129) | ✅ Matches spec |
| Watchdog `unref()` + clear on close | [`src/serve.js:254-255`](../../src/serve.js:254) | ✅ Matches spec |
| 1s hard-exit fallback | [`src/serve.js:92-93`](../../src/serve.js:92) | ✅ Matches spec |
| `removePortFileIfPort` conditional | [`src/serve.js:81-83`](../../src/serve.js:81) | ✅ Matches spec |
| `[agy-dashboard]` console prefix | [`src/serve.js:58,80`](../../src/serve.js:58) | ✅ Matches spec |

**Zero discrepancies.** Every design element is present in the code.

### Devil's Advocate Probe

| Concern | Assessment |
|---------|-----------|
| Watchdog keeps process alive? | No — `unref()`'d at L254. Test process exits cleanly. |
| `server.close()` hangs on Node 16? | 1s hard-exit fallback at L92-93 covers it. |
| Concurrent triggers (SSE + watchdog + signal)? | `terminated` flag at L68 ensures idempotency. `removePortFileIfPort` is conditional. |
| Cache file scanned by staleness? | No — `CACHE_FILE` is outside `src/` dir; filter is `.js` only. |
| OneDrive content-identical re-sync? | Server exits + hook respawns with identical code — harmless churn, accepted trade-off (architect §2.2). |
| Tests touch real `src/` mtimes? | No — Suite 23 uses `fs.mkdtempSync` temp dirs + `opts.srcDir` injection. |
| Guard exits before port file write? | Correct — `process.exit(0)` before `tryListen`, no port bound, no port file written. |
| `readCacheVersionHeader` falsy bug on `"version": 0`? | No — `match[1]` guard returns `parseInt("0", 10)` = `0`, which is `!== null` and `> CACHE_SCHEMA_VERSION` is false. Debug report §2.3 confirmed. |

---

## [3. Inquiries for VP & User]

**None blocking.** All design trade-offs were pre-approved in the architect report and validated in the debug report:

1. **30s watchdog interval** — within REQ-101 ≤60s bound, halves the poisoning window. No change needed.
2. **2s mtime safety margin** — D1 fix applied, margin now subtracted at the source. No change needed.
3. **exit(0) semantics** — intentional healthy lifecycle, not a crash. No change needed.
4. **OneDrive re-sync churn** — harmless respawn, accepted trade-off. No change needed.

---

## [4. Final Verdict]

**PASS ✅**

**Reasons:**

1. **All 8 requirements (REQ-101..108) verified PASS** with direct file:line code evidence. No ❌ or 🔶 marks.
2. **Root cause permanently closed**: the three poisoning vectors (SSE push, clientless watchdog, startup schema mismatch) are all guarded. The per-push check runs before `aggregate()`, so a stale server cannot emit one more poisoned payload.
3. **Zero scope creep**: no new CLI flags, no client changes, no new dependencies (`package.json` has no `dependencies` block). The delivered feature is exactly "R1 서버 자가 종료 기능" as requested.
4. **Regression clean**: `dashboard-link.js` untouched (`ensureServerRunning` and `removePortFileIfPort` intact). Statusline hook path untouched. Original model-merge bug scenario closed (per-push ordering guarantee + 30s watchdog + startup guard).
5. **Test evidence independently verified**: user executed `node test/run-tests.js` → **165 passed, 0 failed, 165 total** (1286ms). Suite 23 has 10 tests covering both helpers with injectable parameters. D1 fix (margin subtraction) confirmed in production path at [`src/serve-staleness.js:38-40`](../../src/serve-staleness.js:38).
6. **Live verification confirmed**: `scripts/verify-r1-live.js` PASSED (exit 0 in 30.1s, port file removed). Debug report's independent incident sim PASSED (fresh server no false positive, dies in 27.0s after mid-life touch).
7. **Traceability**: all console messages prefixed `[agy-dashboard]` (greppable, consistent with existing logging style).

**Recommendation to VP**: Proceed to P7 (final review + git commit). The R1 commit should include only: `src/serve-staleness.js` (new), `src/serve.js`, `test/run-tests.js` (Suite 23), `src/index.js` (comment), `scripts/verify-r1-live.js` (new). Bisect from other session changes per commit conventions.

---

## Affected File List

| File | Change Type | R1 Role |
|------|-------------|---------|
| [`src/serve-staleness.js`](../../src/serve-staleness.js:1) | NEW | Pure staleness detection + version header helpers |
| [`src/serve.js`](../../src/serve.js:1) | MODIFIED | Startup guard, self-termination, 30s watchdog, per-push check, test hooks |
| [`test/run-tests.js`](../../test/run-tests.js:2910) | MODIFIED | Suite 23 (10 tests) |
| [`src/index.js`](../../src/index.js:337) | MODIFIED | Comment-only (self-termination documentation) |
| [`scripts/verify-r1-live.js`](../../scripts/verify-r1-live.js:1) | NEW | REQ-108 live verification script |

**No changes to**: `src/dashboard-link.js`, `src/cache-manager.js`, `src/config.js`, `package.json` (no dependencies block), `bin/*` (constraint compliance confirmed).
