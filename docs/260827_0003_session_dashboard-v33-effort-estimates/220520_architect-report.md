# Architect Task Report — agy-tokens v3.3 (Estimate Panel + Effort Distinction + i18n Perfection)

## Task Summary
Produce a complete architecture plan for agy-tokens v3.3 covering: (Mandate 1) long-term estimate panel + persistent "estimates only" disclaimer, (Mandate 2) session-level reasoning-effort distinction flowing through the entire data pipeline, (Mandate 3) header `activeModel` label, and (REQ-259) i18n perfection across all 21 locales. Baseline: git `a940bbf`, 116 tests / 18 suites green, payload v3.

Report Folder: `docs/260827_0003_session_dashboard-v33-effort-estimates/`

---

## [1. Technical Specification]

### 1.1 Goals & Core Constraints

| Goal | REQ | Constraint |
|---|---|---|
| Persistent disclaimer + estimate panel | 250–253 | Client-side only; NO payload schema change; computed from existing `payload.daily[]` |
| Effort-distinct model identity end-to-end | 254–257 | `session.modelName` = full display string incl. effort; pricing strips suffix BEFORE lookup; cache re-parses once |
| Header `활성 모델:` label | 258 | Reuse existing `activeModel` key; `updateI18N` must re-render it |
| i18n perfection | 259 | Every new key × all 21 locales; suite 3 parity (en is canonical reference, line 311–329 of [`test/run-tests.js`](test/run-tests.js:311)); RTL intact |
| Hard constraints | — | Zero new deps; atomic writes; stale-payload tolerance preserved (`isFreshPayload` version ≥ 3); `DASHBOARD_PAYLOAD_VERSION` stays **3** (no schema change — see §2.1) |

### 1.2 FE↔BE Data-Flow Diagram (Mandate 2 — Effort Distinction)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ transcript.jsonl (USER_INPUT turns with <USER_SETTINGS_CHANGE> blocks)      │
│   "changed setting `Model Selection` from None to Gemini 3.7 Flash (High)"  │
└─────────────────────────────────────────────────────────────────────────────┘
                │ (1) scan during parse
                ▼
┌─────────────────────────────────────────┐
│ src/log-parser.js                       │
│   parseTranscriptFile()                 │
│   NEW: SETTINGS_CHANGE_RE regex         │
│   tracks lastModelChange (session-level)│
│   → session.modelName = "Gemini 3.7     │
│     Flash (High)" (effort-suffixed)     │
└─────────────────────────────────────────┘
                │ session.modelName (full string w/ effort)
                ▼
┌─────────────────────────────────────────┐
│ src/cache-manager.js                    │
│   CACHE_SCHEMA_VERSION 1 → 2            │
│   → old cache discarded on load         │
│   → every session re-parses ONCE        │
└─────────────────────────────────────────┘
                │ sessions[] with effort-suffixed modelName
                ▼
┌─────────────────────────────────────────┐
│ src/html-report.js                      │
│   buildDashboardPayload()               │
│   modelsMap keyed by session.modelName  │
│   dailyModelsMap[date][modelName]       │
│   cost via calculateCostUsd(..., model) │
└─────────────────────────────────────────┘
                │ per-model costing call
                ▼
┌─────────────────────────────────────────┐
│ src/config.js                           │
│   NEW: getBaseModelName(modelName)      │
│     strips " (…)" effort suffix         │
│   getModelPricing() calls it first      │
│   "Gemini 3.7 Flash (Low)" →            │
│     "Gemini 3.7 Flash" → alias match    │
└─────────────────────────────────────────┘
                │ models[] / dailyModels (effort-distinct keys, base-model pricing)
                ▼
┌─────────────────────────────────────────┐
│ payload (version stays 3)               │
│   models[]: distinct rows per variant   │
│   dailyModels[date]: distinct keys      │
└─────────────────────────────────────────┘
                │ window.__AGY_DASH__ / SSE
                ▼
