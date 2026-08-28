# Requirement Checklist
## Task: Master Hotfix & Refactor - Statusline Stabilization, Turn-Level Model Attribution, Cost Calculation, Dynamic Y-Axis Chart
## Date: 260828

### PART 1. Statusline Fail-Safe (exit status 1 Root Fix)
- [ ] REQ-001a: `src/hook-handler.js` - Add permanent no-op `error` listener on `process.stdin` after timeout to prevent EPIPE/ECONNRESET crashes
- [ ] REQ-001b: `src/dashboard-link.js` - `atomicWriteJson` tmp filename includes PID (`.${Date.now()}.${process.pid}.tmp`) for uniqueness
- [ ] REQ-001c: `src/html-report.js` - `atomicWriteFile` tmp filename includes PID for uniqueness
- [ ] REQ-001d: `src/index.js` - Wrap `--hook` mode block in try-catch with fallback badge output + `process.exit(0)`
- [ ] REQ-001e: `bin/agy-tokens.js` - Add top-level fail-safe: catch errors in hook mode, output safe fallback, exit(0)

### PART 2. Turn-Level Model Attribution Preservation
- [ ] REQ-002a: `src/log-parser.js` - Improve `SETTINGS_CHANGE_RE` to capture both `from <source>` and `to <target>`
- [ ] REQ-002b: `src/log-parser.js` - Backtrack first `from <model>` from transcript when no settings change at turn 0
- [ ] REQ-002c: `src/log-parser.js` - Ensure past turns' `modelName` is never overwritten by later model changes (state machine isolation)
- [ ] REQ-002d: `src/aggregator.js` - `summarizeTurns` uses per-turn `turn.costUsd` sum instead of single-model recalculation
- [ ] REQ-002e: `src/html-report.js` - Period summaries (today/yesterday/7d/30d) use per-turn cost sum, not `summarizeTurns(turns, modelName)`
- [ ] REQ-002f: `src/html-report.js` - SSE/client filter preserves all models from 30-day window without loss

### PART 3. Model Alias Priority Fix
- [ ] REQ-003a: `src/config.js` - `getModelPricing` alias search sorts by `alias.length` descending to prevent `gpt-4o` matching `gpt-4o-mini`

### PART 4. Dynamic Y-Axis Chart Scaling
- [ ] REQ-004a: `src/html-report.js` - Compute `y_max` using Nice Numbers (1/2/5/10 rule) with 15-20% headroom
- [ ] REQ-004b: `src/html-report.js` - Render Y-axis guideline lines at Y-Max, 75%, 50%, 25%, 0
- [ ] REQ-004c: `src/html-report.js` - Smart compact formatting for Y-axis labels (0-999 raw, 1K-999K, 1M+)
- [ ] REQ-004d: `src/html-report.js` - All bar heights normalized to y_max (0.0-1.0 proportion)

### Verification Gates
- [ ] VG-001: `npm test` passes 100%
- [ ] VG-002: Statusline pipe error simulation exits with code 0
- [ ] VG-003: Multi-model session parsing preserves per-turn model across 10+ re-parses
- [ ] VG-004: Chart renders with dynamic Y-axis labels and guidelines
