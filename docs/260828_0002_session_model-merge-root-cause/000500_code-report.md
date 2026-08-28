# Code Task Report — R1: Dashboard Server Self-Termination on Code Staleness

**Date**: 2026-08-29 00:05 KST  
**Mode**: Code  
**Session Folder**: `docs/260828_0002_session_model-merge-root-cause/`  
**Reference Design**: `234900_architect-report.md`  
**Requirements**: REQ-101..108 in `requirement-checklist.md`  
**Status**: COMPLETE — 165/165 tests passing, live self-termination verified

---

## 1. Task Summary

Implemented R1 "Dashboard Server Self-Termination on Code Staleness" for `agy-tools` (zero-dependency Node.js, Node >= 16) according to the approved architecture. Stale background `--serve` instances now autonomously detect disk changes to `src/*.js` and gracefully exit (clearing the port file so the statusline hook can respawn a fresh server), while a startup guard refuses to boot if the on-disk cache schema is newer than the in-memory version.

---

## 2. Actions Taken (Sub-tasks R1-1 .. R1-4)

### R1-1: Pure Staleness & Header Helpers (`src/serve-staleness.js` - NEW)
- Created [`src/serve-staleness.js`](src/serve-staleness.js:1) with zero dependencies (Node core `fs` and `path` only).
- Implemented `getProcessStartTimeMs()` returning the module evaluation timestamp (`MODULE_LOAD_TIME_MS`).
- Implemented `sourceCodeChangedSinceStart(srcDir, startTimeMs)` to scan `src/*.js` for `mtimeMs > startTimeMs` with fail-open behavior on filesystem errors.
- Implemented `readCacheVersionHeader(cacheFilePath)` using a 64-byte `readSync` head read with regex `/"version"\s*:\s*(\d+)/`, returning `null` on missing, unreadable, or non-schema files.
- Exported `{ MTIME_SAFETY_MARGIN_MS, getProcessStartTimeMs, sourceCodeChangedSinceStart, readCacheVersionHeader }`.

### R1-2: Server Self-Termination & Guards (`src/serve.js` - MODIFIED)
- Added `STALENESS_WATCHDOG_MS = 30000` constant and imported `serve-staleness`, `CACHE_SCHEMA_VERSION`, `CACHE_FILE`, and `removePortFileIfPort`.
- Added startup schema guard in [`startDashboardServer()`](src/serve.js:44): compares `readCacheVersionHeader(opts.cacheFile || CACHE_FILE)` against `CACHE_SCHEMA_VERSION`, printing reason and exiting code 0 before port binding (or calling `opts.onSelfTerminate` test hook).
- Implemented idempotent `selfTerminate(server, boundPort, reason)`: logs reason, invokes `removePortFileIfPort`, initiates `stopDashboardServer` with a 1s unref'd fallback exit timer, or delegates to `opts.onSelfTerminate`.
- Wired staleness check into the `/events` `push()` closure before `aggregate()` call.
- Wired 30s `unref()`'d watchdog interval in `server.listen()` callback to detect staleness on clientless servers.
- Added test hooks: `opts.cacheFile`, `opts.srcDir`, `opts.onSelfTerminate`.
- Exported `STALENESS_WATCHDOG_MS`.

### R1-3: Comprehensive Test Suite (`test/run-tests.js` - MODIFIED)
- Added **Suite 23: Serve Staleness Self-Termination (R1)** with 10 unit and integration test cases:
  1. `sourceCodeChangedSinceStart` with older files -> `{stale: false}`
  2. `sourceCodeChangedSinceStart` with touched file -> `{stale: true, file: 'beta.js'}`
  3. `sourceCodeChangedSinceStart` within safety margin before start -> `{stale: false}`
  4. `sourceCodeChangedSinceStart` non-existent directory -> `{stale: false}` (fail-open)
  5. `sourceCodeChangedSinceStart` non-`.js` files ignored -> `{stale: false}`
  6. `readCacheVersionHeader` extracts version from 64-byte head of 2KB+ file -> `4`
  7. `readCacheVersionHeader` null-tolerance on missing / corrupt / no-version files
  8. Startup guard refuses to boot on newer schema (version 99) -> `null` + spy invoked; normal start on valid version
  9. Self-termination integration: code update during SSE push triggers `selfTerminate`, spy called, and port closed
  10. Watchdog timing constant bounds check (`0 < STALENESS_WATCHDOG_MS <= 60000`)