┌─────────────────────────────────────────┐
│ Client JS (inline in dashboard.html)    │
│   initFilters(): checkbox per variant   │
│   renderSvg(): stacked segment per key  │
│   renderTable(): ↳ sub-row per key      │
│   ALL key off model name string →       │
│   effort distinction is AUTOMATIC       │
└─────────────────────────────────────────┘
```

**Critical architectural insight (verified against [`src/html-report.js`](src/html-report.js:127,156))**: every downstream surface (`models[]`, `dailyModels`, filter checkboxes, chart segments, sub-rows) keys off the `session.modelName` **string**. Mandate 2 requires changes at exactly TWO points — (a) the parser must produce effort-suffixed `modelName`, (b) pricing must strip the suffix before lookup. Everything downstream is already correct by construction. No client-JS changes are needed for effort distinction itself (REQ-255 verification is test-only).

### 1.3 Type Definitions

```text
// ParsedSession (existing, unchanged shape — modelName value changes)
{
  sessionId: string,
  modelName: string,          // WAS "Gemini 3.7 Flash (High)" from settings.json;
                              // NOW last <USER_SETTINGS_CHANGE> value or settings fallback
  inputTokens/cachedTokens/outputTokens/costUsd/...: number,
  turns: Turn[]
}

// NEW helper (config.js)
getBaseModelName(modelName: string): string
  // "Gemini 3.7 Flash (Low)"      → "Gemini 3.7 Flash"
  // "Claude Opus 4.6 (Thinking)"  → "Claude Opus 4.6"
  // "gemini-3.7-flash"            → "gemini-3.7-flash" (no parens → unchanged)

// ModelRow / DailyModelRow (existing — keys become effort-suffixed automatically)
{ model, displayName, totalTokens, inputTokens, cachedTokens, outputTokens,
  cacheHitRate, costUsd, cacheSavingsUsd, sessions, turns }
```

---

## [2. Architecture Decisions]

### 2.1 AD-1: `DASHBOARD_PAYLOAD_VERSION` stays 3 (do NOT bump)

The mandate says "bump to 4 only if payload schema changes". Mandate 1 is computed **client-side from `payload.daily[]`** (zero payload change). Mandate 2 changes only the *values* inside `models[].model` / `dailyModels` keys — the schema (field names/types) is identical. Therefore:

- [`DASHBOARD_PAYLOAD_VERSION`](src/html-report.js:31) remains `3`.
- [`isFreshPayload()`](src/html-report.js:395) (`version >= 3 && p.dailyModels`) remains valid — old v3 payloads from before this change still render correctly (they simply show non-effort model names until the cache re-parse lands).
- [`dashboard-link.js`](src/dashboard-link.js) `payloadVersion: 3` record is untouched; no stale-server respawn triggered.

**Risk avoided**: bumping to 4 would invalidate every open dashboard tab and require synchronized updates to `isFreshPayload`, `dashboard-server.json`, and suite 15/17 assertions (`parsed.version === 3` at [`test/run-tests.js:1182,1229,1821`](test/run-tests.js:1182)) — pure churn with zero functional gain.

### 2.2 AD-2: Effort capture regex — settings-change scan in log-parser

**Decision**: scan `USER_INPUT`/`USER_EXPLICIT` turn `content` during the existing streaming loop in [`parseTranscriptFile()`](src/log-parser.js:87), keeping the LAST match.

```text
Pattern source (VP-verified live-log evidence, NEW-SESSION-PROMPT-v4 §45-49):
  changed setting `Model Selection` from None to Gemini 3.7 Flash (High)
  changed setting `Model Selection` from None to Claude Opus 4.6 (Thinking)

Regex (module-level constant, compiled once):
  /changed setting `Model Selection` from .+? to (.+?)(?:\n|$)/

Capture group 1 = new model display string, trimmed.
Track: let sessionModelOverride = null;
  On each USER_INPUT turn, if content includes '<USER_SETTINGS_CHANGE>' (cheap
  substring pre-filter) → apply regex → on match, sessionModelOverride = match[1].trim()
