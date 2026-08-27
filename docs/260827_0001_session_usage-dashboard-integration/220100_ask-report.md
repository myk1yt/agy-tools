# P6 Final Ask Audit Report — agy-tokens v2 Statusline-Only Rework

**Mode:** ask (CPO) | **Date:** 2026-08-27 | **Time:** 22:01 KST
**Session:** docs/260827_0001_session_usage-dashboard-integration/
**Auditor:** CPO (Ask mode) — independent per-phase gatekeeper
**Audit Baseline:** requirement-checklist.md (REQ-101..112)
**Reports Audited:** 214900_code-report.md (Batch A), 215400_code-report.md (Batch B), 215800_code-light-report.md (Batch C)

---

## Task Summary

Full audit of the agy-tokens v2 statusline-only rework against the 12-requirement checklist (REQ-101..112) and the 4 verbatim user mandates. The CPO independently verified every requirement by reading the actual source files (not trusting the code reports), cross-validating the link wiring chain end-to-end, sweeping for stale references, and checking constraint compliance. The implementation faithfully realizes the user's concept change: statusline-ONLY integration with per-model usage and cost in the dashboard. 11 of 12 requirements PASS; 1 is CONDITIONAL due to two stale `package.json` references from the deleted v1 concept.

---

## Audit Findings (per REQ)

### [REQ-101] Statusline badge `📊 Dashboard` OSC 8 link — ✅ PASS

**Mandate:** "statusline에 📊 Dashboard 가 보이지 않아" (link fixed & wired).

**Code reality (independently verified):**
- [`src/index.js`](../../src/index.js:350-366): hook branch builds `const dashboardLink = options.noLink ? null : osc8.formatOsc8Link(osc8.dashboardFileUrl(), '📊 ' + i18n.t('dashboardLink'))` and passes it as `options.link` to `handlePostInvocation`.
- [`src/hook-handler.js`](../../src/hook-handler.js:148): `renderRealTimeBadge(badgeData, currency, isFree, options.link || null)` — the 4th param (previously missing) is now wired.
- [`src/formatter.js`](../../src/formatter.js:620): `renderRealTimeBadge(badgeData, currencyCode = 'usd', isFree = false, link = null)` — signature accepts and appends the link segment.
- [`src/osc8.js`](../../src/osc8.js:31): `formatOsc8Link(uri, label)` with `isOsc8Supported()` env degradation (NO_COLOR / TERM=dumb).
- [`src/i18n.js`](../../src/i18n.js:127): `dashboardLink` key present in all 4 locales (en: 'Dashboard', ko: '대시보드', ja: 'ダッシュボード', zh: '仪表板').

**Root-cause completeness (mandate 1 link wiring chain):** The chain is complete end-to-end: `index.js` (build link) → `hook-handler.js` (pass link) → `formatter.js` (append link) → `osc8.js` (render/degrade). `--no-link` suppresses at the source (index.js:350). NO_COLOR/TERM=dumb degrades inside `formatOsc8Link`. No gap in the chain.

**VP-verified live evidence:** `--hook --raw` → single line ending `📊 Dashboard` (OSC 8 wrapped); `--no-link` → no Dashboard segment.

---

### [REQ-102] `/tokens` skill deleted entirely — ✅ PASS

**Mandate:** "/tokens 기능은 완전히 삭제해야해."

**Code reality:**
- `list_files` top-level: `integrations/` directory **absent** (confirmed by CPO independent listing).
- [`test/run-tests.js`](../../test/run-tests.js:748-751): regression guard asserts `!fs.existsSync(integrations/skills)`.

**Live evidence (VP-verified):** `~/.gemini/skills/tokens/` deleted (Recycle Bin); `agy -p "/skills"` lists no tokens skill.

---

### [REQ-103] `usage` skill also deleted — ✅ PASS

**Code reality:** Same as REQ-102 — `integrations/skills/usage/` gone from repo.

**Live evidence (VP-verified):** `~/.gemini/skills/usage/` deleted (Recycle Bin); `agy -p "/skills"` lists no usage skill.

---

### [REQ-104] hooks.json removed — ✅ PASS

**Code reality:** `integrations/hooks.json` absent from repo. [`test/run-tests.js`](../../test/run-tests.js:753-756): regression guard asserts `!fs.existsSync(integrations/hooks.json)`.