### R1-4: Entrypoint Documentation (`src/index.js` - MODIFIED)
- Added comment in [`src/index.js`](src/index.js:337) documenting server self-termination on code staleness and hook auto-respawn flow.

---

## 3. Results & Verification Evidence

### 3.1 Unit & Integration Test Suite
Command: `node test/run-tests.js`  
Result: **165 passed, 0 failed** (155 baseline + 10 new Suite 23 tests).

```text
▶ 23. Serve Staleness Self-Termination (R1)
  ✓ sourceCodeChangedSinceStart returns stale:false when all js files are older than startTimeMs
  ✓ sourceCodeChangedSinceStart returns stale:true and filename when a js file is newer than startTimeMs
  ✓ sourceCodeChangedSinceStart returns stale:false for mtime within safety margin before start
  ✓ sourceCodeChangedSinceStart returns stale:false on non-existent dir (fail-open)
  ✓ sourceCodeChangedSinceStart ignores non-.js files even when newer than start
  ✓ readCacheVersionHeader extracts version from first 64 bytes of large fixture
  ✓ readCacheVersionHeader returns null on missing file, corrupt header, or no version (REQ-107)
[agy-dashboard] refusing to start: on-disk cache schema v99 is newer than this build's v4. Update agy-tools.
  ✓ startup guard refuses to start and calls onSelfTerminate when disk cache version is newer (REQ-103)
[agy-dashboard] self-terminating: source file changed on disk (test-module.js) — restart for updated code
  ✓ self-termination triggers on code update during SSE push, clears port, and closes server (REQ-101..102)
  ✓ watchdog constant satisfies REQ-101 bound (STALENESS_WATCHDOG_MS <= 60000 and > 0)

=======================================================
  Tests: 165 passed, 0 failed, 165 total
  Duration: 1342ms
=======================================================
```

### 3.2 Live Self-Termination Verification (REQ-108)
Executed `node scripts/verify-r1-live.js`:
- Spawned live `--serve` on port 8790.
- Verified port probe (`127.0.0.1:8790`) and `dashboard-server.json` port file creation.
- Touched `src/serve-staleness.js` mtime into the future.
- Observed server output: `[agy-dashboard] self-terminating: source file changed on disk (serve-staleness.js) — restart for updated code`.
- Verified process exited with exit code 0 within 30.0s.
- Verified `dashboard-server.json` port record was cleanly deleted.

---

## 4. Issues Discovered
- None. All requirements REQ-101..108 are met with 0 new dependencies.

---

## 5. Next Step Recommendations
- Proceed to **P5: Technical Review (Debug mode) + Quality Gate**.
- Perform **P6: Final Ask Audit** against `requirement-checklist.md`.
- VP final review and commit (P7).

---

## 6. Affected File List

| File | Change Type | Description |
|---|---|---|
| [`src/serve-staleness.js`](src/serve-staleness.js:1) | **NEW** | Pure staleness detection and version header reading helpers |
| [`src/serve.js`](src/serve.js:1) | MODIFIED | Startup guard, self-termination, 30s watchdog, test hooks, STALENESS_WATCHDOG_MS export |
| [`test/run-tests.js`](test/run-tests.js:2910) | MODIFIED | Added Suite 23 with 10 unit/integration tests |
| [`src/index.js`](src/index.js:337) | MODIFIED | Documentation comment for `--serve` staleness self-termination |
| [`scripts/verify-r1-live.js`](scripts/verify-r1-live.js:1) | **NEW** | Live end-to-end verification script for REQ-108 |
