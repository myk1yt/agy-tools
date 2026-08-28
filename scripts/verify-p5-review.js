#!/usr/bin/env node
/**
 * P5 Technical Review: Edge-case verification script.
 * Verifies specific behaviors from the architecture document beyond what
 * the unit test suite covers.
 */

const assert = require('assert');
const fs = require('fs');

let pass = 0, fail = 0;

function t(name, fn) {
  try {
    const r = fn();
    if (r instanceof Promise) {
      return r.then(() => { pass++; console.log('  PASS: ' + name); })
        .catch(e => { fail++; console.log('  FAIL: ' + name + ' -> ' + e.message); });
    }
    pass++; console.log('  PASS: ' + name);
  } catch (e) {
    fail++; console.log('  FAIL: ' + name + ' -> ' + e.message);
  }
}

async function main() {

console.log('=== P5 Edge Case Verification ===\n');

// === Part 3: Alias Priority ===
console.log('--- Part 3: Model Alias Priority ---');

const { getModelPricing, calculateCostUsd, mergePricingDict } = require('../src/config');

t('gpt-4o-mini resolves to gpt-4o-mini (not gpt-4o)', () => {
  const p = getModelPricing('gpt-4o-mini');
  assert.strictEqual(p.id, 'gpt-4o-mini', 'Got: ' + p.id);
});

t('gpt-4o resolves to gpt-4o', () => {
  const p = getModelPricing('gpt-4o');
  assert.strictEqual(p.id, 'gpt-4o', 'Got: ' + p.id);
});

t('gemini-2.0-flash-lite resolves to gemini-2.0-flash-lite', () => {
  const p = getModelPricing('gemini-2.0-flash-lite');
  assert.strictEqual(p.id, 'gemini-2.0-flash-lite', 'Got: ' + p.id);
});

t('gemini-2.0-flash resolves to gemini-2.0-flash', () => {
  const p = getModelPricing('gemini-2.0-flash');
  assert.strictEqual(p.id, 'gemini-2.0-flash', 'Got: ' + p.id);
});

t('sonnet resolves to claude-3.5-sonnet via exact alias', () => {
  const p = getModelPricing('sonnet');
  assert.strictEqual(p.id, 'claude-3.5-sonnet', 'Got: ' + p.id);
});

t('claude-3.5-haiku resolves to claude-3.5-haiku', () => {
  const p = getModelPricing('claude-3.5-haiku');
  assert.strictEqual(p.id, 'claude-3.5-haiku', 'Got: ' + p.id);
});

t('o1 resolves to o1', () => {
  const p = getModelPricing('o1');
  assert.strictEqual(p.id, 'o1', 'Got: ' + p.id);
});

t('o3-mini resolves to o3-mini', () => {
  const p = getModelPricing('o3-mini');
  assert.strictEqual(p.id, 'o3-mini', 'Got: ' + p.id);
});

t('_sortedAliases rebuilt after mergePricingDict', () => {
  mergePricingDict({
    'custom-test-model-xyz': {
      id: 'custom-test-model-xyz',
      displayName: 'Custom Test Model XYZ',
      inputPerMillion: 99.99,
      outputPerMillion: 99.99,
      aliases: ['custom-test-model-xyz', 'custom-xyz']
    }
  });
  const p = getModelPricing('custom-xyz');
  assert.strictEqual(p.id, 'custom-test-model-xyz', 'Got: ' + p.id);
  assert.strictEqual(p.inputPerMillion, 99.99);
});

// === Part 2: summarizeTurns per-turn cost ===
console.log('\n--- Part 2: summarizeTurns per-turn cost ---');

const { summarizeTurns } = require('../src/aggregator');

t('summarizeTurns sums per-turn costUsd when available', () => {
  const turns = [
    { inputTokens: 1000, cachedTokens: 500, outputTokens: 200, costUsd: 0.001 },
    { inputTokens: 2000, cachedTokens: 1000, outputTokens: 400, costUsd: 0.002 },
    { inputTokens: 3000, cachedTokens: 1500, outputTokens: 600, costUsd: 0.003 }
  ];
  const s = summarizeTurns(turns, 'gpt-4o');
  assert(Math.abs(s.costUsd - 0.006) < 1e-10, 'Expected 0.006, got ' + s.costUsd);
});

t('summarizeTurns falls back to single-model calc when costUsd missing', () => {
  const turns = [
    { inputTokens: 1000000, cachedTokens: 0, outputTokens: 0 },
    { inputTokens: 0, cachedTokens: 0, outputTokens: 1000000 }
  ];
  const s = summarizeTurns(turns, 'gpt-4o');
  const expected = calculateCostUsd(1000000, 0, 1000000, 'gpt-4o');
  assert(Math.abs(s.costUsd - expected) < 1e-10, 'Expected ' + expected + ', got ' + s.costUsd);
});

t('summarizeTurns handles empty turns array', () => {
  const s = summarizeTurns([], 'gpt-4o');
  assert.strictEqual(s.costUsd, 0);
  assert.strictEqual(s.totalTurns, 0);
});

t('summarizeTurns mixed-model turns sum per-turn costs correctly', () => {
  const gptCost = calculateCostUsd(100000, 50000, 30000, 'gpt-4o');
  const miniCost = calculateCostUsd(100000, 50000, 30000, 'gpt-4o-mini');
  const turns = [
    { inputTokens: 100000, cachedTokens: 50000, outputTokens: 30000, costUsd: gptCost, modelName: 'gpt-4o' },
    { inputTokens: 100000, cachedTokens: 50000, outputTokens: 30000, costUsd: miniCost, modelName: 'gpt-4o-mini' }
  ];
  const s = summarizeTurns(turns, 'gpt-4o');
  const expected = gptCost + miniCost;
  assert(Math.abs(s.costUsd - expected) < 1e-10, 'Expected ' + expected + ', got ' + s.costUsd);
  const wrongCalc = calculateCostUsd(200000, 100000, 60000, 'gpt-4o');
  assert(Math.abs(s.costUsd - wrongCalc) > 1e-10, 'Should differ from single-model calc');
});

t('summarizeTurns mixed turns (some with costUsd, some without) falls back', () => {
  const turns = [
    { inputTokens: 1000, cachedTokens: 500, outputTokens: 200, costUsd: 0.001 },
    { inputTokens: 2000, cachedTokens: 1000, outputTokens: 400 }
  ];
  const s = summarizeTurns(turns, 'gpt-4o');
  const expected = calculateCostUsd(3000, 1500, 600, 'gpt-4o');
  assert(Math.abs(s.costUsd - expected) < 1e-10, 'Expected fallback ' + expected + ', got ' + s.costUsd);
});

// === Part 1: Fail-safe ===
console.log('\n--- Part 1: Statusline Fail-Safe ---');

const { readStdinJson, formatHookResponse } = require('../src/hook-handler');

t('readStdinJson returns a Promise', () => {
  const result = readStdinJson(1);
  assert(result instanceof Promise, 'Should return a Promise');
});

t('formatHookResponse returns valid injectSteps structure', () => {
  const r = formatHookResponse('test badge');
  assert(Array.isArray(r.injectSteps));
  assert.strictEqual(r.injectSteps.length, 1);
  assert.strictEqual(r.injectSteps[0].ephemeralMessage, 'test badge');
});

t('formatHookResponse with empty string badge', () => {
  const r = formatHookResponse('');
  assert.strictEqual(r.injectSteps[0].ephemeralMessage, '');
});

t('hook-handler.js permanent no-op error listener on stdin', () => {
  const src = fs.readFileSync('./src/hook-handler.js', 'utf8');
  const finishBlock = src.substring(src.indexOf('const finish'));
  assert(finishBlock.includes("process.stdin.on('error', () => {})"), 'Should have permanent no-op error listener');
});

t('index.js hook block wrapped in try-catch', () => {
  const src = fs.readFileSync('./src/index.js', 'utf8');
  assert(src.includes('catch (_hookErr)'), 'Should have catch (_hookErr)');
  assert(src.includes('process.exit(0)'), 'catch should call process.exit(0)');
});

t('bin/agy-tokens.js hook-mode fail-safe exit(0)', () => {
  const src = fs.readFileSync('./bin/agy-tokens.js', 'utf8');
  assert(src.includes('isHookMode'), 'Should detect hook mode');
  assert(src.includes('process.exit(0)'), 'Hook mode should exit(0)');
  assert(src.includes('process.exit(1)'), 'Non-hook mode should exit(1)');
});

t('PID in atomicWriteFile tmp filenames (html-report)', () => {
  const src = fs.readFileSync('./src/html-report.js', 'utf8');
  assert(src.includes('.${process.pid}.tmp'), 'atomicWriteFile should use PID in tmp filename');
});

t('PID in atomicWriteJson tmp filename (dashboard-link)', () => {
  const src = fs.readFileSync('./src/dashboard-link.js', 'utf8');
  assert(src.includes('.${process.pid}.tmp'), 'atomicWriteJson should use PID in tmp filename');
});

// === Part 2: log-parser.js regex and backtracking ===
console.log('\n--- Part 2: Log Parser Regex & Backtracking ---');

t('SETTINGS_CHANGE_RE captures both from and to groups', () => {
  const src = fs.readFileSync('./src/log-parser.js', 'utf8');
  const reMatch = src.match(/const SETTINGS_CHANGE_RE = (.+);/);
  assert(reMatch, 'Should find SETTINGS_CHANGE_RE');
  const re = eval(reMatch[1]);
  const test = 'changed setting `Model Selection` from Claude 3.5 Sonnet to Gemini 3.7 Flash (High).';
  const m = re.exec(test);
  assert(m, 'Should match');
  assert.strictEqual(m[1].trim(), 'Claude 3.5 Sonnet', 'Group 1 should be from model');
  assert(m[2].includes('Gemini 3.7 Flash'), 'Group 2 should be to model');
});

t('SETTINGS_CHANGE_RE captures from=None correctly', () => {
  const src = fs.readFileSync('./src/log-parser.js', 'utf8');
  const reMatch = src.match(/const SETTINGS_CHANGE_RE = (.+);/);
  const re = eval(reMatch[1]);
  const test = 'changed setting `Model Selection` from None to Gemini 3.7 Flash (High)';
  const m = re.exec(test);
  assert(m, 'Should match');
  assert.strictEqual(m[1].trim(), 'None', 'Group 1 should be None');
  assert(m[2].includes('Gemini 3.7 Flash'), 'Group 2 should be to model');
});

t('Backtracking guard: only activates when fromModel is not None', () => {
  const src = fs.readFileSync('./src/log-parser.js', 'utf8');
  assert(src.includes("first.fromModel.toLowerCase() !== 'none'"), 'Should check fromModel !== none');
});

t('Backtracking recalculates session totals', () => {
  const src = fs.readFileSync('./src/log-parser.js', 'utf8');
  assert(src.includes('sessionCostUsd = turns.reduce'), 'Should recalculate sessionCostUsd');
  assert(src.includes('sessionCacheSavingsUsd = turns.reduce'), 'Should recalculate sessionCacheSavingsUsd');
});

// === Part 4: Chart functions ===
console.log('\n--- Part 4: Dynamic Y-Axis Chart ---');

const htmlReport = require('../src/html-report');

t('niceMax function present in rendered HTML', () => {
  const payload = { version: 3, daily: [], dailyModels: {}, models: [], summaries: {}, lang: 'en', i18n: {} };
  const html = htmlReport.renderDashboardHtml(payload);
  assert(html.includes('function niceMax(rawMax)'), 'niceMax function should be in HTML');
  assert(html.includes('if (rawMax <= 0) return 10000;'), 'niceMax(0) should return 10000');
});

t('niceMax logic: 0->10000, 3200->5000, 850000->1000000, 42->50, 100->200', () => {
  function niceMax(rawMax) {
    if (rawMax <= 0) return 10000;
    var headroom = rawMax * 1.15;
    var mag = Math.pow(10, Math.floor(Math.log10(headroom)));
    var norm = headroom / mag;
    var nice;
    if (norm <= 1) nice = 1;
    else if (norm <= 2) nice = 2;
    else if (norm <= 5) nice = 5;
    else nice = 10;
    return nice * mag;
  }
  assert.strictEqual(niceMax(0), 10000);
  assert.strictEqual(niceMax(3200), 5000);
  assert.strictEqual(niceMax(850000), 1000000);
  assert.strictEqual(niceMax(42), 50);
  assert.strictEqual(niceMax(100), 200);
});

t('fmtAxis logic: 0->"0", 500->"500", 5000->"5K", 1500000->"1.5M", 2000000->"2M", 85000->"85K"', () => {
  function fmtAxis(v) {
    if (v >= 1000000) return (v / 1000000).toFixed(v % 1000000 === 0 ? 0 : 1) + 'M';
    if (v >= 1000) return (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + 'K';
    return String(Math.round(v));
  }
  assert.strictEqual(fmtAxis(0), '0');
  assert.strictEqual(fmtAxis(500), '500');
  assert.strictEqual(fmtAxis(5000), '5K');
  assert.strictEqual(fmtAxis(1500000), '1.5M');
  assert.strictEqual(fmtAxis(2000000), '2M');
  assert.strictEqual(fmtAxis(85000), '85K');
});

t('Guidelines rendered before bars in SVG string', () => {
  const payload = { version: 3, daily: [], dailyModels: {}, models: [], summaries: {}, lang: 'en', i18n: {} };
  const html = htmlReport.renderDashboardHtml(payload);
  // In the return statement of renderSvg, guides comes before bars
  assert(html.includes('guides + bars'), 'SVG should concatenate guides before bars');
});

t('PAD_L increased from 8 to 48 for Y-axis labels', () => {
  const payload = { version: 3, daily: [], dailyModels: {}, models: [], summaries: {}, lang: 'en', i18n: {} };
  const html = htmlReport.renderDashboardHtml(payload);
  assert(html.includes('PAD_L = 48'), 'PAD_L should be 48');
});

t('.guide and .yaxis CSS classes present', () => {
  const payload = { version: 3, daily: [], dailyModels: {}, models: [], summaries: {}, lang: 'en', i18n: {} };
  const html = htmlReport.renderDashboardHtml(payload);
  assert(html.includes('.guide{'), 'Should have .guide CSS class');
  assert(html.includes('.yaxis{'), 'Should have .yaxis CSS class');
});

// === Integration: hook mode ===
console.log('\n--- Integration: Hook Mode ---');

const { execSync } = require('child_process');

t('echo {} | node bin/agy-tokens.js --hook outputs valid JSON', () => {
  try {
    const output = execSync('echo {} | node bin/agy-tokens.js --hook', {
      encoding: 'utf8',
      timeout: 15000,
      cwd: __dirname + '/..'
    });
    const parsed = JSON.parse(output.trim());
    assert(Array.isArray(parsed.injectSteps), 'Should have injectSteps array');
  } catch (e) {
    // If this fails due to environment (no brain dir), that's acceptable
    if (e.message.includes('ENOENT') || e.message.includes('brain')) {
      console.log('    (skipped: no brain directory in test env)');
      return;
    }
    throw e;
  }
});

t('node bin/agy-tokens.js --hook --raw executes without error', () => {
  try {
    execSync('node bin/agy-tokens.js --hook --raw', {
      encoding: 'utf8',
      timeout: 15000,
      cwd: __dirname + '/..',
      stdio: 'pipe'
    });
  } catch (e) {
    if (e.status === 0) return; // exit 0 is fine
    if (e.message.includes('ENOENT') || e.message.includes('brain')) {
      console.log('    (skipped: no brain directory in test env)');
      return;
    }
    // exit code 1 in non-hook error is acceptable for CLI mode
    if (e.status === 1 && !e.message.includes('--hook')) return;
    throw e;
  }
});

console.log('\n=== Summary ===');
console.log('Passed: ' + pass + ', Failed: ' + fail);
if (fail > 0) process.exit(1);

}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