After loop: const model = sessionModelOverride || modelName || getActiveModelFromSettings();
```

**Why LAST match (session-level granularity)**: v3.3 spec fixes session-level granularity; turn-level is a future extension. The existing per-turn cost loop currently calls `calculateCostUsd(..., model)` inside the loop ([`log-parser.js:188`](src/log-parser.js:188)) with a model fixed before parsing. Because the override is only known after the full pass, per-turn costs must be computed with the FINAL model. The existing code already computes turn costs inline with the pre-pass model — this must change: defer `turnCostUsd` assignment, OR (simpler, chosen) keep per-turn cost computation but **recompute is unnecessary** because effort does not change per-token rates (AD-3): the pricing is identical for the base model regardless of effort. If a session changed base MODEL mid-stream (Flash → Opus), per-turn costs would be slightly off — but v3.3 explicitly scopes to session-level granularity, and the session-level `costUsd` ([`log-parser.js:210`](src/log-parser.js:210)) is computed post-loop with the final model, which is the authoritative figure. **Per-turn `costUsd` recomputation is OUT OF SCOPE for v3.3** (documented edge case: mid-session base-model switch under-attributes turn-level cost; session totals are correct).

**Fallback precedence** (REQ-254): `sessionModelOverride ?? modelName(param) ?? getActiveModelFromSettings()`.

### 2.3 AD-3: Pricing strips effort suffix in `getModelPricing` (single choke point)

**Decision**: add `getBaseModelName()` to [`src/config.js`](src/config.js) and call it at the TOP of [`getModelPricing()`](src/config.js:438).

```text
function getBaseModelName(modelName) {
  if (!modelName || typeof modelName !== 'string') return modelName;
  return modelName.replace(/\s*\([^)]*\)\s*$/, '').trim() || modelName;
}
```

Inside `getModelPricing`: `const rawTarget = getBaseModelName(modelName) || getActiveModelFromSettings();`

**Why here and not in log-parser**: `getModelPricing` is the single choke point for ALL pricing resolution — called by `calculateCostUsd`, `calculateCacheSavingsUsd`, aggregator `summarizeTurns`, and `buildDashboardPayload` per-model costing ([`html-report.js:192,227`](src/html-report.js:192)). Fixing it here covers every caller with one change, including user-supplied `--model "Gemini 3.7 Flash (Low)"` CLI overrides. Existing aliases like `'gemini 3.7 flash (high)'` ([`config.js:64`](src/config.js:64)) continue to match via the substring path even before stripping, so stripping is purely additive safety for NEW effort variants (`(Medium)`, `(Thinking)` on unknown bases).

**Edge case — nested/trailing parens in legitimate names**: the regex only strips ONE trailing parenthesized group. `o1-preview` (no parens) unaffected. `Gemini 3.7 Flash (Thinking)` → `Gemini 3.7 Flash` → alias `'gemini 3.7 flash'` matches `gemini-3.7-flash` pricing — CORRECT (thinking tokens already counted in token volume; rates identical per mandate).

**Display preservation**: `session.modelName` keeps the FULL suffixed string; only the pricing lookup uses the stripped base. `displayName` fields ([`html-report.js:132,159`](src/html-report.js:132)) already copy `sessionModel` verbatim → REQ-255/63 satisfied automatically.

### 2.4 AD-4: Cache invalidation via `CACHE_SCHEMA_VERSION` bump 1 → 2

[`loadCache()`](src/cache-manager.js:30) rejects any cache whose `version !== CACHE_SCHEMA_VERSION` and returns a fresh empty root. Bumping the constant ([`cache-manager.js:11`](src/cache-manager.js:11)) from `1` to `2`:

- Old caches are discarded on next load → every session re-parses **exactly once** → effort-suffixed `modelName` picked up → new cache written with `version: 2`.
- This is the existing, proven invalidation mechanism — no new code paths, no migration logic.
- Suite 5 tests reference `cacheManager.CACHE_SCHEMA_VERSION` symbolically ([`run-tests.js:502,508`](test/run-tests.js:502)) → no test breakage.

**Cost**: one full re-parse of all transcripts on first run after upgrade (bounded by transcript volume; acceptable one-time hit, statusline budget only matters per-invocation steady-state).

### 2.5 AD-5: Estimate panel — pure client-side, no payload/server change

Per mandate table (NEW-SESSION-PROMPT-v4 §33-38), all four metrics derive from `payload.daily[]` (30-day window, each row has `date`, `totalTokens`, `costUsd`):

| Metric | Client computation over `daily[]` |
|---|---|
| Month-to-date | sum rows where `date >= YYYY-MM-01` of current month |
| Daily averages | 7d: sum(last 7 rows)/7 · 30d: sum(all)/30 |
| Month-end projection | monthToDate + (7dAvg × daysRemainingInMonth) |
| Last-30d total | sum(all rows) |

Days-in-month / remaining computed with `new Date(y, m+1, 0).getDate()` (core JS, no deps). Costs reuse existing `fmtCost()`/`fmtCompact()` ([`html-report.js:445-461`](src/html-report.js:445)).

**Panel does NOT respect date/model filters** — it is a long-term management view always computed from the FULL `lastPayload.daily[]` (unfiltered), consistent with the summary cards which also render from `p.summaries` regardless of filter state ([`html-report.js:761-763,828-830`](src/html-report.js:761)). This is a deliberate design decision: filters are for drill-down, the panel is for planning.

### 2.6 AD-6: Disclaimer placement — header meta + panel footer

- **Header**: new `<span id="estimateNote" class="estimate-note">` inside the existing `.meta` div ([`html-report.js:954`](src/html-report.js:954)), dim color (`var(--dim)`), always visible.
- **Panel**: same text repeated as a small footer line inside the estimate panel.
- Single i18n key `estimateDisclaimer` drives both; `updateI18N` re-renders both nodes.

### 2.7 AD-7: Design options considered (mandatory 3)

| | A (Standard/Right Way) | B (Practical) | C (Staging) |
|---|---|---|---|
| Effort distinction | Parser scan + config suffix-strip + cache bump (CHOSEN) | Only strip suffix in display layer, keep single model in cache | Regex-only parse without cache bump (stale data) |
| Estimate panel | Client-side from daily[] (CHOSEN) | Server-computed into payload (requires v4 bump — rejected) | Static text panel without live math |
| i18n | 6 new keys × 21 locales, hand-naturalized (CHOSEN) | English fallback for rare locales (violates REQ-259) | Google-translate-style literal strings |
| Effort | A: Effort High/Med · Risk: Low (2 touch points) · Outcome: complete | B: Effort Low · Risk: Med (wrong costs for new efforts) · C: Effort Low · Risk: High (stale cache) | |

Chosen: **Option A** everywhere — technically correct, addresses root causes, matches "boil the ocean" preference.

---

## [3. i18n Perfection Plan (REQ-259)]

### 3.1 Complete new-key inventory (6 keys × 21 locales = 126 entries)

| Key | en | ko (reference for tone) | Purpose |
|---|---|---|---|
| `estimateDisclaimer` | `These figures are estimates for long-term usage management.` | `이 수치들은 장기 사용 관리를 위한 추정치입니다` | Header note + panel footer (REQ-250) |
| `estimatePanelTitle` | `Long-Term Usage Estimate` | `장기 사용량 추정` | Panel `<h2>` (REQ-251) |
| `estimateMonthToDate` | `This Month So Far` | `이번 달 누적` | Metric 1 label |
| `estimateDailyAverage` | `Daily Average (7d / 30d)` | `일평균 사용량 (7일/30일)` | Metric 2 label |
| `estimateMonthEnd` | `Projected Month-End` | `월말 예상` | Metric 3 label |
| `estimateLast30d` | `Last 30 Days Total` | `최근 30일 총 사용량` | Metric 4 label |

No new keys needed for Mandate 2 (effort strings come from data, not i18n) or Mandate 3 (`activeModel` key already exists in all 21 locales, [`i18n.js:71`](src/i18n.js:71) `"activeModel": "Active Model"` / ko `"사용 모델"`).

**Natural-translation requirement**: translations must be idiomatic, not literal. Examples for non-trivial locales:
- `ar`: `estimateDisclaimer` → `هذه الأرقام تقديرية لإدارة الاستخدام على المدى الطويل` · `estimateMonthEnd` → `التوقع لنهاية الشهر`
- `he`: `estimateDisclaimer` → `הנתונים הם הערכות לניהול שימוש ארוך טווח` · `estimateMonthEnd` → `תחזית סוף חודש`
- `ja`: `estimateMonthEnd` → `月末予測` · `zh`: `月末预估` · `zh-TW`: `月末預估`
- `de`: `estimateMonthEnd` → `Prognose Monatsende` · `fr`: `Projection fin de mois` · `ru`: `Прогноз на конец месяца`

(Full 21-locale table to be produced by the code batch implementing [`src/i18n.js`](src/i18n.js); each entry must be a non-empty string — suite 3 enforces `length > 0` per key per locale, [`run-tests.js:323`](test/run-tests.js:323).)

### 3.2 Parity mechanism (suite 3)

Suite 3 test 1 ([`run-tests.js:311-329`](test/run-tests.js:311)) iterates `enKeys` as canonical and asserts every key exists non-empty in every `SUPPORTED_LOCALES` dictionary. Adding the 6 keys to `en` automatically raises the bar for all 21 locales — **any missing locale entry fails the suite immediately**. No test changes needed for parity enforcement; a NEW dedicated assertion listing the 6 estimate keys (mirroring the existing `filterKeys` test at [`run-tests.js:331-344`](test/run-tests.js:331)) will be added to suite 3 for explicit coverage documentation.

### 3.3 RTL handling for new DOM

- Panel is a normal block `<section>` — inherits `dir="rtl"` from `<html>` ([`html-report.js:378,897`](src/html-report.js:378)). The 2-col grid uses `grid-template-columns` which is direction-agnostic; text alignment follows `dir` automatically.
- Metric rows use flex `justify-content:space-between` — in RTL the label/value swap sides naturally (desired).
- Add explicit RTL rules only for the disclaimer span if it uses `margin-left/right` — use logical properties pattern already in codebase (`[dir=rtl] …` overrides, see `.subrow` precedent at [`html-report.js:948`](src/html-report.js:948)).
- Verification: suite 15 RTL assertions + manual `AGY_LANG=ar` gate (Verification Gate 6).

### 3.4 `updateI18N` coverage (REQ-259)

Existing [`updateI18N(p)`](src/html-report.js:397) re-renders a hardcoded set of element IDs. MUST add:
- `estimateNote` (header disclaimer span)
- `estimateTitle` (panel h2)
- 4 metric label spans: `estMtdLabel`, `estAvgLabel`, `estMonthEndLabel`, `est30dLabel`
- Mandate 3: header model label — change the `#model` span render to prefix `I18N.activeModel + ': '`. In `render()` ([`html-report.js:843-844`](src/html-report.js:843)) and inside `updateI18N` add `el = document.getElementById('model'); if (el && I18N.activeModel && lastPayload) el.textContent = I18N.activeModel + ': ' + (lastPayload.model || '');`
- Metric VALUES are locale-independent formatting (numbers/currency via `fmtCost`) but must be recomputed on locale change — simplest: call the panel renderer from `updateI18N` tail (or rely on next poll cycle ≤5s; CHOSEN: explicit re-render call `renderEstimates(lastPayload)` at end of `updateI18N` for immediacy).

