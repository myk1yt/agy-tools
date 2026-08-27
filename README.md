# ⚡ Antigravity CLI Developer Toolkit (`agy-tools`)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-0%20(Pure%20Node.js)-brightgreen.svg)](#zero-dependency-architecture)
[![Node.js Version](https://img.shields.io/badge/Node.js-%3E%3D16.0.0-green.svg)](https://nodejs.org)
[![i18n Supported](https://img.shields.io/badge/i18n-21%20Languages-orange.svg)](#internationalization-i18n)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](#installation)

**Antigravity Developer Toolkit (`agy-tools`)** is a zero-dependency CLI suite for **Antigravity CLI**. Its flagship **agy-tokens** command is a **statusline-powered real-time token dashboard**. Zero agy modification: one `statusLine` entry in `~/.gemini/antigravity-cli/settings.json` is the ONLY integration point — providing real-time token tracking, prompt cache hit rate analytics, and exact API cost breakdowns across Gemini 3.7 Flash/Pro and Claude 3.7 Sonnet workflows.

---

## 🌟 Key Features

- ⚡ **Zero External Dependencies**: Built 100% on native Node.js core modules (`fs`, `path`, `readline`, `os`, `crypto`, `util`). No `node_modules` required.
- 🎯 **High-Precision Subword BPE Tokenizer**: Accurately tokenizes and estimates consumption across programming languages (Dart, Python, JavaScript/TypeScript, Rust, Go, C++, SQL) and human languages (English, Korean, Japanese, Chinese).
- 🚀 **Sub-10ms Incremental Cache Engine**: Uses atomic JSON cache (`~/.gemini/token_tracker_cache.json`) with file `mtime` change detection to parse hundreds of conversation transcripts in milliseconds.
- 📊 **Rich ANSI Terminal Dashboard & Summary Cards**: Visual status cards, formatted daily breakdown tables with cache hit percentages, and turn-by-turn session inspection.
- 🌐 **Full Multi-Language (i18n) Support**: Native auto-locale detection with manual `--lang` override supporting 21 languages: English, Korean, Japanese, Chinese (Simplified & Traditional), Hindi, Vietnamese, Indonesian, Thai, German, French, Spanish, Portuguese, Italian, Dutch, Polish, Swedish, Russian, Arabic, Hebrew, and Turkish. RTL support for Arabic and Hebrew.
- 💱 **Multi-Currency Converter**: Real-time conversion to `USD ($)`, `KRW (₩)`, `JPY (¥)`, `EUR (€)`, and `GBP (£)`.
- 🔗 **Statusline-Only Integration**: One `statusLine` entry in `~/.gemini/antigravity-cli/settings.json` — nothing inside agy is modified. The badge refreshes the browser dashboard data on every state change via `--write-dashboard` (inside VS Code terminals, a tiny local dashboard server is auto-started on demand — see [Dashboard Link](#-dashboard-link-osc-8) below).
- 🔒 **100% Privacy Preserving**: Zero network telemetry. All parsing and aggregation executes strictly on your local machine.

---

## 🏗 Architecture Overview

```
                           ┌───────────────────────────────┐
                           │   Antigravity CLI Session     │
                           │   (~/.gemini/antigravity-cli) │
                           └───────────────┬───────────────┘
                                           │
                        ┌──────────────────┴──────────────────┐
                        ▼                                     ▼
             ┌─────────────────────┐               ┌─────────────────────┐
             │ transcript.jsonl    │               │    history.jsonl    │
             │ (Turn-by-turn logs) │               │ (Session metadata)  │
             └──────────┬──────────┘               └──────────┬──────────┘
                        │                                     │
                        └──────────────────┬──────────────────┘
                                           ▼
                           ┌───────────────────────────────┐
                           │   Log Parser (src/log-parser) │
                           │   - BPE Tokenizer             │
                           │   - Prompt Cache Calculation  │
                           └───────────────┬───────────────┘
                                           ▼
                           ┌───────────────────────────────┐
                           │ Incremental Cache Manager     │
                           │ (~/.gemini/token_tracker_cache│
                           └───────────────┬───────────────┘
                                           ▼
                           ┌───────────────────────────────┐
                           │ Aggregator (src/aggregator)   │
                           │ (Today / 7d / 30d / Range)    │
                           └───────────────┬───────────────┘
                                           ▼
                 ┌─────────────────────────┴─────────────────────────┐
                 ▼                                                   ▼
   ┌───────────────────────────┐                       ┌───────────────────────────┐
   │ Terminal Formatter (ANSI) │                       │ Statusline Badge (--hook) │
   │ - Summary Cards & Tables  │                       │ ⚡ [Turn: 1.2k | Today:..]│
   └───────────────────────────┘                       └───────────────────────────┘
```

---

## 📦 Installation

### Option 1: Global NPM Link (Recommended)

```bash
git clone https://github.com/myk1yt/agy-tools.git
cd agy-tools
npm link
```

### Option 2: One-Click Installer Scripts

**On Windows (Command Prompt / PowerShell):**
```cmd
scripts\install.bat
```

**On Linux / macOS:**
```bash
chmod +x scripts/install.sh
./scripts/install.sh
```

---

## 🚀 CLI Commands & Usage

All commands can be invoked using `agy-tools`, `agy-dashboard`, or `agy-tokens`.

### 1. Daily Usage Summary (Default)
```bash
agy-tools
# or:
agy-tools dashboard
# or:
agy-dashboard
# or:
agy-tokens
```

**Sample Output:**
```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  ⚡ Antigravity Token & Cost Tracker  High-Precision Token Analytics┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃  Period: Today (2026-08-27)  |  Active Model: Gemini 3.7 Flash     ┃
┃  Currency: USD ($)  |  Locale: EN                                  ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

┌─────────────────────────────────┐  ┌─────────────────────────────────┐
│ Total Tokens                    │  │ Total Estimated Cost            │
│ 3,080,080 (3.08M)               │  │ $0.577 (Cache Savings: $0.246)  │
├─────────────────────────────────┤  ├─────────────────────────────────┤
│ Input Tokens: 91,800            │  │ Total Sessions: 25              │
│ Cached Tokens: 2,185,527        │  │ Total Turns: 1,835              │
│ Output Tokens: 802,753          │  │ Avg Tokens / Turn: 1.7k         │
│ Cache Hit Rate: 96.0%           │  │ Cache Savings: $0.246           │
└─────────────────────────────────┘  └─────────────────────────────────┘
```

### 2. 7-Day & 30-Day Breakdown Table
```bash
# 7-day breakdown in Korean Won (KRW)
agy-tools dashboard --7d --currency krw

# 30-day breakdown in US Dollars
agy-tools dashboard --30d --currency usd
```

**Sample Table:**
```
┌────────────┬──────┬──────┬──────────┬──────────┬─────────┬───────────┬────────┬───────────┬──────────┐
│    Date    │Sess. │Turns │  Input   │  Cached  │ Output  │   Total   │ Cache% │   Cost    │ Savings  │
├────────────┼──────┼──────┼──────────┼──────────┼─────────┼───────────┼────────┼───────────┼──────────┤
│ 2026-08-25 │    45│  2938│    185.9k│     4.23M│    1.43M│      5.84M│     96%│     ₩1,511│      ₩689│
│ 2026-08-26 │    31│  3151│    143.3k│    11.86M│    1.38M│     13.38M│     99%│     ₩1,875│    ₩1,934│
│ 2026-08-27 │    25│  1829│     91.8k│     2.19M│   800.8k│      3.08M│     96%│       ₩836│      ₩357│
├────────────┼──────┼──────┼──────────┼──────────┼─────────┼───────────┼────────┼───────────┼──────────┤
│ GRAND TOTAL│   187│ 17051│    841.1k│    33.80M│    7.88M│     42.52M│     98%│     ₩8,878│    ₩5,513│
└────────────┴──────┴──────┴──────────┴──────────┴─────────┴───────────┴────────┴───────────┴──────────┘
```

### 3. Custom Date Range Aggregation
```bash
agy-tools dashboard --range 2026-08-01..2026-08-27 --currency eur
```

### 4. Turn-by-Turn Session Drilldown
```bash
# Inspect the most recent active session
agy-tools dashboard --session

# Inspect a specific session ID
agy-tools dashboard --session 0048f579
```

### 5. Multi-Language CLI Output
```bash
agy-tools dashboard --7d --lang ko
agy-tools dashboard --today --lang ja
agy-tools dashboard --30d --lang zh
```

### 6. Programmatic JSON Output
```bash
agy-tools dashboard --today --json
```

### 7. Real-Time Statusline Badge (`--hook`)
```bash
# Statusline payload consumed by the agy statusline runner (JSON with injectSteps)
agy-tokens --hook
# Output: {"injectSteps":[{"ephemeralMessage":"⚡ [Antigravity] Turn: 1.8k ($0.0003) | Today: 64.2k ($0.0096) | Cache: 74%"}]}

# Raw terminal string output (without JSON wrapper) — what the statusline displays
agy-tokens --hook --raw
# Output: ⚡ [Antigravity] Turn: 1.8k ($0.0003) | Today: 64.2k ($0.0096) | Cache: 74% | 📊 Dashboard
```

### 8. Self-Refreshing HTML Dashboard (`--html`)
```bash
# Generate dashboard files (HTML + data) and print the file:// link
agy-tokens --html

# Generate and open in the default browser
agy-tokens --html --open
```
Writes to `~/.gemini/antigravity-dashboard/`:
- `dashboard.html` — single-file offline dashboard (inline CSS/JS, SVG chart, no CDN)
- `dashboard-data.js` — JSONP-style payload (`window.__AGY_DASH__ = {...};`)
- `dashboard-data.json` — same payload as JSON

The page auto-refreshes every 5 seconds via `<script src="dashboard-data.js?v=ts">`
injection polling (works from `file://` where `fetch()` is CORS-blocked), and
auto-upgrades to SSE push when the optional server below is running.

### 9. SSE Push Server (`--serve`)
```bash
# Start the local streaming server (default port 8787, auto-increments on conflict)
agy-tokens --serve

# Custom / random port
agy-tokens --serve --port 9000
agy-tokens --serve --port 0

# Start and open the browser
agy-tokens --serve --open
```
Routes: `GET /` (dashboard, `Cache-Control: no-store`), `GET /events` (SSE push
every 5s), `GET /data.json`. Binds **127.0.0.1 only** — token usage data never
leaves your machine. Stop with `Ctrl+C`.

### 10. Statusline Dashboard Side Effect (`--write-dashboard`)
```bash
agy-tokens --hook --raw --write-dashboard
```
Prints the same single-line badge AND rewrites the dashboard data files in the
same process (one `syncSessions()` pass shared by both — no double parsing).
The dashboard HTML self-heals if missing. This is the flag that makes the
statusline the real-time data writer for the browser dashboard.

### 11. Dashboard Filters (Date Range & Model)
The HTML dashboard includes interactive filters above the Models section:
- **Date filter**: Today / Yesterday / Last 7 Days / Last 30 Days / Custom date range
- **Model filter**: Checkboxes for each model appearing in the data
- Filters apply to both the Models table and Daily Detail table simultaneously
- Default: 30 days + all models selected
- Filter state persists across SSE/poll updates

---

## 🎛 Command Line Options Reference

| Option | Shorthand | Description |
| :--- | :--- | :--- |
| `--today` | `-t` | Show today's usage summary *(default)* |
| `--yesterday` | `-y` | Show yesterday's usage summary |
| `--7d`, `--week` | | Show 7-day daily breakdown table and grand total |
| `--30d`, `--month` | | Show 30-day daily breakdown table and grand total |
| `--range <start..end>` | | Show aggregation for custom date range (`YYYY-MM-DD..YYYY-MM-DD`) |
| `--session [id]` | `-s` | Show turn-by-turn table for latest or specified conversation ID |
| `--all` | `-a` | Show full historical breakdown across all recorded sessions |
| `--currency <code>` | | Select display currency (`usd`, `krw`, `jpy`, `eur`, `gbp`) |
| `--lang <code>` | | Select interface language (21 languages: `en`, `ko`, `ja`, `zh`, `zh-TW`, `hi`, `vi`, `id`, `th`, `de`, `fr`, `es`, `pt`, `it`, `nl`, `pl`, `sv`, `ru`, `ar`, `he`, `tr`) |
| `--model <name>` | | Override model pricing (`gemini-3.7-flash`, `claude-3.7-sonnet`, etc.) |
| `--hook`, `--badge` | | Output the statusline badge payload (JSON, or raw string with `--raw`) |
| `--raw` | | Output raw badge string without PostInvocation JSON wrapper |
| `--json` | | Output pure JSON for programmatic integration |
| `--fresh`, `--no-cache` | | Force full re-parsing of transcript files |
| `--prices`, `--models` | | Display official API pricing catalog table for all `/model` choices |
| `--sync`, `--sync-prices` | | Synchronize latest official API pricing catalog from remote repo |
| `--auto-sync` | | Auto-sync pricing if older than 24 hours |
| `--html`, `--dashboard` | | Generate self-refreshing HTML dashboard (summary cards + 30-day table + SVG chart) |
| `--serve [port]` | | Start local SSE dashboard server (default 8787, auto-increments on conflict) |
| `--port <n>` | | Port for `--serve` (`0` = random) |
| `--open` | | Open dashboard in default browser after `--html` / `--serve` |
| `--write-dashboard` | | Write dashboard data files as a statusline side effect (single sync pass) |
| `--no-link` | | Suppress the clickable dashboard link in the statusline badge |
| `--refresh <sec>` | | Dashboard polling interval in seconds (default 5) |
| `--no-color` | | Disable ANSI terminal colors |
| `--help` | `-h` | Display help screen |
| `--version` | `-v` | Display version number |

---

## 💰 Supported Models & Pricing Tiers

Pricing is configured per **1,000,000 tokens (USD)**:

| Model Identifier | Input / 1M | Cached Input / 1M | Output / 1M |
| :--- | :---: | :---: | :---: |
| **Gemini 3.7 Flash** | `$0.1500` | `$0.0375` *(75% off)* | `$0.6000` |
| **Gemini 2.5 Flash** | `$0.1500` | `$0.0375` *(75% off)* | `$0.6000` |
| **Gemini 2.5 Pro** | `$1.2500` | `$0.3125` *(75% off)* | `$5.0000` |
| **Claude 3.7 Sonnet** | `$3.0000` | `$0.3000` *(90% off)* | `$15.0000` |

*Custom pricing and currency exchange rates can be defined in `~/.gemini/antigravity_tokens.json`.*

---

## 🔗 Statusline Integration — The ONLY Integration Point

**agy-tokens = statusline-powered real-time token dashboard. Zero agy modification: one `statusLine` entry in `~/.gemini/antigravity-cli/settings.json` is the ONLY integration point.**

Add (or merge) this entry into `~/.gemini/antigravity-cli/settings.json` manually — the installer scripts print these instructions instead of editing your config:

```json
"statusLine": {
  "type": "command",
  "command": "C:\\PROGRA~1\\nodejs\\node.exe C:\\Users\\k1yt\\AppData\\Roaming\\npm\\NODE_M~1\\AGY-TO~1\\bin\\AGY-TO~1.JS --hook --raw --write-dashboard",
  "enabled": true,
  "stack_with_default": true
}
```

- The command uses **8.3 short paths with no inner quotes** so it survives cmd.exe parsing and npm global-path changes (`NODE_M~1` = `node_modules`, `AGY-TO~1` = the `agy-tools` package). Adjust the short paths if your Node/npm install locations differ (`dir /x` shows them).
- The statusline script receives the session JSON state on stdin and prints a one-line `⚡ [Antigravity]` badge ending with a clickable `📊 Dashboard` segment (OSC 8 hyperlink; Ctrl+Click opens the dashboard in your browser — degrades to plain text on terminals without OSC 8, or use `--no-link` to suppress).
- **VS Code terminals**: VS Code routes `file://` OSC 8 links to the editor by design, so inside VS Code (`TERM_PROGRAM=vscode`) the badge links to the local **http** dashboard (`http://127.0.0.1:8787/`) instead. The server is auto-started in the background on first render (`node agy-tokens --serve`, binds **127.0.0.1 only**, re-aggregates every 5s) and discovered via `~/.gemini/antigravity-dashboard/dashboard-server.json`; outside VS Code the badge keeps the `file://` dashboard link. Set `AGY_TOKENS_LINK_MODE=file|http` to force a mode, or `--no-link` to suppress the segment entirely.
- `--write-dashboard` rewrites the dashboard data files on **every state change** — more often than any lifecycle event — so the browser dashboard stays live with zero background processes. Run `agy-tokens --html` once to generate the initial dashboard.
- Restart agy after saving `settings.json` to see the badge.

---

## 🧪 Running Tests

Execute the comprehensive zero-dependency test suite:

```bash
npm test
# or
node test/run-tests.js
```

---

## 🗺️ Roadmap

- [x] **v1.0.0**: High-precision subword BPE token estimation, incremental caching, ANSI terminal dashboard, multi-currency & i18n support.
- [x] **v3.0.0**: i18n expansion to 21 languages (including RTL support for Arabic/Hebrew), dashboard date-range and model filters with client-side filtering.
- [ ] **v1.1.0**: Interactive full-screen TUI mode with real-time log tailing and session switching.
- [ ] **v1.2.0**: Context window utilization heatmaps and long-context cost optimization suggestions.
- [ ] **v1.3.0**: Multi-workspace quota tracking and automated budget threshold alerts.
- [ ] **v1.4.0**: Custom LLM provider plugins (OpenAI, DeepSeek, local Ollama endpoints).

---

## 📄 License

MIT License © 2026 kim,yong-tai. See [LICENSE](LICENSE) for details.
