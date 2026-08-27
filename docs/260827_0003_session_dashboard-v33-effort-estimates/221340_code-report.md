# Code Task Report — agy-tokens v3.3, Batch 1 (Data Foundation)

## Task Summary
Implemented Batch 1 of the v3.3 plan (architect report §7): (1) added the 6 new estimate-panel i18n keys to ALL 21 locale dictionaries in [`src/i18n.js`](src/i18n.js) (126 entries, natural translations), and (2) added the `getBaseModelName()` helper to [`src/config.js`](src/config.js), wired it as the first resolution step inside `getModelPricing()`, and exported it. Zero behavioral change beyond pricing suffix-stripping; no other files touched; no git commands run.

## Actions Taken

### Work Item 1 — `src/i18n.js`: 6 keys × 21 locales (126 entries)
- Verified the actual `SUPPORTED_LOCALES` list in the file: `en, ko, ja, zh, zh-TW, hi, vi, id, th, de, fr, es, pt, it, nl, pl, sv, ru, ar, he, tr` (21 locales). Note: `sv` (Swedish) is in the file's list but was absent from the task's residual-locale enumeration — it received a natural Swedish translation like every other locale (no English fallback anywhere).
- Added exactly 6 keys to each dictionary, appended after the unique `versionInfo` anchor line of each locale block (surgical, no reordering of existing keys):
  - `en` / `ko`: verbatim from architect report §3.1 table.
  - `ar`, `he`, `ja`, `zh`, `zh-TW`, `de`, `fr`, `ru`: used the natural-translation examples specified in §3.1 (`ar` disclaimer `هذه الأرقام تقديرية لإدارة الاستخدام على المدى الطويل`, `ar` month-end `التوقع لنهاية الشهر`, `he` disclaimer `הנתונים הם הערכות לניהול שימוש ארוך טווח`, `he` month-end `תחזית סוף חודש`, `ja` `月末予測`, `zh` `月末预估`, `zh-TW` `月末預估`, `de` `Prognose Monatsende`, `fr` `Projection fin de mois`, `ru` `Прогноз на конец месяца`), with the remaining 3 keys per locale written idiomatically in the same tone as that dictionary's existing keys.
  - `es, pt, hi, id, vi, th, tr, pl, nl, it, sv`: hand-written natural translations (e.g. `es` "Proyección de fin de mes", `pt` "Projeção para o fim do mês", `hi` "महीने के अंत का अनुमान", `th` "ประมาณการสิ้นเดือน", `tr` "Ay sonu tahmini", `pl` "Prognoza na koniec miesiąca", `nl` "Prognose einde maand", `it` "Proiezione di fine mese", `sv` "Prognos för månadens slut").
- Every entry is a non-empty string; RTL locales (`ar`, `he`) use natural RTL phrasing per §3.1 examples.

### Work Item 2 — `src/config.js`: `getBaseModelName()` helper
- Added `getBaseModelName(modelName)` above `getModelPricing()` ([src/config.js#L431-L447](src/config.js:431)): strips ONE trailing parenthesized group via `/\s*\([^)]*\)\s*$/`; null/non-string passthrough; empty-result guard returns the original input (e.g. `"(High)"` → `"(High)"`).
- Wired as the FIRST resolution step inside `getModelPricing()` ([src/config.js#L458](src/config.js:458)): `const rawTarget = getBaseModelName(modelName) || getActiveModelFromSettings();` — pricing now resolves on the base model for every caller (`calculateCostUsd`, `calculateCacheSavingsUsd`, aggregator, dashboard payload, CLI `--model` overrides).
- Exported the helper in `module.exports` ([src/config.js#L699](src/config.js:699)).

## Result
**SUCCESS — all verification evidence green.**

| Command | Result | Evidence |
|---|---|---|
| `node test/run-tests.js` | PASS | Exit code 0. **116 passed, 0 failed, 116 total**, 18 suites, 2645ms. Suite 2 (pricing) green; Suite 3 parity ("all required keys across all supported locale dictionaries") green — it auto-enforced the 6 new keys across all 21 locales. |
| Helper spot-check | PASS | `getBaseModelName('Gemini 3.7 Flash (Medium)')` → `Gemini 3.7 Flash` (exported, not "NOT EXPORTED") |
| Edge cases | PASS | `'gemini-3.7-flash'` → unchanged; `null` → `null` (passthrough); `'(High)'` → `'(High)'` (empty-result guard returns original) |
| Pricing wiring | PASS | `getModelPricing('Gemini 3.7 Flash (Medium)').id` → `gemini-3.7-flash` (base-model rates, not heuristic) |
| i18n completeness audit | PASS | Programmatic scan: 6 keys × 21 locales = **126 entries, 0 missing, 0 empty** |

## Issues Discovered
1. `getModelPricing('Claude Opus 4.6 (Thinking)')` resolves to id `claude-3-opus` via the fuzzy heuristic (`PRO_PATTERN` matches "opus") — the suffix strip itself works correctly; this is the pre-existing heuristic behavior documented as R1 in the architect report (coincidentally correct tier). No action needed in Batch 1; exact Claude aliases are a pricing-catalog concern, not a helper concern.
2. The task instruction's residual-locale list omitted `sv` (Swedish), which IS in `SUPPORTED_LOCALES`. Resolved by giving `sv` natural translations — suite 3 parity would have failed otherwise.

## Next Step Recommendations
- VP: proceed to Batch 2 (log-parser settings-change scan + `CACHE_SCHEMA_VERSION` 1→2) per architect report §7.
- Batch 3 will add the explicit 6-key × 21-locale assertion block to suite 3 (§3.2) and the dashboard surface; current suite 3 already enforces parity generically.

## Affected File List
- `src/i18n.js` (modified — 126 new entries: 6 keys × 21 locales)
- `src/config.js` (modified — 1 new exported helper + 1-line wiring in `getModelPricing`)
- `docs/260827_0003_session_dashboard-v33-effort-estimates/221340_code-report.md` (this report)