**Live evidence (VP-verified):** `~/.gemini/hooks.json` → `{}` (token-tracker PostInvocation entry removed; valid empty JSON object retained for agy parseability).

---

### [REQ-105] README.md fully rewritten — ✅ PASS

**Mandate:** "readme를 포함한 설명 전체를 수정해야해. agy의 어떤것도 건드리지 않고 오로지 statusline만 사용."

**Code reality (CPO search-verified):**
- [`README.md`](../../README.md:9): "one `statusLine` entry in `~/.gemini/antigravity-cli/settings.json` is the ONLY integration point".
- [`README.md`](../../README.md:21): "🔗 Statusline-Only Integration" feature bullet.
- [`README.md`](../../README.md:283): headline "agy-tokens = statusline-powered real-time token dashboard. Zero agy modification."
- [`README.md`](../../README.md:288-291): statusLine JSON snippet with 8.3 short paths (`PROGRA~1`, `NODE_M~1`, `AGY-TO~1`) + `--write-dashboard`.
- [`README.md`](../../README.md:221-223): `--write-dashboard` section; L256-258: `--open`, `--write-dashboard`, `--no-link` option rows.
- **Stale reference sweep:** `search_files` for `/usage|/tokens|skill|hooks\.json` on README.md → **0 matches** (confirmed by CPO).

---

### [REQ-106] Installers: skill copying removed, statusLine instructions printed — ✅ PASS

**Code reality:**
- [`scripts/install.bat`](../../scripts/install.bat:36-50): prints statusLine JSON snippet with 8.3 short paths; no skill/hooks copy logic. `search_files` for `skill|hooks\.json|SKILL` → **0 matches**.
- [`scripts/install.sh`](../../scripts/install.sh:40-54): same pattern + POSIX variant note. **0 stale matches**.
- Neither installer auto-edits `settings.json` — both print instructions only.

---

### [REQ-107] Per-model usage + per-model cost in dashboard payload — ✅ PASS

**Mandate:** "Dashboard에는 모델별 사용량, 그리고 비용계산이 포함되어야해."

**Code reality (independently verified):**
- [`src/html-report.js`](../../src/html-report.js:31): `DASHBOARD_PAYLOAD_VERSION = 2`.
- [`src/html-report.js`](../../src/html-report.js:115-161): per-model accumulation pass — groups by `session.modelName` (fallback: opts.modelName, then 'unknown'). Each session costed with its OWN model: `calculateCostUsd(session.inputTokens, session.cachedTokens, session.outputTokens, sessionModel)` (L154-158). NOT the global active model.
- [`src/html-report.js`](../../src/html-report.js:212-219): payload emits `models` array (sorted by `costUsd` desc) with all 11 ModelRow fields: `model, displayName, totalTokens, inputTokens, cachedTokens, outputTokens, cacheHitRate, costUsd, cacheSavingsUsd, sessions, turns`.
- Imports `calculateCostUsd`, `calculateCacheSavingsUsd` from config — existing functions, zero new deps.

**VP-verified live evidence:** `--write-dashboard` → dashboard-data.js contains `models` array with 3+ entries and per-model `costUsd` (Claude Opus 4.6 $70.74, Gemini 3.7 Flash $17.14, etc.).

---

### [REQ-108] HTML Models section with table + share bars — ✅ PASS

**Code reality:**
- [`src/html-report.js`](../../src/html-report.js:402): `renderModels(models)` client function — per-model table (Model / Sessions / Turns / Input / Cached / Output / Total / Cache% / Cost / Savings) + share bar (inline CSS div, width = % of max model tokens).
- [`src/html-report.js`](../../src/html-report.js:532): `<section class="panel"><h2>${t('modelsTitle')}</h2><div id="modelsWrap"></div></section>`.
- [`src/html-report.js`](../../src/html-report.js:436): `renderModels(p.models)` called on every poll/SSE refresh.
- Zero-dependency: inline CSS, `esc()`-escaped, reuses existing `fmtCompact`/`fmtCost`/`fmtPct`.

**Test coverage:** [`test/run-tests.js`](../../test/run-tests.js:1255-1257): asserts `renderModels`, `share-bar`, `modelsTitle` present in HTML.

---

### [REQ-109] i18n keys in all 4 locales — ✅ PASS

