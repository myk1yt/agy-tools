---
name: tokens
description: >-
  Provides real-time token tracking, cache hit rate analytics, and API cost breakdown for Antigravity conversations. Activate this skill whenever the user enters /tokens, /cost, or /dashboard, or asks about token consumption, costs, or API usage. This is the working slash-command entry point for the token dashboard (the built-in /usage command is reserved by agy for the quota panel).
---

# Token & Cost Analytics Skill (`tokens`)

Provides real-time token tracking, cache hit rate analytics, and API cost breakdown directly within Antigravity conversations.

> ⚠️ **NOTE — Slash Command Precedence**
> `/usage` is a **built-in agy system command** (model quota panel) and cannot trigger a skill. This `tokens` skill provides the working slash triggers: **`/tokens`**, **`/cost`**, **`/dashboard`** — plus natural language such as "오늘 토큰 사용량 알려줘" or "how many tokens did I use today?".

## When to Activate
Activate this skill whenever:
- The user enters `/tokens`, `/cost`, `/dashboard`, or `/stats`.
- The user asks about token consumption, token counts, cache savings, or API billing costs.
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
   - **Instant Dashboard**: `agy-tokens --today` (same as bare `agy-tokens`)
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

### 4b. Instant Dashboard (alias)
```bash
agy-tokens --today
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

## Metrics Guide
- **Input Tokens**: Fresh prompt tokens sent to the model (user prompt + tool outputs + un-cached context).
- **Cached Tokens**: Prompt tokens served from Antigravity / Gemini / Claude prompt cache (billed at 75%-90% discount).
- **Output Tokens**: Generated model tokens (thoughts + tool calls + text).
- **Cache Hit %**: Percentage of total prompt context fulfilled by prompt caching.
- **Estimated Cost**: Total calculated API cost based on the active model's pricing tier.
- **Cache Savings**: Theoretical dollar amount saved thanks to prompt caching.