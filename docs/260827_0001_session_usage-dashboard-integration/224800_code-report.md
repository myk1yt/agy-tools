# Code Report — Dynamic I18N Dashboard & System Locale Fix

**Mode:** code | **Date:** 2026-08-27 | **Time:** 22:48 KST
**Session:** docs/260827_0001_session_usage-dashboard-integration/
**Task:** Dashboard displayed in Chinese (`zh`) instead of Korean (`ko`) after previous fix; make the dashboard follow the system locale dynamically and update I18N in real time.

---

## Status
COMPLETE — Fixed system locale detection priority and dynamic dashboard I18N payload streaming with client-side live re-rendering. 104/104 tests pass across 18 suites; all live verification gates verified.

---

## Objective and Scope
- **Objective:** Enable the dashboard to dynamically follow the system locale (Korean by default on `ko-KR` systems) and update translations on-the-fly via SSE and script-tag polling without requiring manual HTML regeneration.
- **Acceptance Criteria:**
  1. [`src/i18n.js`](../../src/i18n.js) exports [`getAllTranslations(locale)`](../../src/i18n.js:613) providing full dictionary with fallback to default locale.
  2. [`src/html-report.js`](../../src/html-report.js) [`buildDashboardPayload`](../../src/html-report.js:91) includes full `i18n` object containing all UI translation keys for the resolved locale.
  3. [`src/html-report.js`](../../src/html-report.js) [`renderDashboardHtml`](../../src/html-report.js:316) embedded JavaScript updates the global `I18N` object from `payload.i18n` via `updateI18N(p)` before re-rendering UI elements upon SSE or polling data arrivals.
  4. [`src/html-report.js`](../../src/html-report.js) [`writeDashboardFiles`](../../src/html-report.js:608) detects locale mismatches and forces regeneration of `dashboard.html` and data files on locale change.
  5. [`src/i18n.js`](../../src/i18n.js) [`detectSystemLocale()`](../../src/i18n.js:555) prioritizes native `Intl.DateTimeFormat` on host systems over synthetic environment variables.
  6. Zero new npm dependencies; all writes atomic.
- **Problem Scope:** Fix static I18N dictionary baking in dashboard HTML and resolve system locale discrepancy.
- **Expected Edit Scope:** [`src/i18n.js`](../../src/i18n.js), [`src/html-report.js`](../../src/html-report.js), [`test/run-tests.js`](../../test/run-tests.js).
- **Actual Edit Scope:** [`src/i18n.js`](../../src/i18n.js), [`src/html-report.js`](../../src/html-report.js), [`test/run-tests.js`](../../test/run-tests.js), [`scripts/verify-i18n.js`](../../scripts/verify-i18n.js) (verification harness).
- **Risk Level:** LOW (pure localization and client-side rendering enhancement).

---

## Root Cause or Rationale
- **Symptom:** The dashboard displayed in Chinese (`模型使用量 & 成本`, `每日明细`, etc.) on a Korean operating system, even when live `/data.json` had `lang=ko`.
- **Root Cause:**
  1. `dashboard.html` had the I18N dictionary embedded statically at generation time by `renderDashboardHtml` and was never updated dynamically by incoming SSE/poll data payloads.
  2. `writeDashboardFiles` only wrote HTML if `force: true` or `htmlMissing`, skipping HTML re-generation on subsequent turns even when data/locale changed.
  3. `detectSystemLocale()` checked POSIX `LC_ALL`/`LANG` (often set to `en_US.UTF-8` in terminal environments like VS Code/PowerShell) before `Intl.DateTimeFormat`, masking the host OS's `ko-KR` locale.
- **Evidence:** `Intl.DateTimeFormat().resolvedOptions().locale` returned `'ko-KR'`, but `dashboard.html` on disk contained static `zh` strings and lacked client-side I18N update hooks.
- **Why the Fix Works:**
  - `buildDashboardPayload` supplies the complete locale dictionary in `payload.i18n`.
  - Embedded client JS `updateI18N(p)` dynamically mutates `I18N` and all static title DOM elements (`#dashTitle`, `#chartTitle`, `#modelsTitle`, `#tableTitle`, `#empty`, `document.title`, `html.lang`) whenever new payload arrives.
  - `writeDashboardFiles` checks for `localeMismatch` (`diskLangMismatch || htmlLangMismatch`) and regenerates HTML and data artifacts whenever the locale changes.
  - `detectSystemLocale` queries `process.env.AGY_LANG` then `Intl.DateTimeFormat` host locale before POSIX env variables.

---

## Actions Taken & Changes