**Code reality (CPO search-verified):**
- [`src/i18n.js`](../../src/i18n.js:135-136): en `modelsTitle: 'Model Usage & Cost'`, `modelColumn: 'Model'`.
- [`src/i18n.js`](../../src/i18n.js:266-267): ko `modelsTitle: '모델별 사용량 & 비용'`, `modelColumn: '모델'`.
- [`src/i18n.js`](../../src/i18n.js:397-398): ja `modelsTitle: 'モデル別使用量 & コスト'`, `modelColumn: 'モデル'`.
- [`src/i18n.js`](../../src/i18n.js:528-529): zh `modelsTitle: '模型使用量 & 成本'`, `modelColumn: '模型'`.
- Suite 3 parity holds (existing test enforces key parity across all 4 dictionaries).

---

### [REQ-110] Tests: suite 10 updated, suite 15 extended, all green — ✅ PASS

**Code reality (CPO statically verified):**
- [`test/run-tests.js`](../../test/run-tests.js:733-756): suite 10 renamed "Toolkit Subcommand & Statusline-Only Concept Integrity" with 3 regression guards (skills dir must NOT exist, hooks.json must NOT exist, README integrity).
- [`test/run-tests.js`](../../test/run-tests.js:1184-1226): suite 15 W4 test — per-model rows costed with each session model; asserts row shape, token sums, `costUsd > 0`, differing per-model costs.
- [`test/run-tests.js`](../../test/run-tests.js:1255-1257): suite 15 HTML test — asserts `renderModels`, `share-bar`, `modelsTitle`.
- Version assertions updated to 2 in 3 places (L1115, L1160, L1410).

**Runtime evidence (VP-verified):** `node test/run-tests.js` → 90 passed, 0 failed, 90 total (17 suites), exit 0.

**CPO note:** Ask mode has no `execute_command` tool; CPO verified test structure statically and relied on VP-confirmed runtime evidence. The test code structure fully supports the reported results.

---

### [REQ-111] Live verification — ✅ PASS

**VP-verified live evidence (cross-checked against code reality):**
- `agy -p "/skills"` → no tokens/usage skills listed; clean SUCCESS exit. ✅ (code: skills deleted from repo + live)
- `~/.gemini/hooks.json` → `{}` (token-tracker gone). ✅ (Batch C report confirms)
- `settings.json` statusLine → 8.3 short-path command with `--write-dashboard`; all 8 original keys present. ✅ (Batch C report confirms)
- `--hook --raw` → single line ending `📊 Dashboard` (OSC 8 wrapped). ✅ (code: link chain confirmed end-to-end)
- `--write-dashboard` → dashboard-data.js with `models` array + per-model `costUsd`. ✅ (code: models array confirmed)
- Tests: 90 passed / 0 failed (17 suites). ✅ (code: test structure confirmed)

---

### [REQ-112] Hard constraints — 🔶 CONDITIONAL

**Verified constraints:**
| Constraint | Status | Evidence |
|---|---|---|
| Zero new npm deps | ✅ PASS | [`package.json`](../../package.json) has no `dependencies` or `devDependencies` fields — truly zero-dependency |
| Atomic writes | ✅ PASS | Unchanged from v1 (tmp + rename pattern, not modified in v2) |
| `--serve` 127.0.0.1 only | ✅ PASS | [`src/serve.js`](../../src/serve.js:149): `server.listen(port, '127.0.0.1', ...)` |
| file:// polling via script-tag injection | ✅ PASS | No `fetch(` in dashboard HTML; script-tag polling only |
| 8.3 short-path statusLine command | ✅ PASS | Confirmed in README, installers, and VP-verified settings.json |
| No touching agy binary/config beyond statusLine | ✅ PASS | Only `~/.gemini/antigravity-cli/settings.json` statusLine value modified (user config, not agy itself); `AppData\Local\agy\**` untouched |

**⚠️ CONDITIONAL items (2 stale `package.json` references to deleted v1 concept):**
1. [`package.json`](../../package.json:23): `"token-tracker"` keyword in `keywords` array — stale reference to the deleted skill/hook concept. User-facing on the npm registry page.
2. [`package.json`](../../package.json:43): `"integrations"` in `files` array — references a directory that no longer exists. `npm pack` silently ignores it, but it is a leftover artifact.

