# Architect Report — Hybrid Real-Time Token Dashboard (statusline OSC 8 link + streaming HTML)

**Mode:** architect | **Date:** 2026-08-27 | **Session:** docs/260827_0001_session_usage-dashboard-integration/
**Task:** Design `agy-tokens --html` self-refreshing dashboard + statusline OSC 8 link (hybrid of idea A + idea B; `/tokens` skill untouched)

---

## 1. Technical Specification

### 1.1 Goals

1. **G1** — `agy-tokens --html` generates a single-file, offline-capable `dashboard.html` (inline CSS/JS, no CDN) showing: summary cards (Today / Yesterday / 7-day / 30-day), 30-day daily breakdown table (same columns as the ANSI table), and an inline SVG bar chart for the 7/30-day trend.
2. **G2** — The dashboard updates in near-real-time while agy runs, with **zero background process required** in the default mode, and an optional `--serve` mode for true SSE push.
3. **G3** — The statusline badge gains a clickable `📊 Dashboard` segment via OSC 8 hyperlink; Ctrl+Click opens the dashboard in the default browser. Degrades to plain text on terminals without OSC 8 support.
4. **G4** — Statusline invocation stays single-line, ANSI-colored, and fast (script work <20ms; the one-time node.exe spawn cost is unchanged from the currently working setup).
5. **G5** — Zero external dependencies (Node core only: `fs`, `http`, `path`, `os`, `url`). All artifacts in repo (`src/`, `bin/`) + user config dirs (`~/.gemini/...`). agy binary dir untouched. Windows-first, POSIX-safe where trivial.

### 1.2 Core Constraints (audit-ready for `ask`)

