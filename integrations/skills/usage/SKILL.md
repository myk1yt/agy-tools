---
name: usage
description: >-
  Provides real-time token tracking, cache hit rate analytics, and API cost breakdown for Antigravity conversations. Activate this skill whenever the user asks about token consumption, costs, API usage, or enters /usage, /tokens, or /cost.
---

# `/usage` Skill - Antigravity Token & Cost Analytics

Provides real-time token tracking, cache hit rate analytics, and API cost breakdown directly within Antigravity conversations.

## When to Activate
Activate this skill whenever:
- The user asks about token consumption, token counts, cache savings, or API billing costs.
- The user issues commands like `/usage`, `/tokens`, `/cost`, `/stats`, or `/dashboard`.
- The user asks for daily, 7-day, 30-day, or conversation session breakdown.

## Instructions
1. Run `agy-tokens` (or `agy-tools dashboard`) via `run_command` to retrieve live token and cost metrics.
2. Select the appropriate flag based on user intent:
   - **Today's Summary**: `agy-tokens` or `agy-tools dashboard --today`
   - **7-Day Trend**: `agy-tokens --7d`
   - **30-Day Trend**: `agy-tokens --30d`
   - **Custom Range**: `agy-tokens --range YYYY-MM-DD..YYYY-MM-DD`
   - **Current / Specific Session**: `agy-tokens --session` or `agy-tokens --session <sessionId>`
   - **Currency Preference**: `--currency krw` / `--currency usd` / `--currency eur` / `--currency jpy`
   - **Language Localization**: `--lang ko` / `--lang en` / `--lang ja` / `--lang zh`
   - **Subscription / Free Quota Mode**: `--free` (suppresses dollar cost calculation)
   - **Live Pricing Catalog**: `agy-tools prices`
3. Render the output directly in the conversation or format key highlights (Total Tokens, Cache Hit %, Estimated Cost, Cache Savings) clearly for the user.

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

## Metrics Guide
- **Input Tokens**: Fresh prompt tokens sent to the model (user prompt + tool outputs + un-cached context).
- **Cached Tokens**: Prompt tokens served from Antigravity / Gemini / Claude prompt cache (billed at 75%-90% discount).
- **Output Tokens**: Generated model tokens (thoughts + tool calls + text).
- **Cache Hit %**: Percentage of total prompt context fulfilled by prompt caching.
- **Estimated Cost**: Total calculated API cost based on the active model's pricing tier.
- **Cache Savings**: Theoretical dollar amount saved thanks to prompt caching.
