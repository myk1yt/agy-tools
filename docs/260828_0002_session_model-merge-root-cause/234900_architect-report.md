# Architect Task Report — R1: Dashboard Server Self-Termination on Code Staleness

**Date**: 2026-08-28 23:49 KST
**Mode**: Architect
**Session Folder**: `docs/260828_0002_session_model-merge-root-cause/`
**Inputs**: `141500_orchestrator-crow-report.md` (root cause), `requirement-checklist.md` (REQ-101..108)
**Status**: DESIGN COMPLETE — ready for VP → code delegation

---

## 0. Design Summary (one paragraph)

A long-lived `--serve` process keeps its modules in memory forever; after any code update on disk it becomes a poison source (proven incident: merged-model SSE pushes + v4→v3 cache downgrade every 5s). R1 makes the server **detect its own staleness and die**: (a) a pure helper compares every `src/*.js` mtime against the process start time captured at module init, checked on every SSE push AND on an independent 30s watchdog so clientless servers also exit; (b) termination is graceful (console reason → `removePortFileIfPort` → `closeAllConnections` (Node ≥18 guarded) → `server.close` → `exit(0)`, with a 1s hard-exit fallback); (c) a startup guard refuses to boot when the on-disk cache schema version is newer than the in-memory `CACHE_SCHEMA_VERSION`, using a cheap 64-byte head read. Zero new dependencies, Node ≥16, Windows-first. The existing `ensureServerRunning` respawn flow in `src/dashboard-link.js` is untouched and takes over after death (REQ-106).

---

## 1. Technical Specification

### 1.1 FE↔BE data-flow context

This feature is entirely BE-local (Node process self-supervision). The only cross-surface contract it must preserve:

```
[serve process] --(dies)--> [dashboard-server.json removed via removePortFileIfPort]
        |
        v
[hook render, next ≤ statusline cycle] --ensureServerRunning()--> spawns fresh --serve
        |
        v
[dashboard browser client] --SSE drops--> existing fallback: script-tag polling of
   dashboard-data.js + next hook respawn (REQ-104). No client change required.
```

No API/IPC/FFI boundary is added or modified. The statusline hook path (`--hook --raw`) is untouched (steaady-state ~1-2ms, <20ms budget preserved).

### 1.2 New module: `src/serve-staleness.js` (NEW file, ~120 lines)

Pure, injectable, unit-testable helpers. Zero deps beyond `fs`/`path` (Node core).

#### `captureProcessStartTime() → number`

- Returns `Date.now()` ms epoch **at module load** (module-level constant, evaluated the first time the module is required — which happens at the top of `serve.js`, i.e. before `syncSessions` or any listen).
- Rationale for `Date.now()` over `process.hrtime()`: mtimes from `fs.statSync` are ms-epoch wall-clock values; comparing against `hrtime` (monotonic, arbitrary origin) would require conversion and adds no precision we can use. `Date.now()` is the same clock domain as `stat.mtimeMs`.
- **False-positive guard (Windows mtime granularity)**: NTFS mtime resolution is fine (~100ns stored, ms-exposed), but some editors/sync tools (OneDrive!) can set mtimes with second-level truncation or even slightly future timestamps. Subtract a safety margin: `startTime - MTIME_SAFETY_MARGIN_MS` where `MTIME_SAFETY_MARGIN_MS = 2000`. A file whose mtime is within 2s *before* process start is NOT stale (covers coarse writes racing process spawn). Documented in code comment.

Signature:

```js
/**
 * Returns the process start time (ms epoch) minus the mtime safety margin.
 * Computed once at module load so it predates all module require()s.
 * @returns {number}
 */
function getProcessStartTimeMs() // returns MODULE_LOAD_TIME_MS constant
```

#### `sourceCodeChangedSinceStart(srcDir, startTimeMs) → { stale: boolean, file: string|null, mtimeMs: number|null }`

