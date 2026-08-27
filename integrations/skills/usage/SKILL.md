---
name: usage
description: >-
  Provides real-time token tracking, cache hit rate analytics, and API cost breakdown for Antigravity conversations. Activate this skill whenever the user asks about token consumption, costs, API usage, or enters /tokens, /cost, or /dashboard. NOTE: /usage is a built-in agy system command (quota panel) and CANNOT trigger this skill. Use /tokens, /cost, or /dashboard instead.
---

# Token & Cost Analytics Skill (`usage`)

Provides real-time token tracking, cache hit rate analytics, and API cost breakdown directly within Antigravity conversations.

> ⚠️ **IMPORTANT — Slash Command Precedence**
> `/usage` is a **built-in agy system command** (model quota panel: Gemini/Claude weekly + 5-hour limits) and **CANNOT trigger this skill**.
> The working slash triggers for this skill are: **`/tokens`**, **`/cost`**, **`/dashboard`** — plus natural language such as "오늘 토큰 사용량 알려줘" or "how many tokens did I use today?".

## When to Activate
Activate this skill whenever:
- The user asks about token consumption, token counts, cache savings, or API billing costs.
- The user issues commands like `/tokens`, `/cost`, `/dashboard`, or `/stats`.
- The user asks for daily, 7-day, 30-day, or conversation session breakdown.

## Instructions

**MANDATORY: never answer from memory; always execute the command.** Token metrics change every minute — any answer not produced by a live `run_command` execution is wrong.

1. **FIRST action** — run the token dashboard via `run_command`:
   ```bash
   agy-tokens
   ```
   If `agy-tokens` is not found on PATH, fall back to the repo-local entry point:
   ```bash
   node "C:/Users/k1yt/OneDrive/Projects/Antigravity-cli/bin/agy-tokens.js"
   ```
2. Select additional flags based on user intent (combine with the command above):
   - **7-Day Trend**: `agy-tokens --7d`
   - **30-Day Trend**: `agy-tokens --30d`
   - **Custom Range**: `agy-tokens --range YYYY-MM-DD..YYYY-MM-DD`
   - **Current / Specific Session**: `agy-tokens --session` or `agy-tokens --session <sessionId>`
   - **Currency Preference**: `--currency krw` / `--currency usd` / `--currency eur` / `--currency jpy`
   - **Language Localization**: `--lang ko` / `--lang en` / `--lang ja` / `--lang zh`
   - **Subscription / Free Quota Mode**: `--free` (suppresses dollar cost calculation)
   - **Live Pricing Catalog**: `agy-tools prices`
3. **Render the raw command output VERBATIM inside a fenced code block** so the box-drawing dashboard (┌─│└ characters) displays correctly in chat. Do not paraphrase, summarize away, or reformat the table. You may add 1-2 sentences of highlights after the block (Total Tokens, Cache Hit %, Estimated Cost, Cache Savings).

## Execution Examples

### 1. Quick Daily Usage Check
```bash
agy-tokens
```
Outputs today's total tokens, cached tokens, generation tokens, cache hit rate %, and estimated cost.

### 2. 7-Day & 30-Day Trend Breakdown
```bash
agy-tokens --7d
agy-tokens --30d --currency krw
```

### 3. Custom Date Range
```bash
agy-tokens --range 2026-08-01..2026-08-27 --currency eur
```

### 4. Turn-by-Turn Conversation Drilldown
```bash
# Latest active session
agy-tokens --session

# Specific session ID
agy-tokens --session <session-id>
```

### 5. Multi-Language Output
```bash
agy-tokens --7d --lang ko
agy-tokens --today --lang ja
agy-tokens --30d --lang zh
```

### 6. Machine-Readable JSON for Scripts
```bash
agy-tokens --today --json
```

### 7. Browser Dashboard (Real-Time HTML)
```bash
# Generate the self-refreshing dashboard and print its file:// link
agy-tokens --html

# Generate and open it in the default browser
agy-tokens --html --open

# Optional: true SSE push streaming server (127.0.0.1 only)
agy-tokens --serve
```
Use when the user wants a visual dashboard in the browser: summary cards (Today / Yesterday / 7-day / 30-day), a 30-day daily breakdown table, and an SVG trend chart. The page auto-refreshes every 5 seconds; the statusline badge's `📊 Dashboard` segment (Ctrl+Click) opens the same file.

## Metrics Guide
- **Input Tokens**: Fresh prompt tokens sent to the model (user prompt + tool outputs + un-cached context).
- **Cached Tokens**: Prompt tokens served from Antigravity / Gemini / Claude prompt cache (billed at 75%-90% discount).
- **Output Tokens**: Generated model tokens (thoughts + tool calls + text).
- **Cache Hit %**: Percentage of total prompt context fulfilled by prompt caching.
- **Estimated Cost**: Total calculated API cost based on the active model's pricing tier.
- **Cache Savings**: Theoretical dollar amount saved thanks to prompt caching.