| File | Change | Reason |
|---|---|---|
| [`src/i18n.js`](../../src/i18n.js:613) | Added `getAllTranslations(locale)` helper and exported it in `module.exports`. | Allow payload builder to retrieve the full translation map with default fallbacks. |
| [`src/i18n.js`](../../src/i18n.js:555) | Updated `detectSystemLocale()` priority: `AGY_LANG` → `Intl.DateTimeFormat` → `LC_ALL` → `LANG` → `LANGUAGE` → fallback. | Ensures native host OS locale (`ko-KR`) is respected when no explicit CLI env override is given. |
| [`src/html-report.js`](../../src/html-report.js:91) | In `buildDashboardPayload`, included `i18n: getAllTranslations(lang)` and resolved default `lang` from `opts.lang \|\| getLocale() \|\| 'en'`. | Provide full I18N dictionary in all payload transports (SSE, /data.json, dashboard-data.js). |
| [`src/html-report.js`](../../src/html-report.js:316) | In `renderDashboardHtml`, added `updateI18N(p)` function and called it in `render(p)`; added element IDs (`#dashTitle`, `#chartTitle`, `#modelsTitle`, `#tableTitle`, `#empty`) to static HTML headers. | Enables immediate client-side language switching on SSE push or script poll without page reload. |
| [`src/html-report.js`](../../src/html-report.js:608) | In `writeDashboardFiles`, added `diskLangMismatch` and `htmlLangMismatch` detection to force rewrite of HTML and data files when locale changes. | Ensures static offline HTML shell always reflects current locale. |
| [`test/run-tests.js`](../../test/run-tests.js:1260) | Extended Suite 15 with 3 new unit tests: full `i18n` payload across all 4 locales, locale change regeneration, and `updateI18N` template markup verification. | Regression prevention and test-driven verification. |
| [`scripts/verify-i18n.js`](../../scripts/verify-i18n.js) | Created end-to-end multi-language runtime verification script. | Validates hook badge, disk HTML, live SSE server `/data.json`, and dynamic language switching across `ko`, `ja`, and default locales. |

---

## Preserved Invariants
- Zero new npm dependencies; Node core modules only (`fs`, `path`, `http`, `os`).
- All file writes remain atomic (tmp + rename with Windows retry and direct write fallback).
- Local SSE dashboard server binds `127.0.0.1` exclusively with `Cache-Control: no-store`.
- Backward compatibility: offline `file://` usage via `<script src="dashboard-data.js">` injection polling remains fully functional without `fetch()`/XHR (C3 compliant).

---

## Verification & Live Evidence

| Level | Command/Check | Result | Evidence |
|---|---|---|---|
| Level 1 (Structural) | `node --check src/i18n.js src/html-report.js` | PASS | Clean syntax, zero lint/parse errors |
| Level 2 (Unit Tests) | `node test/run-tests.js` | PASS | **104 passed, 0 failed, 104 total** (18 suites), 2900ms duration |
| Level 3 (Integration / Link) | `node scripts/verify-dashboard-link.js` | PASS | **5/5 gates passed** (G2 http link in VS Code, G3 file:// link outside, G4a 200 OK, G4b port file, G5 timing) |
| Level 4 (Dynamic I18N Verification) | `node scripts/verify-i18n.js` | PASS | **All 4 steps passed:**<br>1. Default `ko-KR` hook: `이번 턴: 818 ($0.0005) \| 오늘 누적: 13.29M ($1.419) \| 캐시: 99% \| 📊 대시보드`<br>2. HTML `<title>`: `Antigravity 토큰 대시보드`, `<html lang="ko">`<br>3. `data.json` payload: `lang: "ko"`, `modelsTitle: "모델별 사용량 & 비용"`, `dashboardTitle: "Antigravity 토큰 대시보드"`<br>4. Live server `http://127.0.0.1:<port>/data.json` → status 200, `lang: "ko"`, `modelsTitle: "모델별 사용량 & 비용"`<br>5. `AGY_LANG=ja` override: Hook `今回ターン: 818 \| 本日累計: 13.29M \| キャッシュ: 99% \| 📊 ダッシュボード`, HTML `<html lang="ja">`, `data.json` `modelsTitle: "モデル別使用量 & コスト"`<br>6. Restored default locale: `ko` verified. |

---

## Issues Discovered & Resolved
1. **Initial throttle test failure on rapid locale switch:** `writeDashboardFiles` enforced a 3000ms minimum interval between writes for steady-state data polling. When switching locale within the same process turn, the throttle previously blocked `writeData`. Resolved by introducing `localeMismatch` (`diskLangMismatch || htmlLangMismatch`) which bypasses the throttle to immediately write new language assets whenever the locale changes.
2. **Terminal environment variable override:** In VS Code terminals on Windows, `$env:LANG` is defaulted to `en_US.UTF-8` by terminal emulators despite the Windows host being `ko-KR`. Resolved by prioritizing `Intl.DateTimeFormat` over POSIX fallback variables while still honoring `process.env.AGY_LANG` when specified.

---

## Next Step Recommendations
- The user can open the dashboard in browser via the statusline link (`http://127.0.0.1:8787/` in VS Code or `dashboard.html` in browser) — it will now display fully in Korean (`Antigravity 토큰 대시보드`, `모델별 사용량 & 비용`, `일별 상세 (30일)`, etc.).
- Any dynamic updates streamed via SSE or polled from `dashboard-data.js` will preserve and automatically reflect the active locale.

---

## Affected File List
- Modified:
  - [`src/i18n.js`](../../src/i18n.js)
  - [`src/html-report.js`](../../src/html-report.js)
  - [`test/run-tests.js`](../../test/run-tests.js)
- Created:
  - [`scripts/verify-i18n.js`](../../scripts/verify-i18n.js)
  - [`docs/260827_0001_session_usage-dashboard-integration/224800_code-report.md`](224800_code-report.md)
- Untouched (verified):
  - `src/dashboard-link.js`
  - `src/serve.js`
  - `src/osc8.js`
  - `package.json`

---

## Final Statement
COMPLETE — Root cause identified and eliminated. Dynamic I18N streaming and host locale detection implemented, verified across all 18 test suites and live server endpoints.