---

## [4. Cross-Domain Mapping — Every File/Function Touched]

| # | File | Function/Location | Change | REQ |
|---|---|---|---|---|
| 1 | [`src/log-parser.js`](src/log-parser.js:87) | `parseTranscriptFile()` | Add `SETTINGS_CHANGE_RE`; substring pre-filter `<USER_SETTINGS_CHANGE>`; track last override; final `model = override \|\| param \|\| settings` | 254 |
| 2 | [`src/config.js`](src/config.js:438) | NEW `getBaseModelName()` + `getModelPricing()` first line | Strip trailing ` (…)` before pricing resolution; export helper | 256 |
| 3 | [`src/cache-manager.js`](src/cache-manager.js:11) | `CACHE_SCHEMA_VERSION` | `1 → 2` | 257 |
| 4 | [`src/i18n.js`](src/i18n.js) | `TRANSLATIONS` × 21 locales | Add 6 keys × 21 locales (126 entries) | 250–253, 259 |
| 5 | [`src/html-report.js`](src/html-report.js) | CSS block | `.estimate-note`, `.estimate-panel`, `.est-grid` (2-col ≥1200px via media query, stacks below), RTL overrides | 250, 251, 259 |
| 6 | [`src/html-report.js`](src/html-report.js:954) | HTML template `<header>` | Insert `<span id="estimateNote">` in `.meta` | 250 |
| 7 | [`src/html-report.js`](src/html-report.js:956) | HTML template `<main>` | Insert `<section id="estimatePanel">` after cards section | 251 |
| 8 | [`src/html-report.js`](src/html-report.js:397) | client `updateI18N()` | Re-render 6 new nodes + `activeModel` prefix + `renderEstimates(lastPayload)` | 258, 259 |
| 9 | [`src/html-report.js`](src/html-report.js) | client NEW `computeEstimates(daily)` + `renderEstimates(p)` | MTD sum, 7d/30d avg, month-end projection, 30d total | 251–253 |
| 10 | [`src/html-report.js`](src/html-report.js:843) | client `render()` | `#model` span → `I18N.activeModel + ': ' + p.model`; call `renderEstimates(p)` | 258, 251 |
| 11 | [`test/run-tests.js`](test/run-tests.js:421) | Suite 4 | NEW: synthetic transcript with `<USER_SETTINGS_CHANGE>` → effort model; without → fallback | 254 |
| 12 | [`test/run-tests.js`](test/run-tests.js:310) | Suite 3 | NEW: explicit 6-key × 21-locale assertion block | 259 |
| 13 | [`test/run-tests.js`](test/run-tests.js:1167) | Suite 15 | NEW: estimate panel markup/CSS/JS presence; effort-distinct models/dailyModels payload test; disclaimer text; `activeModel:` label | 250–258 |