**Impact:** Neither item breaks functionality or violates a user mandate. However, `package.json` is a user-facing surface (npm registry), and the audit checklist item 4 requires checking "any leftover references to skills/hooks/slash-commands in user-facing surfaces (README, --help text, installers)". `package.json` was not explicitly listed in the audit's file scope but falls under the spirit of the regression check.

---

## 4 User Mandates Verification

### Mandate 1: "Agy를 새로 시작했지만 statusline에 📊 Dashboard 가 보이지 않아."
**✅ SATISFIED (spirit + letter).** Root cause (missing OSC 8 link param in hook path) fixed and wired end-to-end: `index.js` → `hook-handler.js` → `formatter.js` → `osc8.js`. VP-verified: `--hook --raw` ends with `📊 Dashboard`. `--no-link` and NO_COLOR/TERM=dumb degradation respected.

### Mandate 2: "/tokens 기능은 완전히 삭제해야해."
**✅ SATISFIED (spirit + letter).** `/tokens` skill fully deleted from repo (`integrations/skills/tokens/` gone) and live (`~/.gemini/skills/tokens/` gone). `agy -p "/skills"` confirms no tokens skill. No `/tokens` references in README, installers, or `--help` text.

### Mandate 3: "컨셉이 바뀌었으므로 readme를 포함한 설명 전체를 수정해야해. agy의 어떤것도 건드리지 않고 오로지 statusline만 사용할 필요가 있어."
**✅ SATISFIED (spirit + letter), with minor completeness gap.** README fully rewritten for statusline-only concept. Installers rewritten. Skills, hooks.json, and slash commands all removed. agy itself untouched (only user config `settings.json` statusLine value modified). **Minor gap:** `package.json` retains 2 stale v1 references (`"token-tracker"` keyword, `"integrations"` in files array) — does not affect the mandate's intent but should be cleaned.

