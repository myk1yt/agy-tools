# Code Report — VS Code Dashboard Link Fix (file:// → http://127.0.0.1)

**Mode:** code | **Date:** 2026-08-27 | **Time:** 22:19 KST
**Session:** docs/260827_0001_session_usage-dashboard-integration/
**Task:** Clicking the 📊 Dashboard badge inside VS Code's integrated terminal opened dashboard.html as SOURCE CODE in the editor instead of the browser. Root cause (VP-verified, vscode#39278 / vscode#176812): VS Code routes `file://` OSC 8 hyperlinks to the editor by design; only `http(s)://` opens the default browser. Fix: inside VS Code terminals the badge links to the local http dashboard server (auto-started, 127.0.0.1 only); outside VS Code the file:// behavior is unchanged.

---

## Task Summary

Implemented the VP fix design exactly: new zero-dependency module [`src/dashboard-link.js`](../../src/dashboard-link.js) (VS Code detection, link-target resolution, loopback TCP port probe, atomic port file, detached background server spawn with a cross-process stampede guard), wired into the hook branch of [`src/index.js`](../../src/index.js) with `AGY_TOKENS_LINK_MODE` override and `--no-link` preserved, port-file publish + graceful-shutdown cleanup in the `--serve` branch, 11 new tests (suite 18), and a README statusline paragraph. All 101 tests green; all 5 verification gates pass with live evidence.

## Actions Taken

### 1. New module [`src/dashboard-link.js`](../../src/dashboard-link.js) (zero deps: net, child_process, fs, path)
- `isVsCodeTerminal()` → `process.env.TERM_PROGRAM === 'vscode'`.
- `getLinkModeOverride()` → validates `AGY_TOKENS_LINK_MODE=file|http` (invalid values ignored).
- `resolveLinkTarget()` → `{ mode:'http', url:'http://127.0.0.1:8787/' }` under VS Code (or forced http), else `{ mode:'file', url: osc8.dashboardFileUrl() }`.
- `probePort(port, timeoutMs=300)` → `net.connect` to 127.0.0.1, never throws, resolves false on error/timeout.
- Port file IO: `readPortFile` (tolerates stale pid/corrupt JSON → null), `writePortFile` / `writeSpawnIntent` / `removePortFile` / `removePortFileIfPort` — **all writes atomic (tmp + rename)**.
- `ensureServerRunning(opts)` flow (documented in the module header):
  1. Port file has a server record → probe its port → up: return `{ url, started:false }`.
  2. Fresh spawn intent (< 15s, `SPAWN_GRACE_MS`) → another hook render already spawned the server → return expected URL without spawning (cross-process stampede guard — necessary because every statusline render is its own node process, so module state cannot guard).
  3. No record but default port live → return it (covers a running server whose port file was deleted).
  4. Down → write spawn intent, `spawn(process.execPath, [entryJs, '--serve', '--port', '8787'], { detached:true, stdio:'ignore', windowsHide:true }).unref()` (fire-and-forget ~1ms) and return the EXPECTED url immediately; the spawned server overwrites the port file with its authoritative bound port (`--serve` auto-increments on EADDRINUSE, so the next render links to the corrected port).
  5. Any failure (entry missing, spawn throw) → `null`; caller falls back to file://.
- Entry resolution: `../bin/agy-tokens.js` relative to `__dirname` — valid in both this repo and the npm-global install (`bin/` + `src/` are siblings in both; both are shipped via package.json `files`).
- Traceable error comments: `DASHBOARD-LINK/probePort/001`, `DASHBOARD-LINK/ensureServerRunning/001|002`, `DASHBOARD-LINK/serve/001`.

