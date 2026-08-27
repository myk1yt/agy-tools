# `/usage` Skill - Antigravity Token & Cost Analytics

Provides real-time token tracking, cache hit rate analytics, and API cost breakdown directly within Antigravity conversations.

## Description
When the user asks about token consumption, costs, API usage, or executes the `/usage` command, run `agy-tokens` to generate structured analytics.

## Triggers & Keywords
- `/usage`
- `/tokens`
- `/cost`
- "How many tokens did we use today?"
- "What is our estimated API cost this week?"
- "Show conversation token breakdown"

## Execution Syntax

### 1. Quick Daily Check
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
# Latest session
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

## Metrics Explanation
- **Input Tokens**: Fresh prompt tokens sent to the model (user prompt + tool outputs + un-cached context).
- **Cached Tokens**: Prompt tokens served from Antigravity / Gemini / Claude prompt cache (billed at 75%-90% discount).
- **Output Tokens**: Generated model tokens (thoughts + tool calls + text).
- **Cache Hit %**: Percentage of total prompt context fulfilled by prompt caching.
- **Estimated Cost**: Total calculated API cost based on the active model's pricing tier.
- **Cache Savings**: Theoretical dollar amount saved thanks to prompt caching.