- `srcDir`: injectable directory (production caller passes `path.join(__dirname)` of serve.js, i.e. `src/`; tests pass a temp dir).
- `startTimeMs`: injectable comparison point.
- Implementation: `fs.readdirSync(srcDir)`, filter `*.js` (top level only — `src/` has no subdirs today; non-recursive by design, documented), `fs.statSync` each, return first entry with `stat.mtimeMs > startTimeMs`. Sort not needed (any single stale file is decisive); for deterministic console output, collect all matches and report the one with max mtime.
- **Failure semantics**: ANY fs error (readdir EACCES, stat ENOENT from a file deleted mid-scan, EPERM from OneDrive lock) → catch and return `{ stale: false, ... }`. *No-watch fallback = current behavior*; never crash the server on a watchdog error. A transient false negative self-heals on the next tick.
- Pure/synchronous: yes (called from an interval; the 14-file `src/` dir scan is ~1ms on SSD — negligible against a 5s/30s cadence).

#### `readCacheVersionHeader(cacheFilePath) → number|null`

- Reads **only the first 64 bytes** of the cache JSON: `fs.openSync` → `fs.readSync(fd, buffer, 0, 64, 0)` → `fs.closeSync`. Never `readFileSync` the whole file (production cache is ~18MB).
- Extraction: regex `/"version"\s*:\s*(\d+)/` on the head string. This is robust because `saveCache` writes `JSON.stringify(cacheData, null, 2)`, so the file starts `{\n  "version": 4,\n ...` — `"version": N` always appears within the first ~30 bytes. A 64-byte head is sufficient with wide margin.
- **Null-tolerant (REQ-107)**: returns `null` on missing file (ENOENT), unreadable file, corrupt head, or version not found in head. Caller treats `null` as "no guard trigger" (server starts normally — REQ edge case: cache file missing must not block startup).
- Sync, ~0.1ms.

```js
/**
 * Reads only the first 64 bytes of the cache file and extracts the top-level
 * "version": N without parsing the full (multi-MB) JSON document.
 * @param {string} cacheFilePath
 * @returns {number|null} Schema version, or null when unknown/unreadable.
 */
function readCacheVersionHeader(cacheFilePath)
```

Exports: `{ MTIME_SAFETY_MARGIN_MS, getProcessStartTimeMs, sourceCodeChangedSinceStart, readCacheVersionHeader }`.

### 1.3 Modified module: `src/serve.js`

#### 1.3.1 Constants (top of file, near `SSE_INTERVAL_MS` at line 23)

```js
const STALENESS_WATCHDOG_MS = 30000; // REQ-101/105: ≤60s; 30s chosen (see §2.1)
const staleness = require('./serve-staleness');
```

Also require `CACHE_SCHEMA_VERSION` from `./cache-manager` (already imported for `syncSessions` — extend the existing destructuring at line 20) and `CACHE_FILE` from `./config` (extend line 14-19 destructuring), and `removePortFileIfPort` from `./dashboard-link`. **Circular-import check**: `dashboard-link.js` requires `./html-report` and `./config` only — it does NOT require `./serve`, so `serve.js → dashboard-link.js` is acyclic. Verified against current imports.

#### 1.3.2 Startup schema guard — inside `startDashboardServer()`, before `tryListen`

At the top of [`startDashboardServer()`](src/serve.js:39) (after option normalization, before `return tryListen(preferredPort, 0)` at line 182):

```js
// REQ-103: refuse to start when the on-disk cache was written by NEWER code.
const diskCacheVersion = staleness.readCacheVersionHeader(CACHE_FILE);
if (diskCacheVersion !== null && diskCacheVersion > CACHE_SCHEMA_VERSION) {
  console.log(
    `[agy-dashboard] refusing to start: on-disk cache schema v${diskCacheVersion} ` +
    `is newer than this build's v${CACHE_SCHEMA_VERSION}. Update agy-tools.`
  );
  // Exit 0: this is a deliberate guard, not a crash; detached spawns must not
  // surface a failure to the hook (which treats non-zero as spawn failure).
  process.exit(0);
}
```

Placement note: exit BEFORE binding any port and BEFORE `writePortFile` (which lives in index.js after `startDashboardServer` resolves — since we exit, the port file is never written by this process; any stale pre-existing record pointing at a *live other* server is left intact, which is correct).

`opts.cacheFile` test hook: add optional `opts.cacheFile` (default `CACHE_FILE`) so unit tests can point the guard at a temp cache fixture without touching the real 18MB cache. Same injection pattern as existing `opts.intervalMs`.

#### 1.3.3 Graceful self-termination — new function in `serve.js`

```js
/**
 * Gracefully terminates the dashboard server on detected staleness (REQ-102).
 * Idempotent: concurrent triggers (SSE push + watchdog + signal) run once.
 * @param {http.Server} server
 * @param {number} boundPort
 * @param {string} reason - One-line human reason for the console.
 */