- **C1** — Statusline runs via `cmd /c` with stripped PATH: the command MUST use 8.3 short paths, no quotes (established fact #3). New flags are appended to the existing working command; no new path resolution happens in the shell.
- **C2** — The browser cannot execute node. All data must be written to disk by a local process (statusline side effect or `--serve`).
- **C3** — `fetch()`/XHR on `file://` pages is **blocked by Chrome/Edge/Firefox** (CORS, origin `null`). The file:// refresh mechanism MUST NOT use `fetch('dashboard-data.json')`. Classic `<script src>` tags are exempt from CORS and are the sanctioned transport.
- **C4** — `--write-dashboard` (statusline side effect) MUST reuse the same `syncSessions()` result as the badge computation. No second sync pass.
- **C5** — All dashboard writes are atomic (tmp file + rename, same pattern as [`src/cache-manager.js`](src/cache-manager.js:49) `saveCache`). Readers never observe partial JSON.
- **C6** — `--serve` binds `127.0.0.1` only. Token usage data is personal; never bind `0.0.0.0`.
- **C7** — i18n key parity across en/ko/ja/zh is enforced by test suite 3 ([`test/run-tests.js`](test/run-tests.js:311)). Every new i18n key MUST be added to all 4 dictionaries in the same batch.
- **C8** — `/tokens` skill and `integrations/skills/tokens/SKILL.md` are NOT modified (user decision).

### 1.3 Recommended Data-Flow Diagram

```
┌──────────────────────────── agy (Antigravity CLI) ────────────────────────────┐
│  state change (turn end / tool result / idle)                                 │
│        │                                                                      │
│        ▼  cmd /c (stripped PATH, 8.3 short paths, no quotes)                  │
│  C:\PROGRA~1\nodejs\node.exe C:\Users\k1yt\AppData\Roaming\npm\NODE_M~1\      │
│  AGY-TO~1\bin\AGY-TO~1.JS --hook --raw --write-dashboard                      │
└───────────────────────────────────────────────────────────────────────────────┘
        │
        ▼  ONE node process, ONE syncSessions() pass
┌────────────────────────────── agy-tokens ─────────────────────────────────────┐
│ 1. syncSessions()                    incremental cache, <10ms                 │
│ 2. getToday()                        badge data                               │
│ 3. renderRealTimeBadge() + OSC 8     ───────────────► stdout → statusline     │
│ 4. buildDashboardPayload()           today/yesterday/7d/30d + 30-day daily    │
│ 5. writeDashboardFiles()             atomic tmp+rename, throttled ≥2s         │
└───────────────────────────────────────────────────────────────────────────────┘
        │
        ▼  fs write (throttled, atomic)
┌────────────────── ~/.gemini/antigravity-dashboard/ ───────────────────────────┐
│  dashboard.html        static template + embedded initial payload             │
│                        (written by --html; self-healed by --write-dashboard)  │
│  dashboard-data.js     window.__AGY_DASH__ = {...};   ← rewritten by statusline│
│  dashboard-data.json   same payload, for --serve / debugging                  │
└───────────────────────────────────────────────────────────────────────────────┘
        │
        │  Ctrl+Click OSC 8 link in statusline → default browser
        ▼
┌────────────────────────────── browser (file://) ──────────────────────────────┐
│  dashboard.html loads → initial render from embedded payload                  │
│  every 5s: inject <script src="dashboard-data.js?v=<ts>">                     │
│            (fetch() is CORS-blocked on file://; classic scripts are not)      │
│  optional upgrade: EventSource('http://127.0.0.1:8787/events')                │
│            (server sends Access-Control-Allow-Origin: *) → SSE push mode,     │
│            polling paused; on error → fall back to polling                    │
└───────────────────────────────────────────────────────────────────────────────┘
        ▲
        │  SSE push every 5s (only while --serve is running)
┌────────────────────────────── agy-tokens --serve ─────────────────────────────┐
│  http server 127.0.0.1:8787 (core http, zero deps)                            │
│  GET /          → dashboard.html (Cache-Control: no-store)                    │
│  GET /events    → SSE stream; re-aggregates every 5s, pushes payload          │
│  GET /data.json → dashboard-data.json                                         │
└───────────────────────────────────────────────────────────────────────────────┘
```

**Freshness chain:** agy state change → statusline command (runs on every state change) → data files rewritten (throttled to ≥2s) → browser polls every 5s → re-render. Worst-case staleness ≈ 7s in file:// mode, ≈ 5s in SSE mode. No standalone watcher process needed; the statusline script IS the watcher.

### 1.4 FE↔BE Type Definitions (single source of truth)

The payload below is written to `dashboard-data.js` (JSONP-style assignment), `dashboard-data.json`, embedded in `dashboard.html` on generation, and pushed over SSE. One schema, four transports.

```js
// DashboardPayload — root object
{
  version: 1,
  generatedAt: "2026-08-27T12:21:15.000Z",   // ISO 8601
  currency: "usd",                            // from ~/.gemini/antigravity_tokens.json
  lang: "ko",                                 // config.lang or --lang
  isFree: false,                              // config.free / noCost / --free
  model: "gemini-3.7-flash",                  // active model
  summaries: {
    today:     Summary,                       // aggregator.getToday()
    yesterday: Summary,                       // aggregator.getYesterday()
    last7d:    Summary,                       // aggregator.getLastNDays(sessions, 7)
    last30d:   Summary                        // aggregator.getLastNDays(sessions, 30)
  },
  daily: DailyRow[30],                        // last30d.daily, oldest → newest
  cacheStats: { totalSessions, parsedCount, cachedCount, elapsedMs }
}

// Summary — direct output of aggregator (createEmptySummary + period fields)
Summary = {
  totalSessions: number, totalTurns: number,
  inputTokens: number, cachedTokens: number, outputTokens: number,
  totalTokens: number, cacheHitRate: number,   // 0..100
  costUsd: number, cacheSavingsUsd: number,
  period: "today"|"yesterday"|"7d"|"30d",
  dateStr: string | dateRange: string
}

// DailyRow — one row of the 30-day table (same columns as ANSI table)
DailyRow = {
  date: "YYYY-MM-DD", sessions: number, turns: number,
  inputTokens: number, cachedTokens: number, outputTokens: number,
  totalTokens: number, cacheHitRate: number,
  costUsd: number, cacheSavingsUsd: number
}
```

**OSC 8 link format** (terminal side):

```
ESC ] 8 ; ; <uri> ESC \ <label> ESC ] 8 ; ; ESC \
```
- URI built with `require('url').pathToFileURL(dashboardHtmlPath).href` → `file:///C:/Users/k1yt/.gemini/antigravity-dashboard/dashboard.html` (correct percent-encoding for spaces/unicode; current user path has none, but encoding is mandatory per C-safety).
- Label: i18n `dashboardLink` (`Dashboard` / `대시보드` / `ダッシュボード` / `仪表板`).
- Placement: appended as the last segment of the badge, after `Cache: NN%`.

---

## 2. Architecture Decisions

### 2.1 Streaming Mechanism Decision — **HYBRID (recommended)**

**Decision: file:// script-tag polling as the default + optional `--serve` SSE push as opt-in upgrade. The HTML auto-detects the SSE server and upgrades itself.**

| Mode | Transport | Freshness | Background process | Survives reboot |
|---|---|---|---|---|
| Default (file://) | `<script src="dashboard-data.js?v=ts">` injection every 5s | ≤7s | none | yes |
| Opt-in (`--serve`) | SSE push every 5s | ≤5s | one node process | no (user restarts) |

**Rationale:**

1. **Option A as literally specified is broken.** "HTML re-fetches a sibling JSON file via fetch()" fails on `file://` in Chrome/Edge/Firefox: CORS blocks `fetch`/XHR from `file://` pages (origin `null`). The zero-server fix is **script-tag injection polling**: `dashboard-data.js` contains `window.__AGY_DASH__ = {...};` and the page re-injects `<script src="dashboard-data.js?v=<timestamp>">` every 5s. Classic script tags are not subject to CORS, so this works from `file://` in all three browsers. Cache-busting via query string forces re-read.
2. **Option B (SSE) is the only true "streaming"** but requires a background process that dies on reboot and a port that can conflict. As the sole mechanism it would make the dashboard dead-on-arrival after every reboot until the user manually restarts `--serve`.
3. **The statusline script is already the perfect data writer.** It runs on every agy state change, already pays the node.exe spawn cost, and `syncSessions()` is <10ms incremental. Adding a throttled atomic write of a ~30KB file costs ~1-5ms. No standalone watcher process, no new long-running daemon, no reboot fragility.
4. **Hybrid upgrade path is free.** The HTML attempts `EventSource('http://127.0.0.1:8787/events')` on load; the server sends `Access-Control-Allow-Origin: *` (localhost-only, token counts only, no secrets). On `open` → switch to push mode; on `error` → stay in polling mode. The statusline link always points at `file://` (works regardless of server state); the served page is a bonus for users who prefer `http://localhost:8787`.

**Rejected alternatives:** full-page `<meta http-equiv="refresh">` (works, but flickers and rewrites the whole HTML every refresh — heavier writes, worse UX); standalone watcher process (second daemon to manage, duplicates what the statusline already does).

### 2.2 Design Options (mandatory trade-offs)

| | Option | Effort | Risk | Outcome |
|---|---|---|---|---|
| **A (Standard/Right Way)** | **Hybrid: file:// script-tag polling (default) + optional `--serve` SSE push with auto-upgrade** | Medium (2 new modules, 4 modified) | Low-Medium (script-tag polling is proven; SSE is isolated in one module) | Works offline with zero background process; true push streaming available on demand; survives agy updates and reboots |
| B (Practical/Pragmatic) | file:// meta-refresh only: full page reload every N seconds, data embedded in HTML | Low | Low | Simplest possible; but page flicker, full-HTML rewrite per refresh, no push mode, and the statusline writer must rewrite the whole HTML file each time |
| C (Staging/Incremental) | `--serve` SSE only, no file:// mode | Low | Medium (daemon dies on reboot; port conflicts; statusline link breaks whenever server is down) | Fastest to demo true streaming; but violates the "survives reboots" requirement and leaves the dashboard dead without manual restart |

**Recommendation: Option A.** It is the only option that satisfies both user intents simultaneously: "dashboard.html이 실시간 스트리밍이 되도록" (SSE push when `--serve` is on) and "statusline 클릭 → 팝업창" (file:// link that always works, no daemon dependency).

### 2.3 New / Changed Files and Responsibilities

| File | Status | Responsibility |
|---|---|---|
| [`src/html-report.js`](src/html-report.js) | **new** | `buildDashboardPayload(sessions, opts)` → payload per §1.4; `renderDashboardHtml(payload, opts)` → single-file HTML (inline CSS/JS, SVG chart, embedded payload + polling/SSE-upgrade script); `writeDashboardFiles(payload, opts)` → atomic writes of `dashboard.html`, `dashboard-data.js`, `dashboard-data.json`; `ensureDashboardHtml()` → self-heal HTML if missing |
| [`src/serve.js`](src/serve.js) | **new** | `startDashboardServer({port, intervalMs})` → core-http server on 127.0.0.1; routes `/`, `/events` (SSE), `/data.json`; `Access-Control-Allow-Origin: *`; port auto-increment on `EADDRINUSE`; re-aggregates every 5s |
| [`src/osc8.js`](src/osc8.js) | **new** | `formatOsc8Link(uri, label)` → OSC 8 escape pair; `dashboardFileUrl()` → `pathToFileURL` of dashboard.html |
| [`src/index.js`](src/index.js:25) | modify | `parseArgs`: add `--html/--dashboard`, `--serve`, `--port <n>`, `--open`, `--write-dashboard`, `--no-link`, `--refresh <sec>`; `runCli`: html branch, serve branch, hook branch orchestration (single sync pass → badge + optional dashboard write) |
| [`src/hook-handler.js`](src/hook-handler.js:96) | modify | `handlePostInvocation` accepts optional pre-synced `options.sessions` (skips internal `syncSessions` when provided); returns payload data needed by the writer; badge gains optional OSC 8 link segment |
| [`src/formatter.js`](src/formatter.js:618) | modify | `renderRealTimeBadge(badgeData, currency, isFree, link)` — appends `📊 <label>` OSC 8 segment when link provided and not `--no-link`; `renderHelp()` rows for new flags |
| [`src/config.js`](src/config.js:15) | modify | Add `DASHBOARD_DIR` (`~/.gemini/antigravity-dashboard/`), `DASHBOARD_HTML_FILE`, `DASHBOARD_DATA_JS`, `DASHBOARD_DATA_JSON`, `DASHBOARD_DEFAULT_PORT` (8787), `DASHBOARD_WRITE_THROTTLE_MS` (2000) |
| [`src/i18n.js`](src/i18n.js:19) | modify | New keys ×4 locales: `dashboardLink`, `dashboardTitle`, `summaryToday`, `summaryYesterday`, `summary7d`, `summary30d`, `chartTitle`, `tableTitle`, `lastUpdated`, `liveStatus`, `noDataFound` (reuse existing), `openDashboard`, `serveStarted`, `servePortInUse` |
| [`test/run-tests.js`](test/run-tests.js:57) | modify | New suites: 15 (html-report payload + HTML assertions), 16 (osc8 + new parseArgs flags), 17 (serve ephemeral server + SSE handshake, mirroring suite 12's mock-server pattern) |
| [`README.md`](README.md) | modify | Document `--html`, `--serve`, `--write-dashboard`, statusline link snippet |
| [`integrations/skills/usage/SKILL.md`](integrations/skills/usage/SKILL.md:1) | modify (optional) | Mention `agy-tokens --html` / `--serve` as dashboard entry points |
| `integrations/skills/tokens/SKILL.md` | **untouched** | Per user decision (C8) |
| `~/.gemini/antigravity-cli/settings.json` | deploy (user config) | statusLine command gains `--write-dashboard` (8.3 paths preserved) |

### 2.4 CLI Flag Design (consistent with existing flags)

Existing conventions ([`src/index.js`](src/index.js:52)): long `--flag`, valued options accept both `--flag value` and `--flag=value`, aliases via `||`. New flags follow:

| Flag | Alias | Value | Behavior |
|---|---|---|---|
| `--html` | `--dashboard` | — | Generate dashboard files (HTML + data), print HTML path + OSC 8 link. Combine with `--open` to launch browser |
| `--serve` | — | optional port | Start SSE server; `--serve 8787` or `--serve --port 8787`; default 8787, auto-increment on conflict; `--port 0` = random |
| `--port` | — | `<n>` | Port for `--serve` |
| `--open` | — | — | Open dashboard in default browser after `--html`/`--serve` (Windows: `cmd /c start "" <url>`; POSIX: `xdg-open`/`open`) |
| `--write-dashboard` | — | — | Side-effect mode for statusline: write data files (self-heal HTML if missing), no stdout change. Combined with `--hook --raw` |
| `--no-link` | — | — | Suppress OSC 8 link in badge (plain text `📊 Dashboard` remains) |
| `--refresh` | — | `<sec>` | Polling interval embedded in HTML (default 5s) |

**Statusline command (settings.json, 8.3 paths, no quotes):**
```
C:\PROGRA~1\nodejs\node.exe C:\Users\k1yt\AppData\Roaming\npm\NODE_M~1\AGY-TO~1\bin\AGY-TO~1.JS --hook --raw --write-dashboard
```
Badge output: `⚡ [Antigravity] Turn: 20 ($0.0015) | Today: 13.28M ($1.42) | Cache: 98% | 📊 Dashboard` (last segment OSC 8-linked).

### 2.5 Edge Cases

| # | Edge case | Handling |
|---|---|---|
| E1 | First run, no data | Payload with zeroed summaries + empty daily; HTML renders empty state using existing `noDataFound` i18n; data files still written so polling never 404s |
| E2 | Windows file locking (browser reading while writer renames) | Atomic tmp+rename (same as `saveCache`); on `renameSync` failure (EPERM/EBUSY), retry once after 100ms, then fall back to direct write. `~/.gemini` is local (not OneDrive-synced), so OneDrive lock issues do not apply |
| E3 | Multiple agy instances writing simultaneously | Atomic rename = last-writer-wins; readers never see partial JSON; 2s throttle bounds write frequency; no lock file needed |
| E4 | Browser caching of dashboard-data.js | Script-tag injection appends `?v=<Date.now()>` cache-buster; `--serve` responses carry `Cache-Control: no-store` |
| E5 | Port conflict on `--serve` | `EADDRINUSE` → increment port (8788, 8789, ... up to 10 tries), print actual URL; `--port 0` for random |
| E6 | Terminal without OSC 8 | Escape sequences ignored by terminal → plain text `📊 Dashboard` remains readable; `--no-link` and `NO_COLOR`/`TERM=dumb` detection disable the link entirely |
| E7 | file:// URL with spaces/unicode | `pathToFileURL()` percent-encodes; current home path has no spaces but encoding is unconditional |
| E8 | cmd /c stripped PATH | Command uses 8.3 paths (established fact #3); `--write-dashboard` resolves `~/.gemini` via `os.homedir()` inside node, not via shell |
| E9 | fetch() blocked on file:// | Never used; script-tag injection only (C3) |
| E10 | SSE CORS from file:// page | Server sends `Access-Control-Allow-Origin: *`; EventSource from origin `null` then connects; on failure the page silently stays in polling mode |
| E11 | Free quota mode | Payload carries `isFree`; HTML renders `freeCostLabel` and zeroes cost columns, mirroring [`src/index.js`](src/index.js:324) JSON-mode behavior |
| E12 | i18n key drift | Test suite 3 enforces en/ko/ja/zh parity; new keys added to all 4 dictionaries in the same batch (C7) |
| E13 | HTML missing but statusline writing | `--write-dashboard` self-heals: if `dashboard.html` absent, generate it once (template is static; only data files are rewritten thereafter) |
| E14 | agy auto-update replaces binary | All artifacts live in `~/.gemini/` + npm-global shims; nothing under `C:\Users\k1yt\AppData\Local\agy\**` (established fact #2) |

### 2.6 Dependency Analysis

- **Zero new dependencies.** Node core only: `fs`, `http`, `path`, `os`, `url`. `pathToFileURL` available since Node 10; `package.json` engines `>=16.0.0` ([`package.json`](package.json:33)) — satisfied.
- **Intra-repo coupling:** `html-report.js` → `aggregator`, `config`, `i18n` (read-only). `serve.js` → `html-report`, `cache-manager`, `aggregator`. `index.js` → all. No cycles: `html-report` and `serve` never import `index` or `hook-handler`.
- **No changes** to `aggregator.js`, `cache-manager.js`, `log-parser.js`, `tokenizer.js`, `price-syncer.js`, `bin/agy-tokens.js`, `bin/agy-tools.js`.

### 2.7 Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| agy statusline renderer strips OSC 8 (changelog says command output supports it, but statusline is a distinct render path) | Medium | Plain-text label survives stripping; verify live after deploy; fallback: link only in hook badge (`--hook` JSON) where OSC 8 is confirmed |
| Script-tag polling blocked by some future browser policy | Low | Meta-refresh fallback embedded in HTML (one-line toggle); SSE mode unaffected |
| Statusline write frequency during streaming output | Low | 2s throttle + content-hash skip (write only when payload changed) |
| SSE server left running consumes a port | Low | Binds 127.0.0.1 only; auto-increment on conflict; documented `Ctrl+C` stop |

---

## 3. Implementation Plan

### 3.1 Task Breakdown (ordered batches, ≤2 files each)

**Prerequisites for all batches:** Node ≥16, zero npm installs. Test command for every batch: `node test/run-tests.js` (the project's only suite; `npm test` aliases it).

| Batch | Files | Content | Verification |
|---|---|---|---|
| **B1** | [`src/config.js`](src/config.js:15) + [`src/i18n.js`](src/i18n.js:19) | Dashboard path constants (§2.3) + new translation keys ×4 locales | `node test/run-tests.js` — suite 3 (i18n parity) + suite 2 (config) must stay green |
| **B2** | [`src/osc8.js`](src/osc8.js) (new) + [`src/formatter.js`](src/formatter.js:618) | OSC 8 formatter + `pathToFileURL` helper; `renderRealTimeBadge` optional link param; `renderHelp` rows | `node test/run-tests.js` — suite 7/8 (badge) green; manual: `node bin/agy-tokens.js --hook --raw` still single-line |
| **B3** | [`src/html-report.js`](src/html-report.js) (new) | Payload builder, HTML template (summary cards, 30-day table, SVG chart, polling + SSE-upgrade script), atomic writers, `ensureDashboardHtml` | `node test/run-tests.js` green; manual: `node bin/agy-tokens.js --html` → 3 files exist in `~/.gemini/antigravity-dashboard/`, open HTML in browser |
| **B4** | [`src/index.js`](src/index.js:25) + [`src/hook-handler.js`](src/hook-handler.js:96) | New flags in `parseArgs`; html/serve/write-dashboard branches in `runCli`; hook branch single-sync-pass orchestration | `node test/run-tests.js` — suite 9 (parseArgs) green; manual: `node bin/agy-tokens.js --hook --raw --write-dashboard` → badge + data file mtime updated |
| **B5** | [`src/serve.js`](src/serve.js) (new) | SSE server (routes `/`, `/events`, `/data.json`; ACAO `*`; port auto-increment; 5s re-aggregation) | `node test/run-tests.js` green; manual: `node bin/agy-tokens.js --serve --port 0` → prints URL; `curl http://127.0.0.1:<port>/events` streams |
| **B6** | [`test/run-tests.js`](test/run-tests.js:57) | Suites 15 (html-report), 16 (osc8 + new flags), 17 (ephemeral SSE server, mirroring suite 12 pattern) | `node test/run-tests.js` — all suites green, exit 0 |
| **B7** (docs, optional) | [`README.md`](README.md) + [`integrations/skills/usage/SKILL.md`](integrations/skills/usage/SKILL.md:1) | Document new flags + statusline snippet | `node test/run-tests.js` — suite 10 (SKILL.md frontmatter) green |
| **B8** (deploy, user config) | `~/.gemini/antigravity-cli/settings.json` | statusLine command → `...AGY-TO~1.JS --hook --raw --write-dashboard` (8.3 paths, no quotes); one-time `agy-tokens --html` | Restart agy → badge shows `📊 Dashboard`; Ctrl+Click opens dashboard; watch data refresh after next turn |

**Dependency order:** B1 → B2, B3 (parallel) → B4 → B5 → B6 → B7 → B8. B3 requires B1 (paths); B4 requires B1–B3; B5 requires B1+B3 (payload builder); B6 requires all.

### 3.2 Verification & Test Protocol (per batch)

- **Existing suite coverage:** `node test/run-tests.js` — suites 2 (config), 3 (i18n parity), 7/8 (formatter/badge), 9 (parseArgs), 10 (SKILL.md/hooks.json integrity) cover all modified modules. No new test framework; extend the same zero-dep runner.
- **New tests:** suites 15–17 added in B6, but each batch's manual CLI check (above) is the gate for advancing.
- **Performance gate:** `node bin/agy-tokens.js --hook --raw --write-dashboard` measured with `Measure-Command` (PowerShell) — script work must be <20ms after node startup (startup cost unchanged from current working setup).
- **Live gate (B8):** restart agy, confirm badge renders with link, Ctrl+Click opens dashboard, data refreshes within ~7s after the next turn.

---

## Report Metadata

- **Report Folder:** docs/260827_0001_session_usage-dashboard-integration/
- **Affected repo files (planned):** src/config.js, src/i18n.js, src/osc8.js (new), src/formatter.js, src/html-report.js (new), src/index.js, src/hook-handler.js, src/serve.js (new), test/run-tests.js, README.md, integrations/skills/usage/SKILL.md
- **Untouched:** integrations/skills/tokens/SKILL.md, src/aggregator.js, src/cache-manager.js, src/log-parser.js, bin/*
- **User config (deploy):** ~/.gemini/antigravity-cli/settings.json (statusLine command only)