**Untouched (verified no change needed)**: [`src/aggregator.js`](src/aggregator.js) (model-agnostic; `summarizeTurns` takes modelName param — receives suffixed string, pricing strips internally), [`src/dashboard-link.js`](src/dashboard-link.js) (payload v3 unchanged), [`src/serve.js`](src/serve.js), [`src/hook-handler.js`](src/hook-handler.js), [`src/formatter.js`](src/formatter.js), [`src/index.js`](src/index.js) (no new CLI flags), `bin/*`, `data/pricing.json`.

---

## [5. Estimate Panel Detailed Design (Mandate 1)]

### 5.1 DOM structure

```html
<section class="panel estimate-panel" id="estimatePanel">
  <h2 id="estimateTitle">…estimatePanelTitle…</h2>
  <div class="est-grid">
    <div class="est-item"><div class="est-label" id="estMtdLabel"></div>
      <div class="est-value" id="estMtdValue"></div><div class="est-cost" id="estMtdCost"></div></div>
    <div class="est-item"><div class="est-label" id="estAvgLabel"></div>
      <div class="est-value" id="estAvgValue"></div><div class="est-cost" id="estAvgCost"></div></div>
    <div class="est-item"><div class="est-label" id="estMonthEndLabel"></div>
      <div class="est-value" id="estMonthEndValue"></div><div class="est-cost" id="estMonthEndCost"></div></div>
    <div class="est-item"><div class="est-label" id="est30dLabel"></div>
      <div class="est-value" id="est30dValue"></div><div class="est-cost" id="est30dCost"></div></div>
  </div>
  <div class="estimate-note" id="estimatePanelNote"></div>
</section>
```