function selfTerminate(server, boundPort, reason) {
  if (selfTerminate._started) return;   // idempotency guard
  selfTerminate._started = true;
  try { console.log(`[agy-dashboard] ${reason}`); } catch (_e) {}
  // Hard-exit fallback: if graceful close stalls >1s (lingering SSE socket on
  // Node 16 without closeAllConnections), force exit (REQ-102).
  const hardExit = setTimeout(() => process.exit(0), 1000);
  if (typeof hardExit.unref === 'function') hardExit.unref();
  try { removePortFileIfPort(boundPort); } catch (_e) {}
  stopDashboardServer(server)           // already closeAllConnections-guarded (line 196-198)
    .then(() => { clearTimeout(hardExit); process.exit(0); })
    .catch(() => process.exit(0));
}
```

Note: `stopDashboardServer` (lines 190-201) already implements the Node ≥18 `closeAllConnections` feature guard, so REQ-102's close semantics are inherited unchanged. The 1s `setTimeout` covers the pathological case where `server.close()` never calls back (open keep-alive connections on Node 16 — `closeAllConnections` doesn't exist there; `server.close` waits for connections to end, hence the hard cap).

#### 1.3.4 Runtime staleness hooks — two attachment points

The watchdog and per-push check live INSIDE `startDashboardServer()` so they work for both the CLI `--serve` path and in-process tests. They are wired in the `server.listen` callback inside `tryListen` (lines 171-178), where `boundPort` first becomes known:

```js
server.listen(port, '127.0.0.1', () => {
  const boundPort = server.address().port;

  // REQ-101: independent watchdog — catches clientless stale servers (REQ-105).
  const watchdog = setInterval(() => {
    const hit = staleness.sourceCodeChangedSinceStart(SRC_DIR, staleness.getProcessStartTimeMs());
    if (hit.stale) {
      clearInterval(watchdog);
      selfTerminate(server, boundPort,
        `self-terminating: source file changed on disk (${hit.file}) — restart for updated code`);
    }
  }, STALENESS_WATCHDOG_MS);
  if (typeof watchdog.unref === 'function') watchdog.unref(); // never keep process alive
  server.once('close', () => clearInterval(watchdog));

  // Per-push check is registered here via closure (see /events handler below).

  resolve({ server, port: boundPort, url: `http://127.0.0.1:${boundPort}/` });
});
```

`SRC_DIR` = `__dirname` of serve.js (the `src/` directory itself). Using `__dirname` means the watched dir follows the actual install location (repo or npm-global) — no config constant needed.

Per-SSE-push check (REQ-101 first half) — inside the `/events` `push()` closure (lines 104-117), BEFORE `aggregate()`:

```js
const push = async () => {
  if (closed || inFlight) return;
  // REQ-101: staleness check per push — a stale server must die before it
  // can push one more merged/old-schema payload to the dashboard.
  const hit = staleness.sourceCodeChangedSinceStart(SRC_DIR, staleness.getProcessStartTimeMs());
  if (hit.stale) {
    selfTerminate(server, boundPort,
      `self-terminating: source file changed on disk (${hit.file})`);
    return;
  }
  inFlight = true;
  // ... existing aggregate/push body unchanged ...
};
```

`boundPort` caveat: `push()` is defined inside `http.createServer` callback which runs per-request, while `boundPort` is only known in the `listen` callback. Solution: declare `let boundPortRef = null;` in `tryListen` scope, set it in the listen callback, and reference it from `push()`. Because requests cannot arrive before `listening`, `boundPortRef` is always set when `push` runs. Alternatively store on the server object (`server._agyBoundPort`). Design chooses the closure `let` (no property pollution).

#### 1.3.5 Interaction with existing SIGINT/SIGTERM handlers in `src/index.js`

No change required in [`src/index.js:342-347`](src/index.js:342): its `shutdownAndExit` does `removePortFileIfPort` + `stopDashboardServer` + `exit(0)` — the same sequence. `selfTerminate` is idempotent so a signal racing a watchdog tick is safe (whichever runs first wins; `removePortFileIfPort` is itself conditional and unlink-tolerant). One line of documentation added in the `--serve` block comment noting self-termination exists.

### 1.4 What is deliberately NOT changed

| File | Why untouched |
|---|---|
| `src/dashboard-link.js` | Constraint: respawn flow already works (REQ-106 verify-only). The REQ-240 payload-version staleness check (lines 302-309) is complementary and stays. |
| `src/hook-handler.js`, statusline path | <20ms budget; no new work added to hook path. |
| `src/cache-manager.js` | `CACHE_SCHEMA_VERSION` and `saveCache` layout already guarantee the 64-byte head contains `"version": N`. No change needed. |
| `bin/*.js` | No new CLI flags. |

---

## 2. Architecture Decisions

### 2.1 Watchdog interval: 30s (decision)

- REQ-101 demands ≤60s for clientless servers. Options: 15s / 30s / 60s.
- Chosen **30s**: worst-case clientless poisoning window halves the requirement ceiling; cost is one `readdirSync`+14 `statSync` per 30s (~1ms) — negligible. 15s doubles the syscalls for marginal benefit; 60s sits exactly at the ceiling with no slack for a just-missed tick (a change at T+ε after a tick waits a full interval; 60s risks hitting the REQ boundary exactly).
- The watchdog is `unref()`'d so it never extends process lifetime, and cleared on `server 'close'`.

### 2.2 mtime strategy: snapshot-free, per-check `readdirSync`, start time captured at module load (decision)

- **Start time capture**: `Date.now()` at `serve-staleness` module evaluation. CommonJS evaluates `require('./serve-staleness')` when `serve.js` is required — i.e. during process boot, before listen. This satisfies "captured BEFORE module loads complete" closely enough: any file write after process spawn has `mtimeMs > boot time`. A file written *during* the same 2s window as spawn is excluded by the 2s safety margin (§1.2), which trades a 2s detection blind spot at boot for immunity to coarse/OneDrive-shifted mtimes — acceptable because the realistic update scenario is "user pulls new code minutes-to-hours after server start".
- **No baseline snapshot**: an alternative design snapshots all mtimes at boot and diffs later. Rejected: a file written between process spawn and snapshot would be missed; comparing against start time is simpler and strictly more conservative (detects everything newer than boot).
- **Editor-without-save is safe**: mtime only changes on actual writes. An editor merely opening `src/serve.js` does not touch mtime — documented as required.
- **OneDrive consideration**: OneDrive-synced workspaces (this repo lives in `OneDrive/Projects`) occasionally rewrite files during sync. A sync that *rewrites* `src/*.js` content-identically still bumps mtime → server exits → hook respawns fresh server with identical code. Cost: one harmless respawn. Benefit: zero chance of serving stale code. Documented as accepted trade-off.

### 2.3 Exit semantics: `exit(0)` everywhere (decision)

- Both the startup guard and self-termination exit with code **0**. These are intentional, healthy lifecycle events, not failures. Non-zero would (a) pollute any wrapper scripts, (b) risk the hook's spawn-error path treating guard exits as spawn failures (dashboard-link `ensureServerRunning` catches spawn errors and falls back to `file://` — exit code of the detached child is not directly observed, but keeping 0 preserves the "silent by design" hook contract documented in dashboard-link.js header).
- Console output is a single line prefixed `[agy-dashboard]` so it is greppable and consistent with existing server logging style in index.js.

### 2.4 Self-termination placement: inside `serve.js`, not `index.js` (decision)

- The watchdog + per-push checks are attached inside `startDashboardServer()` rather than in the CLI layer. This makes the behavior inherent to the server (any embedder gets it) and unit-testable in-process via the existing `startDashboardServer({port:0})` pattern from Suite 17 — no child-process orchestration needed in unit tests.
- `process.exit(0)` inside a library function is normally an anti-pattern; here it is the explicit REQ-102 requirement ("server.close → exit(0)"). To keep tests safe, an opt-out test hook is added: `opts.onSelfTerminate` — when provided, `selfTerminate` calls `opts.onSelfTerminate(reason)` INSTEAD of `process.exit(0)` after the graceful close (the hard-exit timer is also skipped). Production (`index.js`) does not pass it. This mirrors the existing `opts.intervalMs` test-hook convention.

### 2.5 Three design options considered (per protocol)

| Option | Description | Effort | Risk | Outcome |
|---|---|---|---|---|
| **A (Standard/Right Way)** — chosen | mtime self-watch + schema startup guard + graceful self-term, watchdog 30s, testable pure helpers | ~1.5 sessions | Low — additive, all failure paths fall back to current behavior | Eliminates the proven incident class permanently; REQ-101..108 fully satisfiable |
| B (Pragmatic) | Only the startup schema guard (REQ-103), no runtime watchdog | ~0.5 session | Medium — stale servers already running keep poisoning until manual restart; REQ-101/105 unsatisfied | Partial; leaves the exact incident (long-running stale server) unaddressed |
| C (Incremental) | Version-gate SSE payloads client-side only (dashboard ignores older payloadVersion) | ~0.5 session | High — cache poisoning continues unseen (old servers still write v3); only masks the visual symptom | Rejected: treats symptom, not root cause; incident report explicitly recommends self-termination |

Option A is the only one satisfying REQ-101..103 jointly; B and C documented for the record.

### 2.6 Dependency & risk analysis

- New imports: `serve.js → serve-staleness.js` (new), `serve.js → dashboard-link.js` (new edge, acyclic — verified §1.3.1), `serve-staleness.js → fs/path` only. No cycles introduced (`dashboard-link → html-report → config`; `serve → {config, cache-manager, html-report, dashboard-link, serve-staleness}`).
- Node ≥16: uses only `fs.readdirSync`, `fs.statSync`, `fs.openSync/readSync/closeSync`, `setInterval/clearInterval`, `setTimeout`, `Date.now` — all available since Node ≤12. `closeAllConnections` remains feature-guarded (existing code, Node ≥18). No `fs.rmSync`, no `??=`/`?.` additions beyond what the codebase already uses (codebase already uses `?.` and `??` in cache-manager/config, which is fine on Node 16).
- Windows-first: all APIs used are cross-platform; no signals beyond existing SIGINT/SIGTERM (which Node maps on Windows), no `fs.watch` (unreliable on Windows network drives — deliberately not used).

---

## 3. Implementation Plan (for VP → code delegation)

### Task R1-1: `src/serve-staleness.js` (NEW)

- **Create**: `src/serve-staleness.js` per §1.2 — `MODULE_LOAD_TIME_MS` constant, `getProcessStartTimeMs()`, `sourceCodeChangedSinceStart(srcDir, startTimeMs)`, `readCacheVersionHeader(cacheFilePath)`, export `{ MTIME_SAFETY_MARGIN_MS, getProcessStartTimeMs, sourceCodeChangedSinceStart, readCacheVersionHeader }`.
- **Prerequisites**: none.
- **Verification**: unit tests in R1-3. Exact CLI: `node test/run-tests.js` (full suite — the runner has no per-suite filter; Suite numbering convention continues).

### Task R1-2: `src/serve.js` modifications

- **Modify** `src/serve.js`:
  1. Extend requires (top, lines 12-24): add `path` (if needed — not required; `__dirname` suffices), `CACHE_FILE` from `./config`, `CACHE_SCHEMA_VERSION` from `./cache-manager`, `removePortFileIfPort` from `./dashboard-link`, `./serve-staleness`.
  2. Add `STALENESS_WATCHDOG_MS = 30000` constant near `SSE_INTERVAL_MS` (line 23).
  3. Add startup schema guard in `startDashboardServer()` before `return tryListen(...)` (line 182), honoring `opts.cacheFile` (default `CACHE_FILE`) — §1.3.2.
  4. Add `selfTerminate(server, boundPort, reason)` with idempotency flag + 1s hard-exit fallback + `opts.onSelfTerminate` test hook threading — §1.3.3. Thread `opts` into the closure: capture `const onSelfTerminate = typeof opts.onSelfTerminate === 'function' ? opts.onSelfTerminate : null;` at the top of `startDashboardServer`.
  5. In `tryListen`'s listen callback (lines 171-178): capture `boundPortRef`, start the 30s `unref()`'d watchdog, clear on `server 'close'` — §1.3.4.
  6. In `/events` `push()` (lines 104-117): staleness pre-check before `aggregate()` — §1.3.4.
  7. Export `STALENESS_WATCHDOG_MS` (for tests) alongside existing exports (lines 203-207).
- **Prerequisites**: R1-1.
- **Verification**: `node test/run-tests.js` — existing Suite 17 (SSE server tests) must still pass unchanged (watchdog must not break ephemeral servers: 30s >> test durations, and `unref` keeps test process exit clean).

### Task R1-3: `test/run-tests.js` — new Suite 23

- **Modify** `test/run-tests.js`: insert new suite **after** the last suite ("19. Additional Bug Fix Validations", ends line 2908) and **before** the `// --- Summary & Exit Code ---` block (line 2910):

```
// --- Suite 23: Serve Staleness Self-Termination (R1, REQ-101..103, 107) ---
await describe('23. Serve Staleness Self-Termination (R1)', async () => { ... });
```

Required test cases:

1. `sourceCodeChangedSinceStart` — temp dir with 2 `.js` files, both older than injected `startTimeMs` → `{stale:false}`.
2. `sourceCodeChangedSinceStart` — one file `fs.utimesSync`'d to `startTimeMs + 5000` → `{stale:true, file}` names that file.
3. `sourceCodeChangedSinceStart` — mtime within the 2s safety margin before start → `{stale:false}` (REQ false-positive guard).
4. `sourceCodeChangedSinceStart` — non-existent dir → `{stale:false}` (no-watch fallback; never throws).
5. `sourceCodeChangedSinceStart` — ignores non-`.js` files (e.g. `.json`, `.tmp` newer than start → still `{stale:false}`).
6. `readCacheVersionHeader` — fixture file `{ "version": 4, ...large tail... }` → `4`, and file size >64B proves head-only read works (write a 1KB fixture).
7. `readCacheVersionHeader` — missing file → `null`; corrupt head (`{ not json`) → `null`; `{}` (no version) → `null` (REQ-107 null-tolerance).
8. Startup guard — `startDashboardServer({ port: 0, cacheFile: <fixture with version CACHE_SCHEMA_VERSION+1>, onSelfTerminate: spy })` → server never binds / spy or exit-path invoked. **Test-safety note**: the guard calls `process.exit(0)` — for unit tests the guard MUST route through the same `onSelfTerminate` hook (design amendment: startup guard calls `selfTerminate`-equivalent path: when `opts.onSelfTerminate` is present, call it and return `null` from `startDashboardServer` instead of exiting; production exits). Assert spy called with reason mentioning the newer version; when version ≤ current, server starts normally (spy not called).
9. Self-termination integration — `startDashboardServer({ port: 0, intervalMs: 100, onSelfTerminate: spy })`, then `fs.utimesSync` a *temporary* `.js` file placed in an injected `opts.srcDir` (add `opts.srcDir` test hook, default `__dirname`) to now+5s → within ~1-2 push ticks, spy fires and `probePort(info.port)` turns false. This proves REQ-101/102 wiring end-to-end without touching real `src/` mtimes. **CRITICAL**: tests must NEVER touch mtimes of real `src/*.js` — the `opts.srcDir` injection exists precisely for this.
10. Watchdog timing guard — assert `serve.STALENESS_WATCHDOG_MS <= 60000` (REQ-101 bound) and `> 0`.

- **Prerequisites**: R1-1, R1-2.
- **Verification**: `node test/run-tests.js` — full suite green; zero new failures; total test count increases by ~10.

### Task R1-4: `src/index.js` documentation touch (minor)

- **Modify** `src/index.js` `--serve` block comment (lines 339-341 region): one comment line noting the server may self-terminate on staleness and the hook respawns it. No logic change.
- **Prerequisites**: R1-2.
- **Verification**: `node bin/agy-tokens.js --help` smoke (unchanged behavior) + full `node test/run-tests.js`.

### Implementation order & independence

R1-1 → R1-2 (depends on 1) → R1-3 (depends on 1,2). R1-4 independent after R1-2. A single code-mode delegation can execute R1-1..R1-4 sequentially; they are one cohesive feature and share files.

---

## 4. Risk Assessment & Edge Cases

| # | Edge case / risk | Handling in design | Residual risk |
|---|---|---|---|
| E1 | Process start time vs mtime clock skew (OneDrive, FAT32 2s granularity) | 2s `MTIME_SAFETY_MARGIN_MS` subtracted from start time | 🟢 Low — 2s blind window at boot only |
| E2 | `fs.readdirSync`/`statSync` failure (permissions, file deleted mid-scan, OneDrive lock) | Catch-all → `{stale:false}` (no-watch = current behavior); self-heals next tick | 🟢 Low |
| E3 | Cache file missing at startup | `readCacheVersionHeader` → `null` → guard does not trigger, server starts | 🟢 None (explicit REQ edge case) |
| E4 | Cache file being atomically replaced during head read | `saveCache` writes tmp+rename; a 64B read either sees old or new complete header — both parse fine. Corrupt mid-write state impossible on same-volume rename | 🟢 Low |
| E5 | Cache JSON layout changes so `"version"` leaves the first 64B | `saveCache` uses `JSON.stringify(obj, null, 2)` with `version` as first key — guaranteed by object literal construction in `loadCache`/`syncSessions` (`{version, lastUpdated, sessions}`). Documented invariant in serve-staleness header comment | 🟡 Guard returns `null` → server starts (fail-open, current behavior) — acceptable |
| E6 | Concurrent self-termination (watchdog + push + SIGINT same tick) | `selfTerminate._started` idempotency flag; `removePortFileIfPort` is conditional; `stopDashboardServer` tolerates double-close via `server.close` callback semantics | 🟢 Low |
| E7 | `server.close()` never resolves on Node 16 (open SSE keep-alives, no `closeAllConnections`) | 1s `setTimeout` hard-exit fallback (`unref`'d) — REQ-102 requirement | 🟢 Low |
| E8 | Watchdog keeps test process / CLI alive | `watchdog.unref()` + clear on `server 'close'` | 🟢 None |
| E9 | Tests touching real `src/` mtimes → killing the dev's running server | `opts.srcDir` injection; tests use temp dirs only; test 10 asserts constants only | 🟢 None by construction |
| E10 | Editor opening (not saving) a src file | mtime unchanged on open — no trigger. Documented | 🟢 None |
| E11 | Content-identical OneDrive re-sync bumps mtime | Server exits & hook respawns with identical code — harmless churn, no user-visible breakage (SSE reconnects) | 🟡 Accepted trade-off, documented in §2.2 |
| E12 | npm-global install path with spaces/unicode in `__dirname` | `readdirSync`/`statSync` handle Windows paths natively; no shell involved | 🟢 None |
| E13 | Guard exits before port file write — hook respawn loop? | `ensureServerRunning` spawns → child guard-exits (0) → port file still shows spawn intent; intent expires after 15s grace → next render respawns. Loop only while disk cache version > code version, i.e. exactly the downgrade-protection scenario; user-facing symptom is badge falls back to `file://` polling which still renders current data. Bounded by design; console line explains why | 🟡 Documented behavior, matches REQ-103 intent |
| E14 | Multiple stale servers on different ports (the actual incident: 3 PIDs) | Each independently self-detects via its own watchdog/push checks — all die within 30s of any src write | 🟢 Handled by design |

---

## 5. Verification Gates Mapping (REQ-101..108)

| REQ | Requirement | Design mechanism | Verification gate |
|---|---|---|---|
| REQ-101 | Runtime staleness detection (mtime > start), per push + watchdog ≤60s | `sourceCodeChangedSinceStart` called in `push()` + 30s `unref`'d watchdog (§1.3.4) | Suite 23 tests 1-5, 9, 10; live gate REQ-108 |
| REQ-102 | Graceful self-term: console reason, removePortFileIfPort, closeAllConnections (≥18 guarded), server.close → exit(0), 1s fallback | `selfTerminate()` §1.3.3; inherits guarded `stopDashboardServer` | Suite 23 test 9 (spy + port closed); code review of sequence; live gate REQ-108 (port file removed) |
| REQ-103 | Startup guard on newer disk cache schema, 64-byte head read | `readCacheVersionHeader` + guard in `startDashboardServer` §1.3.2 | Suite 23 tests 6-8 |
| REQ-104 | Connected dashboards stop receiving stale payloads; fallback takes over | Server death drops SSE; existing client script-tag polling + hook respawn (no change) | Live verification: open dashboard, touch src file, observe SSE drop + recovery (REQ-108 protocol) |
| REQ-105 | Clientless stale server exits ≤60s | 30s watchdog independent of SSE clients (§2.1) | Suite 23 test 10 (constant bound); live: start server with no clients, touch file, observe exit ≤60s (REQ-108) |
| REQ-106 | Hook auto-respawns fresh server after death | Untouched `ensureServerRunning` flow; port file removed by `selfTerminate` enables fresh spawn intent | Existing Suite 18 tests stay green; live REQ-108 step "fresh server starts cleanly" |
| REQ-107 | Zero new deps; pure injectable helpers; tests for both helpers | Node-core-only `serve-staleness.js`; `srcDir`/`startTimeMs`/`cacheFilePath` all injectable | `package.json` diff = no dependency block added; Suite 23 tests 1-8 |
| REQ-108 | Live verification: touch mtime → self-term + port file removed → fresh start clean | Mechanism designed above enables it | Manual protocol (VP P5/P7): `node bin\agy-tokens.js --serve` → `fs.utimesSync` one src file via `node -e` → observe console reason + exit ≤30s (or next push) + `dashboard-server.json` gone → next `--hook --raw` respawns → `probe-sse-capture.js` shows healthy payload |

### Global verification commands

```powershell
# Unit/integration (whole suite; runner has no per-suite filter)
node test/run-tests.js

# Live REQ-108 protocol (VP-executed, Windows PowerShell)
node bin\agy-tokens.js --serve --port 8787   # terminal A
node -e "const fs=require('fs');const f='src/config.js';const d=new Date(Date.now()+5000);fs.utimesSync(f,d,d)"   # touch mtime only
# expect: terminal A prints [agy-dashboard] self-terminating ... and exits; dashboard-server.json removed
node bin\agy-tokens.js --hook --raw           # respawn path (links + spawns fresh)
node probe-sse-capture.js                     # fresh server healthy
# RESTORE the touched file content timestamp afterwards via git checkout -- src/config.js (content unchanged, so safe)
```

---

## 6. Issues Discovered (adjacent, non-blocking)

1. **E13 respawn loop awareness**: when the startup guard fires (disk newer than code), every hook render for 15s-grace cycles may respawn a child that immediately exits. Bounded and harmless, but the badge will show `file://` fallback until the user updates agy-tools. This is the *intended* REQ-103 behavior — flagged here so VP/Ask are not surprised during verification.
2. **`removePortFileIfPort` import edge**: serve.js gains a new dependency edge on dashboard-link.js. Verified acyclic today; a future refactor moving `ensureServerRunning` to import serve.js would create a cycle — worth a one-line comment at the import site (included in R1-2 spec).
3. **Suite numbering inconsistency** in `test/run-tests.js` (two suites labeled 19, parts 1-4 naming) — cosmetic only; new suite is labeled "23. ..." continuing the highest number in use (22). No renumbering performed (out of scope).

## 7. Next Step Recommendations

1. VP delegates R1-1..R1-4 to **code** mode as one task with this report attached (files: `src/serve-staleness.js` NEW, `src/serve.js`, `test/run-tests.js`, `src/index.js` comment).
2. P5: debug-mode technical review focusing on §4 edge cases E4/E6/E7 + REQ mapping table.
3. P5/P7: execute the live REQ-108 protocol above on the user's Win11 machine (a `--serve` instance is currently running in Terminal 1 — ideal live subject; expect it to self-terminate during verification).
4. P6 Ask audit against requirement-checklist.md REQ-101..108 checkboxes.

## 8. Affected File List

| File | Change |
|---|---|
| `src/serve-staleness.js` | **NEW** — pure staleness/version-header helpers |
| `src/serve.js` | MODIFIED — startup guard, watchdog, per-push check, `selfTerminate`, new test hooks (`opts.cacheFile`, `opts.srcDir`, `opts.onSelfTerminate`), new export `STALENESS_WATCHDOG_MS` |
| `test/run-tests.js` | MODIFIED — new Suite 23 (~10 tests) |
| `src/index.js` | MODIFIED — comment-only (documents self-termination in `--serve` block) |
| `docs/260828_0002_session_model-merge-root-cause/234900_architect-report.md` | **NEW** — this report |

No changes to: `src/dashboard-link.js`, `src/cache-manager.js`, `src/config.js`, `package.json`, `bin/*` (constraint compliance).