### Mandate 4: "Dashboard에는 모델별 사용량, 그리고 비용계산이 포함되어야해."
**✅ SATISFIED (spirit + letter).** Dashboard payload includes `models: ModelRow[]` with per-model usage breakdown (input/cached/output tokens, cache hit rate, sessions, turns) and per-model cost calculation (`costUsd`, `cacheSavingsUsd`). HTML renders a "Models" section with per-model table + share bars. Per-session model costing (session's own model, not global active model) — the maximum accuracy available from the data layer.

---

## Regression Check: Stale References in User-Facing Surfaces

| Surface | `skill` | `hooks.json` | `/usage` | `/tokens` | `token-tracker` | Verdict |
|---|---|---|---|---|---|---|
| README.md | 0 | 0 | 0 | 0 | 0 | ✅ Clean |
| --help text (formatter.js renderHelp) | 0 | 0 | 0 | 0 | 0 | ✅ Clean |
| scripts/install.bat | 0 | 0 | 0 | 0 | 0 | ✅ Clean |
| scripts/install.sh | 0 | 0 | 0 | 0 | 0 | ✅ Clean |
| package.json | 0 | 0 | 0 | 0 | **1** (L23 keyword) | 🔶 Stale |
| package.json files array | `"integrations"` (L43, dir deleted) | — | — | — | — | 🔶 Stale |
| src/**/*.js | 0 | 0 | 0 | 0 | 0 | ✅ Clean (formatter.js L612 "PostInvocation" is a JSDoc comment for the real `--hook` flag — acceptable) |
| test/run-tests.js | Intentional (regression guards asserting non-existence) | Intentional | Intentional | Intentional | 0 | ✅ Correct (guards, not stale refs) |
| docs/** | Historical session reports (read-only records per Report Protocol) | — | — | — | — | ✅ N/A (not user-facing) |

---

## Proof Validity Assessment

| Evidence | Source | CPO Independent Verification | Reproducible? |
|---|---|---|---|
| 90 tests passed / 0 failed | VP-verified | Static: test structure confirmed (suite 10 guards, suite 15 W4 tests, version=2 assertions) | ✅ Yes (run `node test/run-tests.js`) |
| `--hook --raw` ends with `📊 Dashboard` | VP-verified | Static: link chain confirmed end-to-end in code | ✅ Yes (run `node bin/agy-tokens.js --hook --raw`) |
| dashboard-data.js has models array + costUsd | VP-verified | Static: `buildDashboardPayload` emits `models` with per-session costing | ✅ Yes (run `--write-dashboard`, read data file) |
| `agy -p "/skills"` no tokens/usage | VP-verified | Static: skills deleted from repo + live | ✅ Yes (run `agy -p "/skills"`) |
| hooks.json = `{}` | VP-verified | Batch C report confirms | ✅ Yes (read `~/.gemini/hooks.json`) |
| settings.json statusLine correct | VP-verified | Batch C report confirms 8.3 paths + `--write-dashboard` | ✅ Yes (read settings.json) |

**CPO limitation note:** Ask mode has no `execute_command` tool. CPO performed maximum independent verification via static code analysis (reading actual source files, searching for patterns, cross-validating the link chain). All VP-verified runtime evidence is supported by the code structure. No discrepancies found between reports and code reality.

---

## Constraint Compliance

| Constraint | Status | Evidence |
|---|---|---|
| Zero new npm deps | ✅ | `package.json` has no `dependencies`/`devDependencies` — zero-dependency confirmed |
| Atomic writes | ✅ | Unchanged from v1 (tmp + rename) |
| `--serve` 127.0.0.1 only | ✅ | `src/serve.js:149` `server.listen(port, '127.0.0.1', ...)` |
| file:// script-tag polling only | ✅ | No `fetch(` in HTML; script-tag injection |
| 8.3 short-path statusLine | ✅ | README + installers + VP-verified settings.json |
| agy binary/config untouched | ✅ | Only `settings.json` statusLine value (user config); `AppData\Local\agy\**` untouched |
| `package.json` stale refs | 🔶 | `"token-tracker"` keyword (L23), `"integrations"` in files (L43) — v1 leftovers |

---

## Verdict

**[1. Philosophy & UX/UI Diagnostics]**

The v2 rework faithfully embodies the user's North Star: "오로지 statusline만 사용" (statusline ONLY). The concept change from skills+hooks to a single `statusLine` entry is realized completely — skills deleted, hooks removed, README/installers rewritten, dashboard enriched with per-model usage and cost. The user's frustration ("📊 Dashboard 가 보이지 않아") is root-caused and fixed (missing OSC 8 link param wired end-to-end). The dashboard now delivers actionable per-model cost visibility, directly satisfying mandate 4. UX is improved: one integration point, no background processes, data refreshes on every state change.

**[2. 1:1 Cross-Validation Results]**

Plan vs code: 11 of 12 requirements fully match. The link wiring chain (REQ-101) is complete with no gaps. Per-model costing (REQ-107) uses session-level model granularity (the maximum available from the data layer — per-turn model is not persisted in transcripts, correctly noted as an out-of-scope agy-side limitation). Test suite 10 regression guards actively prevent re-introduction of skills/hooks. No hacky workarounds detected.

**Devil's advocate findings:**
- `package.json` L23 `"token-tracker"` keyword and L43 `"integrations"` files entry are stale v1 artifacts. Minor: npm silently ignores the missing directory; the keyword is cosmetic. But `package.json` is a user-facing surface (npm registry) and should reflect the v2 concept.
- No other vulnerabilities, edge cases, or performance concerns found. The models pass rides the existing single-pass loop (no extra Date parses). `--serve` remains localhost-only. Zero deps maintained.

**[3. Inquiries for VP & User]**

No critical trade-off decisions required. The 2 remediation items are trivial 2-line edits to `package.json` with no functional impact. VP may delegate to code-light mode for a 5-minute fix, or accept the CONDITIONAL verdict if the stale keywords are deemed cosmetic-only.

**[4. Final Verdict]**

### **CONDITIONAL APPROVAL 🔶**

11 of 12 requirements ✅ PASS. 1 requirement 🔶 CONDITIONAL (REQ-112: 2 stale `package.json` references).

The implementation fully satisfies all 4 user mandates in spirit and letter. The 2 stale `package.json` references are cosmetic leftovers that do not affect functionality, user experience, or any mandate — but they should be cleaned for completeness per the "boil the ocean" ethos.

**Advancement:** Fix the 2 remediation items → re-verify REQ-112 → advance to P7 (VP independent review). If VP deems the items cosmetic and accepts, may advance with documented waiver.

---

## Remediation Items

| # | Item | File | Line | Fix | Mode | Effort |
|---|---|---|---|---|---|---|
| 1 | Remove stale `"token-tracker"` keyword | `package.json` | L23 | Delete `"token-tracker",` from keywords array | code-light | 1 line |
| 2 | Remove stale `"integrations"` from files array | `package.json` | L43 | Delete `"integrations",` from files array | code-light | 1 line |

**Post-fix verification:** Run `node test/run-tests.js` (suite 10 package/bin integrity test should still pass — it checks bin registrations, not files array). Confirm `npm pack --dry-run` no longer references `integrations/`.

---

## Evidence

### Code Files Independently Read by CPO
| File | Lines Read | Purpose |
|---|---|---|
| `package.json` | 1-48 | Dep check (zero deps), stale ref check (2 found) |
| `src/index.js` | search: L350-366 | Link build + options.link passthrough |
| `src/hook-handler.js` | search: L148 | renderRealTimeBadge 4th param wiring |
| `src/formatter.js` | L620, L648-706 | renderRealTimeBadge signature + renderHelp (clean) |
| `src/html-report.js` | L31, L115-161, L212-233, L402, L436, L532 | Payload v2, models array, per-session costing, renderModels, HTML section |
| `src/osc8.js` | search: L31, L49-51 | formatOsc8Link, isOsc8Supported, dashboardFileUrl |
| `src/i18n.js` | search: L127, L135-136, L257-258, L266-267, L388-389, L397-398, L519-520, L528-529 | dashboardLink + modelsTitle + modelColumn ×4 locales |
| `src/serve.js` | search: L149 | 127.0.0.1 bind confirmation |
| `test/run-tests.js` | search: L733-756, L1115, L1160, L1184-1226, L1255-1257, L1410 | Suite 10 guards, suite 15 W4 tests, version=2 assertions |
| `README.md` | search: L9, L21, L283, L288-291, L221-223, L256-258 | Statusline-only rewrite, snippet, options |
| `scripts/install.bat` | search: L36-50 | StatusLine instructions, no skill copy |
| `scripts/install.sh` | search: L40-54 | Same + POSIX note |

### Search Sweeps Performed
| Pattern | Scope | Result |
|---|---|---|
| `dashboardLink\|formatOsc8Link\|options.link\|noLink` | src/*.js | 11 hits — link chain confirmed |
| `modelsTitle\|modelColumn\|DASHBOARD_PAYLOAD_VERSION\|models:\|ModelRow\|renderModels` | src/*.js | 13 hits — W4 confirmed |
| `renderRealTimeBadge\|renderHelp\|skill\|hooks.json\|/usage\|/tokens` | src/*.js | formatter.js L612 PostInvocation JSDoc only (acceptable) |
| `skill\|hooks.json\|/usage\|/tokens\|token-tracker` | *.{js,md,bat,sh,json} | package.json L23+L43 stale; test guards intentional; docs historical |
| `statusLine\|skill\|hooks.json\|/usage\|/tokens\|write-dashboard\|PROGRA~1\|ONLY integration` | README.md | 7 hits — all statusline-only, 0 stale |
| `skill\|hooks.json\|SKILL\|statusLine\|write-dashboard\|PROGRA~1\|settings.json` | scripts/install.* | 4 hits each — statusLine instructions only, 0 stale |
| `127.0.0.1\|listen\|host` | src/serve.js | L149 `server.listen(port, '127.0.0.1')` confirmed |

### VP-Verified Live Evidence (cross-checked)
| Evidence | CPO Cross-Check |
|---|---|
| `agy -p "/skills"` → no tokens/usage | Code: skills deleted from repo + live ✅ |
| `~/.gemini/hooks.json` → `{}` | Batch C report confirms ✅ |
| settings.json statusLine → 8.3 paths + --write-dashboard | Batch C report confirms ✅ |
| `--hook --raw` → ends `📊 Dashboard` | Code: link chain complete ✅ |
| dashboard-data.js → models array + costUsd | Code: buildDashboardPayload emits models ✅ |
| 90 tests passed / 0 failed | Code: test structure supports ✅ |

---

## Affected File List

**This audit report (new):**
- `docs/260827_0001_session_usage-dashboard-integration/220100_ask-report.md`

**No source files were modified by the CPO.** This is a reports-only audit per CPO constraints.