### 2. [`src/index.js`](../../src/index.js) wiring
- Import: `const dashboardLinkModule = require('./dashboard-link')`.
- **Hook branch**: `--no-link` → no segment (unchanged). Otherwise `resolveLinkTarget()`; mode http → `await ensureServerRunning()` (null → fall back to `osc8.dashboardFileUrl()`), then `osc8.formatOsc8Link(linkUrl, '📊 ' + i18n.t('dashboardLink'))`. Mode file → current behavior byte-identical.
- **`--serve` branch**: after `startDashboardServer` resolves, `writePortFile(serverInfo.port)` (atomic) so hook renders discover the authoritative port; registers `SIGINT`/`SIGTERM` handlers that call `removePortFileIfPort(serverInfo.port)` (only removes while the file still points at THIS server, preserving a newer server's record) then `stopDashboardServer` + exit 0.

### 3. [`src/config.js`](../../src/config.js)
- Added `DASHBOARD_SERVER_PORT_FILE = path.join(DASHBOARD_DIR, 'dashboard-server.json')` (same dir as dashboard.html) + export. No other changes.

### 4. [`src/serve.js`](../../src/serve.js)
- **Untouched** — protocol already 127.0.0.1-only + no-store; the port-file write lives in the `--serve` branch of index.js (cleaner: serve.js stays a pure library, and the port file is a CLI-process concern).

### 5. Tests — new suite 18 in [`test/run-tests.js`](../../test/run-tests.js) (11 tests)
- `isVsCodeTerminal` env detection (vscode / unset / apple_Terminal) with full env save-restore.
- `resolveLinkTarget` http mode under `TERM_PROGRAM=vscode`; file mode otherwise.
- `AGY_TOKENS_LINK_MODE` forces file under vscode, http outside vscode, invalid value ignored.
- `probePort` against a real ephemeral `net` server on 127.0.0.1:0 → true; closed port → fast false.
- Port file: atomic write (no `.tmp` leftover), read back, stale pid tolerated; corrupt JSON and invalid records rejected; spawn-intent record accepted.
- `ensureServerRunning`: live recorded port → link without spawn; fresh spawn intent honored without spawning; missing entry + dead ports → null (fallback signal).
- `removePortFileIfPort` removes only on port match.

### 6. [`README.md`](../../README.md)
- One new bullet in the statusline section: VS Code routes file:// OSC 8 to the editor by design → inside VS Code the badge links to `http://127.0.0.1:8787/` (auto-started background server, 127.0.0.1 only, re-aggregates every 5s, discovered via `dashboard-server.json`); outside VS Code keeps file://; `AGY_TOKENS_LINK_MODE=file|http` override; `--no-link` suppresses.

## Result

**SUCCESS — all verification gates pass with live evidence.**

| Gate | Evidence |
|---|---|
| 1. Full suite | `node test/run-tests.js` → **101 passed, 0 failed, 101 total** (18 suites), exit 0, 3567ms |
| 2. VS Code badge | `TERM_PROGRAM=vscode node bin/agy-tokens.js --hook --raw` → badge contains `]8;;http://127.0.0.1:8787/📊 Dashboard]8;;` (verified via harness: `PASS \| G2`) |
| 3. Non-VS Code badge | Without `TERM_PROGRAM` → badge contains `]8;;file:///C:/Users/k1yt/.gemini/antigravity-dashboard/dashboard.html` and NO http link (unchanged behavior) |
| 4a. Auto-started server | `http://127.0.0.1:8787/` → **status=200, 16946 bytes, cache-control=no-store**, body starts `<!DOCTYPE html>` |
| 4b. Port file | `~/.gemini/antigravity-dashboard/dashboard-server.json` → `{"port":8787,"pid":38020,"startedAt":"2026-08-27T13:17:45.134Z"}` (valid JSON, written by the spawned server) |
| 5. Timing | `ensureServerRunning` in-process (10 runs): 0,0,1,1,1,1,1,1,2,4 ms — **median 1ms**, max 4ms. Full CLI wall (median of 7): file-path 639ms vs http-probe 678ms (delta dominated by node boot + 50ms stdin timeout + machine jitter; the probe path itself adds ~1-4ms) — well under the 20ms statusline budget |
| Extras | `--no-link` → no Dashboard segment ✓ · `AGY_TOKENS_LINK_MODE=file` under vscode → file:// link ✓ · `AGY_TOKENS_LINK_MODE=http` outside vscode → http link ✓ |
| Constraints | Zero new npm deps ✓ · atomic tmp+rename writes ✓ · server binds 127.0.0.1 ONLY (unchanged) ✓ · no git commit/push ✓ · `~/.gemini/**` touched only by the tool's own dashboard artifacts (dashboard-server.json) ✓ · `AppData\Local\agy\**` untouched ✓ |

## Issues Discovered

1. **`dashboardLink is not defined` in the `--serve` branch (caught by Gate 4, fixed)** — my first wiring named the import `dashboardLink` (colliding with the hook branch's local `dashboardLink` string variable) and referenced `dashboardLinkModule` in the hook branch; the `--serve` branch still called `dashboardLink.writePortFile`. The spawned background server therefore crashed on startup and Gate 4a/4b failed (port file still held the spawn intent). Fixed by renaming the import to `dashboardLinkModule`; re-run → 5/5 gates. Lesson: the verification harness caught a bug that unit tests could not (suite 18 tests the module directly; the collision was in index.js's `--serve` branch).
2. **Cross-process stampede guard is required, not optional** — every statusline render is a separate node process, so an in-module "already spawning" flag cannot prevent N concurrent renders from spawning N servers. Solved with the spawn-intent record + 15s grace window in the port file (atomic).
3. **Port auto-increment vs. expected-URL race** — if 8787 is taken by a foreign process, the spawned server binds 8788+ and the FIRST render's link points at 8787 (dead). Self-corrects on the next render (port file now holds the authoritative port); documented in the module header. Acceptable per the VP design ("link to the EXPECTED url immediately").

## Next Step Recommendations

1. **VP live gate**: restart agy and Ctrl+Click the 📊 Dashboard badge inside the VS Code statusline — it should now open the rendered dashboard in the browser. Note the npm-global copy (`AGY-TO~1`) must be refreshed (`npm link` / reinstall) first — the statusline runs the global install, not this repo checkout.
2. The spawned background server (pid 38020 in evidence) persists by design (detached). `AGY_TOKENS_LINK_MODE=file` restores the old behavior without killing it; killing the process clears the link on the next render (probe fails → re-spawn on demand).
3. Optional future polish: have the spawned server also write `dashboard-data.json` on boot so the very first http page view has data before the first `--write-dashboard` pass (currently the page shows the empty-state until the next statusline render).

## Affected File List

**Modified:**
- [src/config.js](../../src/config.js) (DASHBOARD_SERVER_PORT_FILE constant + export)
- [src/index.js](../../src/index.js) (dashboard-link import; hook branch http/file link resolution + fallback; --serve branch port-file publish + SIGINT/SIGTERM cleanup)
- [test/run-tests.js](../../test/run-tests.js) (new suite 18, 11 tests)
- [README.md](../../README.md) (VS Code http-link paragraph + AGY_TOKENS_LINK_MODE doc)

**Created:**
- [src/dashboard-link.js](../../src/dashboard-link.js) (new module)
- [scripts/verify-dashboard-link.js](../../scripts/verify-dashboard-link.js) (one-shot verification harness for gates 2-5; kept for re-verification)

**Untouched (verified):** `src/serve.js`, `src/osc8.js`, `src/formatter.js`, `src/hook-handler.js`, `src/html-report.js`, `src/i18n.js`, `bin/*`, `package.json`, `scripts/install.*`, `AppData\Local\agy\**`, `~/.gemini/**` (except the dashboard-server.json artifact the tool itself writes).