Placement: after `<section id="cards">` ([`html-report.js:958`](src/html-report.js:958)), before `#filters` — "right-side panel" on wide screens is achieved by pairing with the cards row via a wrapper grid (see CSS).

### 5.2 CSS

```text
.est-layout{display:grid;grid-template-columns:1fr;gap:20px}
@media(min-width:1200px){.est-layout{grid-template-columns:1.6fr 1fr}}
```
Wrap `#cards` + `#estimatePanel` in `<div class="est-layout">` — ≥1200px: cards left, panel right (2-col); <1200px: stacked. Reuses existing `var(--panel)/var(--border)/var(--dim)` tokens. RTL: grid direction auto-flips with `dir=rtl`; no manual mirroring needed beyond existing precedent.

### 5.3 Client computation functions

```text
computeEstimates(daily):               // daily = payload.daily (30 rows, asc)
  now = new Date()
  monthPrefix = YYYY-MM of now
  mtd = Σ rows where date.startsWith(monthPrefix) → {tokens, cost}
  last7 = daily.slice(-7);  avg7 = Σ(last7)/7
  avg30 = Σ(daily)/daily.length (guard ÷0 → 0)
  daysInMonth = new Date(y, m+1, 0).getDate()
  remaining = daysInMonth - now.getDate()
  monthEnd = mtd + avg7 × remaining      // 7d-avg basis (more responsive)
  total30 = Σ(daily)
  return {mtd, avg7, avg30, monthEnd, total30}

renderEstimates(p): writes tokens (fmtCompact) + cost (fmtCost) into 8 value nodes
```

Projection basis: **7-day average** chosen over 30-day for month-end (recent behavior predicts near-future better); both averages displayed side-by-side for metric 2 per mandate.

---

## [6. Risk Analysis]

| Risk | Severity | Mitigation |
|---|---|---|
| **R1: Pricing on effort-suffixed names misses aliases** — e.g. `Claude Opus 4.6 (Thinking)` has no alias → falls to heuristic `PRO_PATTERN` matches "opus" → pro tier (coincidentally correct, but fragile) | 🟠 High | AD-3 strips suffix BEFORE lookup in the single choke point `getModelPricing`. Test: suite 2-style assertion `getModelPricing('Gemini 3.7 Flash (Medium)').id === 'gemini-3.7-flash'` |
| **R2: Cache stale modelName** — old cache holds sessions parsed with settings-only model | 🟠 High | AD-4 schema bump 1→2 forces one-time full re-parse. Suite 5 uses symbolic constant → green |
| **R3: Stale-payload guard interplay** — open tabs with pre-change v3 payloads | 🟢 Low | `isFreshPayload` unchanged; old v3 payloads render fine (non-effort names); new v3 payloads replace on next poll. No version bump = no guard change = no regression surface |
| **R4: Regex false positives** — user pastes the literal settings-change text into a prompt | 🟡 Med | Regex anchored to `changed setting \`Model Selection\` from … to …` exact phrasing + `<USER_SETTINGS_CHANGE>` substring pre-filter (block marker only present in real settings blocks). Documented residual risk accepted (estimate-only tool) |
| **R5: Mid-session base-model switch** — per-turn costs use final model | 🟡 Med | Documented in AD-2: session totals correct; turn-level cost attribution approximate by v3.3 scope decision (session-level granularity) |
| **R6: Month boundary in estimate panel** — 30-day window may not contain month start on the 1st | 🟢 Low | If `date >= YYYY-MM-01` matches zero rows (1st of month, window ends yesterday… impossible since daily includes today), MTD=0, projection = avg×remaining. Guard ÷0 on empty daily |
| **R7: i18n missing locale entry** | 🟠 High | Suite 3 canonical-en parity auto-fails; plus new explicit 6-key test block (§3.2) |
| **R8: `updateI18N` misses new node → stale English on locale switch** | 🟡 Med | Suite 15 assertion that `updateI18N` body references all 6 new IDs + `activeModel` prefix logic |
| **R9: RTL layout break in est-grid** | 🟢 Low | Grid is direction-agnostic; verified via `AGY_LANG=ar` render gate + existing `[dir=rtl]` override pattern |

**Test-suite additions summary**: Suite 3 (+1 test: 6-key parity), Suite 4 (+2 tests: settings-change extraction + fallback), Suite 15 (+3 tests: estimate panel markup/CSS/JS + disclaimer + activeModel label; effort-distinct payload build). Suites 2/5/17/18 unaffected (symbolic constants / no version bump). Projected total: 116 → ~122 tests.

---

## [7. Implementation Batch Plan (P3.5)]

Constraint compliance: never same file twice in one batch; 🟡STANDARD ≤2 items per batch; sequential dependency order (i18n keys must exist before html-report references them; config helper before parser reliance is conceptual — both independent in code).

### Batch 1 — Data foundation (2 items, disjoint files)
1. **[`src/i18n.js`](src/i18n.js)** — add 6 keys × 21 locales (126 entries, natural translations per §3.1).
2. **[`src/config.js`](src/config.js)** — add `getBaseModelName()`, wire into `getModelPricing()` first line, export it.

Verification: `node test/run-tests.js` (suite 3 parity + suite 2 pricing green; expected 117–118 pass).

### Batch 2 — Pipeline + cache (2 items, disjoint files)
1. **[`src/log-parser.js`](src/log-parser.js)** — settings-change scan in `parseTranscriptFile()` (AD-2).
2. **[`src/cache-manager.js`](src/cache-manager.js)** — `CACHE_SCHEMA_VERSION` 1→2.

Verification: `node test/run-tests.js` (existing suites green — suite 4 has no settings-change fixtures yet so no breakage).

### Batch 3 — Dashboard surface + tests (2 items, disjoint files)
1. **[`src/html-report.js`](src/html-report.js)** — disclaimer span, estimate panel DOM/CSS, `computeEstimates`/`renderEstimates`, `updateI18N` + `render()` updates, `activeModel:` label (REQ-250–253, 258).
2. **[`test/run-tests.js`](test/run-tests.js)** — suite 3 (+1), suite 4 (+2), suite 15 (+3) new tests per §6.

Verification: `node test/run-tests.js` → all green (~122); then Gate 2: `AGY_LANG=ko node bin/agy-tokens.js --hook --raw --write-dashboard` → dashboard.html contains disclaimer + panel + `활성 모델:` label; Gate 6: `AGY_LANG=ar` RTL spot-check.

**Batch ordering rationale**: B1 provides keys/helpers with zero behavioral change (safe to land first). B2 changes parsed data but nothing consumes suffixed names visibly until B3. B3 wires the UI + locks everything with tests. Each batch is independently revertible.

---

## Issues Discovered
1. Pre-existing latent issue (not in scope, report-only): [`log-parser.js:188`](src/log-parser.js:188) computes per-turn `costUsd` with the pre-pass model; with session-level override the per-turn costs reflect the FINAL model only for session totals. Accepted per AD-2 (session-level granularity scope); flag for future turn-level extension.
2. [`getModelPricing()`](src/config.js:453) substring alias matching (`target.includes(alias)`) means some effort variants already resolve correctly by luck — AD-3 makes this deterministic rather than incidental.

## Next Step Recommendations
- VP: proceed to P3.5 with Batch 1 → 2 → 3 as specified; each batch is a single `code` delegation (2 files max, disjoint).
- After Batch 3: run full Verification Gates 1–6 from NEW-SESSION-PROMPT-v4, then P6 Final Ask Audit.

## Affected File List
- `src/i18n.js` (modify — 126 new entries)
- `src/config.js` (modify — 1 new function + 1-line wiring + export)
- `src/log-parser.js` (modify — settings-change scan)
- `src/cache-manager.js` (modify — 1 constant)
- `src/html-report.js` (modify — CSS/HTML/3 client functions)
- `test/run-tests.js` (modify — 3 suites extended)
- `docs/260827_0003_session_dashboard-v33-effort-estimates/220520_architect-report.md` (this report)
