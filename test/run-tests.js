/**
 * @fileoverview Zero-dependency test runner and comprehensive test suite
 * for Antigravity Token & Cost Tracker, Remote Pricing Synchronization Engine,
 * and agy-tools developer suite.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const assert = require('assert');

const config = require('../src/config');
const i18n = require('../src/i18n');
const tokenizer = require('../src/tokenizer');
const logParser = require('../src/log-parser');
const cacheManager = require('../src/cache-manager');
const aggregator = require('../src/aggregator');
const formatter = require('../src/formatter');
const hookHandler = require('../src/hook-handler');
const priceSyncer = require('../src/price-syncer');
const { parseArgs } = require('../src/index');

/**
 * Test Runner Harness
 */
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

async function test(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (err) {
    failedTests++;
    failures.push({ name, error: err });
    console.log(`  \x1b[31m✗\x1b[0m ${name}`);
    console.log(`    \x1b[31m${err.message}\x1b[0m`);
    if (err.stack) {
      console.log(`    \x1b[90m${err.stack.split('\n').slice(1, 4).join('\n    ')}\x1b[0m`);
    }
  }
}

function describe(suiteName, fn) {
  console.log(`\n\x1b[1m\x1b[36m▶ ${suiteName}\x1b[0m`);
  return fn();
}

/**
 * Main Test Execution Runner
 */
async function runAllTests() {
  const startTime = Date.now();
  console.log('\x1b[1m\x1b[35m=======================================================');
  console.log('   Antigravity CLI Developer Toolkit (agy-tools) Test Suite');
  console.log('=======================================================\x1b[0m');

  // --- Suite 1: Tokenizer Unit Tests ---
  await describe('1. Tokenizer Unit Tests (Subword & Multilingual)', async () => {
    await test('Should return 0 for empty or non-string inputs', () => {
      assert.strictEqual(tokenizer.estimateTokens(''), 0);
      assert.strictEqual(tokenizer.estimateTokens(null), 0);
      assert.strictEqual(tokenizer.estimateTokens(undefined), 0);
    });

    await test('Should estimate English words accurately', () => {
      const tokens = tokenizer.estimateTokens('Hello world, this is a test.');
      assert(tokens >= 7 && tokens <= 10, `Expected 7-10 tokens, got ${tokens}`);
    });

    await test('Should tokenize Korean (Hangul) text with subword calibration', () => {
      const koText = '안녕하세요 Antigravity 토큰 계산기 테스트입니다.';
      const tokens = tokenizer.estimateTokens(koText);
      assert(tokens >= 15 && tokens <= 25, `Expected 15-25 tokens, got ${tokens}`);
    });

    await test('Should tokenize Japanese (Hiragana, Katakana, Kanji)', () => {
      const jaText = 'こんにちは世界、トークン計算のテストです。';
      const tokens = tokenizer.estimateTokens(jaText);
      assert(tokens >= 15 && tokens <= 25, `Expected 15-25 tokens, got ${tokens}`);
    });

    await test('Should tokenize Chinese (CJK Ideographs)', () => {
      const zhText = '你好世界，这是一个词元计算测试。';
      const tokens = tokenizer.estimateTokens(zhText);
      assert(tokens >= 12 && tokens <= 22, `Expected 12-22 tokens, got ${tokens}`);
    });

    await test('Should estimate code tokens across Dart, Python, JS, and Rust', () => {
      const dartCode = `
        import 'package:flutter/material.dart';
        class UserProfileWidget extends StatelessWidget {
          final String userId;
          const UserProfileWidget({super.key, required this.userId});
          @override
          Widget build(BuildContext context) => Container(child: Text(userId));
        }
      `;
      const dartTokens = tokenizer.estimateTokens(dartCode);
      assert(dartTokens >= 50 && dartTokens <= 110, `Expected 50-110 tokens for Dart snippet, got ${dartTokens}`);

      const pyCode = `
        def calculate_tokens(text: str) -> int:
            """Estimate tokens for a given string."""
            return len(text.split()) * 4
      `;
      const pyTokens = tokenizer.estimateTokens(pyCode);
      assert(pyTokens >= 15 && pyTokens <= 60, `Expected 15-60 tokens for Python snippet, got ${pyTokens}`);
    });

    await test('Should estimate message framing and tool call overhead', () => {
      const message = {
        role: 'model',
        tool_calls: [
          {
            name: 'view_file',
            args: { AbsolutePath: '/workspace/main.js', StartLine: 1, EndLine: 50 }
          }
        ]
      };
      const msgTokens = tokenizer.estimateMessageTokens(message);
      assert(msgTokens >= 15 && msgTokens <= 55, `Expected 15-55 tokens, got ${msgTokens}`);
    });
  });

  // --- Suite 2: Configuration & Dynamic Pricing Unit Tests ---
  await describe('2. Configuration & Dynamic Pricing Unit Tests', async () => {
    await test('Should resolve default pricing for Gemini 3.7 Flash', () => {
      const pricing = config.getModelPricing('Gemini 3.7 Flash (High)');
      assert.strictEqual(pricing.id, 'gemini-3.7-flash');
      assert.strictEqual(pricing.inputPerMillion, 0.15);
      assert.strictEqual(pricing.cachedInputPerMillion, 0.0375);
      assert.strictEqual(pricing.outputPerMillion, 0.60);
    });

    await test('Should resolve pricing for Claude 3.7 Sonnet', () => {
      const pricing = config.getModelPricing('claude-3.7-sonnet');
      assert.strictEqual(pricing.id, 'claude-3.7-sonnet');
      assert.strictEqual(pricing.inputPerMillion, 3.00);
      assert.strictEqual(pricing.cachedInputPerMillion, 0.30);
      assert.strictEqual(pricing.outputPerMillion, 15.00);
    });

    await test('Should resolve pricing for Claude 3.5 Haiku', () => {
      const pricing = config.getModelPricing('claude-3.5-haiku');
      assert.strictEqual(pricing.id, 'claude-3.5-haiku');
      assert.strictEqual(pricing.inputPerMillion, 0.80);
      assert.strictEqual(pricing.cachedInputPerMillion, 0.08);
      assert.strictEqual(pricing.outputPerMillion, 4.00);
    });

    await test('Should resolve pricing for Gemini 2.0 Flash Lite', () => {
      const pricing = config.getModelPricing('gemini-2.0-flash-lite');
      assert.strictEqual(pricing.id, 'gemini-2.0-flash-lite');
      assert.strictEqual(pricing.inputPerMillion, 0.075);
      assert.strictEqual(pricing.cachedInputPerMillion, 0.01875);
      assert.strictEqual(pricing.outputPerMillion, 0.30);
    });

    await test('Should resolve pricing for GPT-4o mini', () => {
      const pricing = config.getModelPricing('gpt-4o-mini');
      assert.strictEqual(pricing.id, 'gpt-4o-mini');
      assert.strictEqual(pricing.inputPerMillion, 0.15);
      assert.strictEqual(pricing.cachedInputPerMillion, 0.075);
      assert.strictEqual(pricing.outputPerMillion, 0.60);
    });

    await test('Should resolve pricing for o3-mini', () => {
      const pricing = config.getModelPricing('o3-mini');
      assert.strictEqual(pricing.id, 'o3-mini');
      assert.strictEqual(pricing.inputPerMillion, 1.10);
      assert.strictEqual(pricing.cachedInputPerMillion, 0.55);
      assert.strictEqual(pricing.outputPerMillion, 4.40);
    });

    await test('Should resolve pricing for o1', () => {
      const pricing = config.getModelPricing('o1');
      assert.strictEqual(pricing.id, 'o1');
      assert.strictEqual(pricing.inputPerMillion, 15.00);
      assert.strictEqual(pricing.cachedInputPerMillion, 7.50);
      assert.strictEqual(pricing.outputPerMillion, 60.00);
    });

    await test('Should dynamically resolve Flash Tier via smart fuzzy heuristic for unlisted models', () => {
      const modelsToTest = [
        'gemini-4.0-flash-next',
        'custom-turbo-model',
        'mistral-small',
        'unlisted-lite-model',
        'unknown-fast-preview'
      ];

      for (const m of modelsToTest) {
        const pricing = config.getModelPricing(m);
        assert.strictEqual(pricing.inputPerMillion, 0.15, `Expected input 0.15 for ${m}`);
        assert.strictEqual(pricing.cachedInputPerMillion, 0.0375, `Expected cached input 0.0375 for ${m}`);
        assert.strictEqual(pricing.outputPerMillion, 0.60, `Expected output 0.60 for ${m}`);
        assert.strictEqual(pricing.tier, 'flash', `Expected flash tier for ${m}`);
      }
    });

    await test('Should dynamically resolve Pro Tier via smart fuzzy heuristic for unlisted models', () => {
      const modelsToTest = [
        'gemini-3.5-pro-preview',
        'gemini-ultra-preview',
        'llama-3-70b-large',
        'qwen-max-latest',
        'deepseek-high'
      ];

      for (const m of modelsToTest) {
        const pricing = config.getModelPricing(m);
        assert.strictEqual(pricing.inputPerMillion, 1.25, `Expected input 1.25 for ${m}`);
        assert.strictEqual(pricing.cachedInputPerMillion, 0.3125, `Expected cached input 0.3125 for ${m}`);
        assert.strictEqual(pricing.outputPerMillion, 5.00, `Expected output 5.00 for ${m}`);
        assert.strictEqual(pricing.tier, 'pro', `Expected pro tier for ${m}`);
      }
    });

    await test('Should dynamically resolve Free Tier for unlisted free/flat/local/ollama models (e.g., custom-free-model)', () => {
      const modelsToTest = [
        'custom-free-model',
        'ollama-llama3',
        'my-local-model',
        'subscription-flat-tier',
        'zero-cost-model'
      ];

      for (const m of modelsToTest) {
        const pricing = config.getModelPricing(m);
        assert.strictEqual(pricing.inputPerMillion, 0.0, `Expected input 0.0 for ${m}`);
        assert.strictEqual(pricing.cachedInputPerMillion, 0.0, `Expected cached input 0.0 for ${m}`);
        assert.strictEqual(pricing.outputPerMillion, 0.0, `Expected output 0.0 for ${m}`);
        assert.strictEqual(pricing.tier, 'free', `Expected free tier for ${m}`);

        const cost = config.calculateCostUsd(500000, 500000, 500000, m);
        assert.strictEqual(cost, 0, `Expected cost 0 for free model ${m}`);
      }
    });

    await test('Should direct-invoke smartHeuristicPricing for heuristic resolution and display names', () => {
      const flashRes = config.smartHeuristicPricing('gemini-4.0-flash-next');
      assert.strictEqual(flashRes.tier, 'flash');
      assert.strictEqual(flashRes.inputPerMillion, 0.15);
      assert.strictEqual(flashRes.displayName, 'Gemini 4.0 Flash Next');

      const proRes = config.smartHeuristicPricing('gemini-3.5-pro-preview');
      assert.strictEqual(proRes.tier, 'pro');
      assert.strictEqual(proRes.inputPerMillion, 1.25);
      assert.strictEqual(proRes.displayName, 'Gemini 3.5 Pro Preview');

      const freeRes = config.smartHeuristicPricing('custom-free-model');
      assert.strictEqual(freeRes.tier, 'free');
      assert.strictEqual(freeRes.inputPerMillion, 0.0);
      assert.strictEqual(freeRes.displayName, 'Custom Free Model');
    });

    await test('Should fallback to Default Flash Tier with auto-generated displayName for unknown models', () => {
      const pricing = config.getModelPricing('deepseek-chat-general');
      assert.strictEqual(pricing.inputPerMillion, 0.15);
      assert.strictEqual(pricing.cachedInputPerMillion, 0.0375);
      assert.strictEqual(pricing.outputPerMillion, 0.60);
      assert(pricing.displayName.includes('Deepseek Chat General'));
    });

    await test('Should merge user configuration custom pricing models directly into MODEL_PRICING', () => {
      config.MODEL_PRICING['custom-enterprise-test'] = {
        id: 'custom-enterprise-test',
        displayName: 'Custom Enterprise Test',
        inputPerMillion: 2.50,
        cachedInputPerMillion: 0.50,
        outputPerMillion: 10.00,
        aliases: ['custom-enterprise-test', 'custom-enterprise']
      };

      const resolved = config.getModelPricing('custom-enterprise');
      assert.strictEqual(resolved.id, 'custom-enterprise-test');
      assert.strictEqual(resolved.inputPerMillion, 2.50);
      assert.strictEqual(resolved.cachedInputPerMillion, 0.50);
      assert.strictEqual(resolved.outputPerMillion, 10.00);
    });

    await test('Should calculate token cost accurately in USD', () => {
      // 1,000,000 fresh input ($0.15) + 1,000,000 cached input ($0.0375) + 1,000,000 output ($0.60) = $0.7875
      const cost = config.calculateCostUsd(1000000, 1000000, 1000000, 'gemini-3.7-flash');
      assert.strictEqual(Math.round(cost * 10000) / 10000, 0.7875);
    });

    await test('Should calculate cache savings accurately', () => {
      // 1,000,000 cached tokens regular cost ($0.15) - cached cost ($0.0375) = $0.1125 saved
      const savings = config.calculateCacheSavingsUsd(1000000, 'gemini-3.7-flash');
      assert.strictEqual(Math.round(savings * 10000) / 10000, 0.1125);
    });

    await test('Should convert currencies correctly', () => {
      const usdAmount = 10.0;
      assert.strictEqual(config.convertCurrency(usdAmount, 'usd'), 10.0);
      assert.strictEqual(config.convertCurrency(usdAmount, 'krw'), 14500.0);
      assert.strictEqual(config.convertCurrency(usdAmount, 'jpy'), 1550.0);
      assert.strictEqual(config.convertCurrency(usdAmount, 'eur'), 9.5);
    });
  });

  // --- Suite 3: i18n & Localization Unit Tests ---
  await describe('3. i18n & Localization Unit Tests', async () => {
    await test('Should have all required keys across en, ko, ja, zh dictionaries', () => {
      const enKeys = Object.keys(i18n.TRANSLATIONS.en);
      assert(enKeys.length > 20, 'English dictionary must have keys');

      for (const lang of ['ko', 'ja', 'zh']) {
        const langKeys = Object.keys(i18n.TRANSLATIONS[lang]);
        for (const key of enKeys) {
          assert(
            key in i18n.TRANSLATIONS[lang],
            `Missing key "${key}" in language "${lang}" dictionary`
          );
        }
      }
    });

    await test('Should translate with parameter substitution', () => {
      const translated = i18n.t('sessionNotFound', { id: 'test-123' }, 'en');
      assert.strictEqual(translated, 'Session "test-123" not found in brain directory.');

      const translatedKo = i18n.t('sessionNotFound', { id: 'test-123' }, 'ko');
      assert.strictEqual(translatedKo, '세션 "test-123"을(를) 찾을 수 없습니다.');
    });

    await test('Should switch and retain active locale', () => {
      i18n.setLocale('ko');
      assert.strictEqual(i18n.getLocale(), 'ko');
      assert.strictEqual(i18n.t('periodToday'), '오늘');

      i18n.setLocale('ja');
      assert.strictEqual(i18n.getLocale(), 'ja');
      assert.strictEqual(i18n.t('periodToday'), '今日');

      i18n.setLocale('zh');
      assert.strictEqual(i18n.getLocale(), 'zh');
      assert.strictEqual(i18n.t('periodToday'), '今天');

      i18n.setLocale('en');
      assert.strictEqual(i18n.getLocale(), 'en');
      assert.strictEqual(i18n.t('periodToday'), 'Today');
    });
  });

  // --- Suite 4: Log Parser & Transcript Processing Unit Tests ---
  await describe('4. Log Parser Unit Tests', async () => {
    const tempDir = path.join(os.tmpdir(), `agy_test_parser_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    const mockTranscriptFile = path.join(tempDir, 'transcript.jsonl');
    const sampleLines = [
      JSON.stringify({
        step_index: 0,
        source: 'USER_EXPLICIT',
        type: 'USER_INPUT',
        created_at: '2026-08-27T08:00:00Z',
        content: 'Please refactor the database layer.'
      }),
      JSON.stringify({
        step_index: 1,
        source: 'MODEL',
        type: 'PLANNER_RESPONSE',
        created_at: '2026-08-27T08:00:05Z',
        tool_calls: [{ name: 'view_file', args: { AbsolutePath: '/src/db.js' } }]
      }),
      JSON.stringify({
        step_index: 2,
        source: 'SYSTEM',
        type: 'VIEW_FILE',
        created_at: '2026-08-27T08:00:06Z',
        content: 'const db = require("sqlite3");\nfunction connect() { return new db.Database(); }'
      }),
      JSON.stringify({
        step_index: 3,
        source: 'MODEL',
        type: 'PLANNER_RESPONSE',
        created_at: '2026-08-27T08:00:10Z',
        content: 'I have reviewed the database file and planned the refactor.'
      })
    ];
    fs.writeFileSync(mockTranscriptFile, sampleLines.join('\n'), 'utf8');

    await test('Should parse transcript.jsonl stream into structured session', async () => {
      const parsed = await logParser.parseTranscriptFile(
        mockTranscriptFile,
        'test-session-001',
        { title: 'Refactor DB', workspace: '/test/workspace' },
        'gemini-3.7-flash'
      );

      assert.strictEqual(parsed.sessionId, 'test-session-001');
      assert.strictEqual(parsed.turnCount, 4);
      assert(parsed.totalTokens > 1000, `Expected > 1000 total tokens with baseline, got ${parsed.totalTokens}`);
      assert(parsed.costUsd > 0, 'Cost must be greater than 0');
      assert(parsed.turns.length === 4, 'Should contain 4 turns');
    });

    await test('Should handle malformed or empty lines gracefully', async () => {
      const corruptFile = path.join(tempDir, 'corrupt.jsonl');
      fs.writeFileSync(corruptFile, 'INVALID JSON LINE\n\n{"incomplete":\n', 'utf8');

      const parsed = await logParser.parseTranscriptFile(
        corruptFile,
        'corrupt-session',
        {},
        'gemini-3.7-flash'
      );

      assert.strictEqual(parsed.turnCount, 0);
      assert.strictEqual(parsed.totalTokens, 0);
    });

    // Cleanup temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_e) {}
  });

  // --- Suite 5: Cache Manager Unit Tests ---
  await describe('5. Cache Manager Unit Tests', async () => {
    const tempDir = path.join(os.tmpdir(), `agy_test_cache_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const cacheFile = path.join(tempDir, 'test_cache.json');

    await test('Should return clean initial cache structure if file does not exist', () => {
      const c = cacheManager.loadCache(cacheFile);
      assert.strictEqual(c.version, cacheManager.CACHE_SCHEMA_VERSION);
      assert.deepStrictEqual(c.sessions, {});
    });

    await test('Should save and reload cache atomically', () => {
      const sampleCache = {
        version: cacheManager.CACHE_SCHEMA_VERSION,
        lastUpdated: new Date().toISOString(),
        sessions: {
          'sess-1': {
            sessionId: 'sess-1',
            totalTokens: 5000,
            costUsd: 0.005,
            mtimeMs: 12345678,
            size: 1024
          }
        }
      };

      cacheManager.saveCache(sampleCache, cacheFile);
      assert(fs.existsSync(cacheFile), 'Cache file must exist');

      const loaded = cacheManager.loadCache(cacheFile);
      assert.strictEqual(loaded.sessions['sess-1'].totalTokens, 5000);
      assert.strictEqual(loaded.sessions['sess-1'].costUsd, 0.005);
    });

    await test('Should clear cache file successfully', () => {
      const removed = cacheManager.clearCache(cacheFile);
      assert.strictEqual(removed, true);
      assert.strictEqual(fs.existsSync(cacheFile), false);
    });

    // Cleanup temp
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_e) {}
  });

  // --- Suite 6: Aggregator Unit Tests ---
  await describe('6. Aggregator Unit Tests', async () => {
    const mockDate = new Date('2026-08-27T12:00:00Z');
    const mockSessions = [
      {
        sessionId: 'sess-today-1',
        title: 'Today Task 1',
        workspace: '/ws1',
        startTime: '2026-08-27T08:00:00Z',
        turns: [
          {
            stepIndex: 0,
            inputTokens: 1000,
            cachedTokens: 0,
            outputTokens: 200,
            costUsd: 0.00027,
            createdAt: '2026-08-27T08:00:00Z'
          },
          {
            stepIndex: 1,
            inputTokens: 500,
            cachedTokens: 1200,
            outputTokens: 300,
            costUsd: 0.0003,
            createdAt: '2026-08-27T08:05:00Z'
          }
        ]
      },
      {
        sessionId: 'sess-yesterday-1',
        title: 'Yesterday Task 1',
        workspace: '/ws2',
        startTime: '2026-08-26T10:00:00Z',
        turns: [
          {
            stepIndex: 0,
            inputTokens: 2000,
            cachedTokens: 1000,
            outputTokens: 500,
            costUsd: 0.00063,
            createdAt: '2026-08-26T10:00:00Z'
          }
        ]
      }
    ];

    await test('Should aggregate today usage correctly', () => {
      const todaySummary = aggregator.getToday(mockSessions, mockDate, 'gemini-3.7-flash');
      assert.strictEqual(todaySummary.totalSessions, 1);
      assert.strictEqual(todaySummary.totalTurns, 2);
      assert.strictEqual(todaySummary.inputTokens, 1500);
      assert.strictEqual(todaySummary.cachedTokens, 1200);
      assert.strictEqual(todaySummary.outputTokens, 500);
      assert.strictEqual(todaySummary.totalTokens, 3200);
      assert(todaySummary.cacheHitRate > 40 && todaySummary.cacheHitRate < 50);
    });

    await test('Should aggregate yesterday usage correctly', () => {
      const yestSummary = aggregator.getYesterday(mockSessions, mockDate, 'gemini-3.7-flash');
      assert.strictEqual(yestSummary.totalSessions, 1);
      assert.strictEqual(yestSummary.totalTurns, 1);
      assert.strictEqual(yestSummary.inputTokens, 2000);
      assert.strictEqual(yestSummary.cachedTokens, 1000);
      assert.strictEqual(yestSummary.outputTokens, 500);
      assert.strictEqual(yestSummary.totalTokens, 3500);
    });

    await test('Should aggregate 7-day breakdown and grand total', () => {
      const summary7d = aggregator.getLastNDays(mockSessions, 7, mockDate, 'gemini-3.7-flash');
      assert.strictEqual(summary7d.daily.length, 7);
      assert.strictEqual(summary7d.totalSessions, 2);
      assert.strictEqual(summary7d.totalTurns, 3);
      assert.strictEqual(summary7d.totalTokens, 6700);
    });

    await test('Should aggregate custom date range', () => {
      const rangeSummary = aggregator.getDateRange(
        mockSessions,
        '2026-08-26..2026-08-27',
        'gemini-3.7-flash'
      );
      assert.strictEqual(rangeSummary.totalTurns, 3);
      assert.strictEqual(rangeSummary.totalTokens, 6700);
    });

    await test('Should drilldown into a specific session', () => {
      const detail = aggregator.getSessionDrilldown(mockSessions, 'sess-today-1');
      assert(detail !== null);
      assert.strictEqual(detail.sessionId, 'sess-today-1');
      assert.strictEqual(detail.title, 'Today Task 1');
    });
  });

  // --- Suite 7: Formatter Unit Tests ---
  await describe('7. Formatter Unit Tests', async () => {
    await test('Should format numbers with commas and compact suffixes', () => {
      assert.strictEqual(formatter.formatNumber(1234567), '1,234,567');
      assert.strictEqual(formatter.formatCompact(450), '450');
      assert.strictEqual(formatter.formatCompact(1500), '1.5k');
      assert.strictEqual(formatter.formatCompact(2500000), '2.50M');
    });

    await test('Should format currency strings for USD, KRW, JPY, EUR', () => {
      const costUsd = 0.05;
      assert.strictEqual(formatter.formatCurrency(costUsd, 'usd'), '$0.050');
      assert(formatter.formatCurrency(costUsd, 'krw').startsWith('₩'));
      assert(formatter.formatCurrency(costUsd, 'jpy').startsWith('¥'));
      assert(formatter.formatCurrency(costUsd, 'eur').endsWith('€'));
    });

    await test('Should accurately strip ANSI and calculate CJK display width', () => {
      const styled = '\x1b[31mHello\x1b[0m';
      assert.strictEqual(formatter.stripAnsi(styled), 'Hello');
      assert.strictEqual(formatter.getDisplayWidth('Hello'), 5);
      assert.strictEqual(formatter.getDisplayWidth('안녕'), 4);
    });

    await test('Should render progress bar', () => {
      const bar = formatter.renderProgressBar(50, 10);
      assert(bar.includes('50.0%'));
    });
  });

  // --- Suite 8: Hook Handler Unit Tests ---
  await describe('8. Hook Handler Unit Tests', async () => {
    await test('Should generate a clean single-line real-time status badge', () => {
      const badgeStr = formatter.renderRealTimeBadge(
        {
          turnTokens: 2100,
          turnCostUsd: 0.0003,
          todayTokens: 85000,
          todayCostUsd: 0.0125,
          cacheHitRate: 75.4
        },
        'usd'
      );

      assert(badgeStr.includes('⚡ [Antigravity]'));
      assert(badgeStr.includes('2.1k'));
      assert(badgeStr.includes('85.0k'));
      assert(badgeStr.includes('75%'));
    });

    await test('Should generate badge in free quota mode', () => {
      const badgeStr = formatter.renderRealTimeBadge(
        {
          turnTokens: 2100,
          turnCostUsd: 0,
          todayTokens: 85000,
          todayCostUsd: 0,
          cacheHitRate: 75.4
        },
        'usd',
        true
      );

      assert(badgeStr.includes('⚡ [Antigravity]'));
      assert(badgeStr.includes('Free'));
    });

    await test('Should format hook response matching Antigravity PostInvocation schema', () => {
      const resp = hookHandler.formatHookResponse('⚡ [Antigravity] Turn: 1.2k | Today: 45k');
      assert(resp && Array.isArray(resp.injectSteps), 'Must have injectSteps array');
      assert.strictEqual(resp.injectSteps.length, 1);
      assert.strictEqual(resp.injectSteps[0].ephemeralMessage, '⚡ [Antigravity] Turn: 1.2k | Today: 45k');
    });

    await test('handlePostInvocation should return structured payload including injectSteps', async () => {
      const result = await hookHandler.handlePostInvocation({ currency: 'usd' });
      assert(typeof result.badge === 'string', 'result.badge must be a string');
      assert(Array.isArray(result.injectSteps), 'result.injectSteps must be an array');
      assert.strictEqual(result.injectSteps[0].ephemeralMessage, result.badge);
      assert(typeof result.turnTokens === 'number');
      assert(typeof result.todayTokens === 'number');
    });

    await test('readStdinJson should safely resolve null on TTY or empty input without blocking', async () => {
      const input = await hookHandler.readStdinJson(10);
      assert(input === null || typeof input === 'object');
    });

  });

  // --- Suite 9: CLI Argument Parsing Unit Tests ---
  await describe('9. CLI Argument Parser Unit Tests', async () => {
    await test('Should default to --today if no arguments provided', () => {
      const opts = parseArgs(['node', 'bin/agy-tokens.js']);
      assert.strictEqual(opts.today, true);
      assert.strictEqual(opts.yesterday, false);
      assert.strictEqual(opts.sevenDays, false);
    });

    await test('Should parse flags and option values correctly', () => {
      const opts = parseArgs([
        'node',
        'bin/agy-tokens.js',
        '--7d',
        '--currency',
        'krw',
        '--lang',
        'ko',
        '--model',
        'claude-3.7-sonnet',
        '--json'
      ]);

      assert.strictEqual(opts.sevenDays, true);
      assert.strictEqual(opts.currency, 'krw');
      assert.strictEqual(opts.lang, 'ko');
      assert.strictEqual(opts.model, 'claude-3.7-sonnet');
      assert.strictEqual(opts.json, true);
    });

    await test('Should parse --free and --no-cost flags', () => {
      const optsFree = parseArgs(['node', 'bin/agy-tokens.js', '--free']);
      assert.strictEqual(optsFree.free, true);

      const optsNoCost = parseArgs(['node', 'bin/agy-tokens.js', '--no-cost']);
      assert.strictEqual(optsNoCost.free, true);
    });

    await test('Should parse range and session options', () => {
      const opts = parseArgs([
        'node',
        'bin/agy-tokens.js',
        '--range',
        '2026-08-01..2026-08-27',
        '--session',
        'abc-123'
      ]);

      assert.strictEqual(opts.range, '2026-08-01..2026-08-27');
      assert.strictEqual(opts.session, true);
      assert.strictEqual(opts.sessionId, 'abc-123');
    });

    await test('Should parse --raw and --hook flags', () => {
      const optsHook = parseArgs(['node', 'bin/agy-tokens.js', '--hook']);
      assert.strictEqual(optsHook.hook, true);
      assert.strictEqual(optsHook.raw, false);

      const optsRaw = parseArgs(['node', 'bin/agy-tokens.js', '--hook', '--raw']);
      assert.strictEqual(optsRaw.hook, true);
      assert.strictEqual(optsRaw.raw, true);
    });

    await test('Should parse pricing catalog subcommands and flags', () => {
      const opts1 = parseArgs(['node', 'bin/agy-tokens.js', 'sync-prices']);
      assert.strictEqual(opts1.sync, true);

      const opts2 = parseArgs(['node', 'bin/agy-tokens.js', '--prices']);
      assert.strictEqual(opts2.prices, true);

      const opts3 = parseArgs(['node', 'bin/agy-tokens.js', 'models', '--auto-sync']);
      assert.strictEqual(opts3.prices, true);
      assert.strictEqual(opts3.autoSync, true);
    });
  });

  // --- Suite 10: Toolkit Subcommand & Extensibility Unit Tests ---
  await describe('10. Toolkit Subcommand & Extensibility Unit Tests', async () => {
    await test('Should correctly verify package.json bin registrations', () => {
      const pkgJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
      assert.strictEqual(pkgJson.name, 'agy-tools');
      assert.strictEqual(pkgJson.bin['agy-tools'], './bin/agy-tools.js');
      assert.strictEqual(pkgJson.bin['agy-dashboard'], './bin/agy-tokens.js');
      assert.strictEqual(pkgJson.bin['agy-tokens'], './bin/agy-tokens.js');
    });

    await test('Should have valid executable entry files', () => {
      assert(fs.existsSync(path.join(__dirname, '..', 'bin', 'agy-tokens.js')));
      assert(fs.existsSync(path.join(__dirname, '..', 'bin', 'agy-tools.js')));
    });

    await test('integrations/skills/usage/SKILL.md must start with valid YAML frontmatter', () => {
      const skillPath = path.join(__dirname, '..', 'integrations', 'skills', 'usage', 'SKILL.md');
      assert(fs.existsSync(skillPath), 'SKILL.md must exist');
      const content = fs.readFileSync(skillPath, 'utf8');
      assert(content.startsWith('---'), 'SKILL.md must start with YAML frontmatter delimiter (---)');
      const parts = content.split('---');
      assert(parts.length >= 3, 'Must contain closing YAML delimiter (---)');
      const frontmatter = parts[1];
      assert(frontmatter.includes('name: usage'), 'Frontmatter must have name: usage');
      assert(frontmatter.includes('description:'), 'Frontmatter must have description');
      assert(content.includes('agy-tokens'), 'SKILL.md instructions must mention agy-tokens');
    });

    await test('integrations/hooks.json must conform to official Antigravity PostInvocation schema', () => {
      const hooksPath = path.join(__dirname, '..', 'integrations', 'hooks.json');
      assert(fs.existsSync(hooksPath), 'integrations/hooks.json must exist');
      const hooksJson = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
      assert(hooksJson['token-tracker'], 'Must have top-level token-tracker key');
      assert(Array.isArray(hooksJson['token-tracker'].PostInvocation), 'token-tracker.PostInvocation must be an array');
      const hookEntry = hooksJson['token-tracker'].PostInvocation[0];
      assert.strictEqual(hookEntry.type, 'command');
      assert.strictEqual(hookEntry.command, 'agy-tokens --hook');
      assert.strictEqual(hookEntry.timeout, 10);
    });
  });

  // --- Suite 11: Pricing Catalog Data Integrity & Model Coverage ---
  await describe('11. Pricing Catalog Data Integrity & Model Coverage', async () => {
    const pricingFilePath = path.join(__dirname, '..', 'data', 'pricing.json');

    await test('data/pricing.json file must exist and be valid JSON', () => {
      assert(fs.existsSync(pricingFilePath), 'data/pricing.json must exist');
      const raw = fs.readFileSync(pricingFilePath, 'utf8');
      const parsed = JSON.parse(raw);
      assert(parsed && typeof parsed === 'object');
      const validation = priceSyncer.validatePricingData(parsed);
      assert.strictEqual(validation.valid, true, `Validation failed: ${validation.error}`);
    });

    await test('Should have complete official Google Gemini models and exact rates', () => {
      const catalog = JSON.parse(fs.readFileSync(pricingFilePath, 'utf8'));
      const models = catalog.models;

      // Gemini 3.7 Flash
      assert(models['gemini-3.7-flash']);
      assert.strictEqual(models['gemini-3.7-flash'].inputPerMillion, 0.15);
      assert.strictEqual(models['gemini-3.7-flash'].cachedInputPerMillion, 0.0375);
      assert.strictEqual(models['gemini-3.7-flash'].outputPerMillion, 0.60);

      // Gemini 3.7 Flash Thinking
      assert(models['gemini-3.7-flash-thinking']);
      assert.strictEqual(models['gemini-3.7-flash-thinking'].inputPerMillion, 0.15);
      assert.strictEqual(models['gemini-3.7-flash-thinking'].cachedInputPerMillion, 0.0375);
      assert.strictEqual(models['gemini-3.7-flash-thinking'].outputPerMillion, 0.60);

      // Gemini 2.5 Flash
      assert(models['gemini-2.5-flash']);
      assert.strictEqual(models['gemini-2.5-flash'].inputPerMillion, 0.15);
      assert.strictEqual(models['gemini-2.5-flash'].cachedInputPerMillion, 0.0375);
      assert.strictEqual(models['gemini-2.5-flash'].outputPerMillion, 0.60);

      // Gemini 2.5 Pro
      assert(models['gemini-2.5-pro']);
      assert.strictEqual(models['gemini-2.5-pro'].inputPerMillion, 1.25);
      assert.strictEqual(models['gemini-2.5-pro'].cachedInputPerMillion, 0.3125);
      assert.strictEqual(models['gemini-2.5-pro'].outputPerMillion, 5.00);

      // Gemini 2.0 Flash
      assert(models['gemini-2.0-flash']);
      assert.strictEqual(models['gemini-2.0-flash'].inputPerMillion, 0.10);
      assert.strictEqual(models['gemini-2.0-flash'].cachedInputPerMillion, 0.025);
      assert.strictEqual(models['gemini-2.0-flash'].outputPerMillion, 0.40);

      // Gemini 2.0 Flash Lite
      assert(models['gemini-2.0-flash-lite']);
      assert.strictEqual(models['gemini-2.0-flash-lite'].inputPerMillion, 0.075);
      assert.strictEqual(models['gemini-2.0-flash-lite'].cachedInputPerMillion, 0.01875);
      assert.strictEqual(models['gemini-2.0-flash-lite'].outputPerMillion, 0.30);
    });

    await test('Should have complete official Anthropic Claude models and exact rates', () => {
      const catalog = JSON.parse(fs.readFileSync(pricingFilePath, 'utf8'));
      const models = catalog.models;

      // Claude 3.7 Sonnet
      assert(models['claude-3.7-sonnet']);
      assert.strictEqual(models['claude-3.7-sonnet'].inputPerMillion, 3.00);
      assert.strictEqual(models['claude-3.7-sonnet'].cachedInputPerMillion, 0.30);
      assert.strictEqual(models['claude-3.7-sonnet'].outputPerMillion, 15.00);

      // Claude 3.5 Sonnet
      assert(models['claude-3.5-sonnet']);
      assert.strictEqual(models['claude-3.5-sonnet'].inputPerMillion, 3.00);
      assert.strictEqual(models['claude-3.5-sonnet'].cachedInputPerMillion, 0.30);
      assert.strictEqual(models['claude-3.5-sonnet'].outputPerMillion, 15.00);

      // Claude 3.5 Haiku
      assert(models['claude-3.5-haiku']);
      assert.strictEqual(models['claude-3.5-haiku'].inputPerMillion, 0.80);
      assert.strictEqual(models['claude-3.5-haiku'].cachedInputPerMillion, 0.08);
      assert.strictEqual(models['claude-3.5-haiku'].outputPerMillion, 4.00);

      // Claude 3 Opus
      assert(models['claude-3-opus']);
      assert.strictEqual(models['claude-3-opus'].inputPerMillion, 15.00);
      assert.strictEqual(models['claude-3-opus'].cachedInputPerMillion, 1.50);
      assert.strictEqual(models['claude-3-opus'].outputPerMillion, 75.00);
    });

    await test('Should have complete official OpenAI models and exact rates', () => {
      const catalog = JSON.parse(fs.readFileSync(pricingFilePath, 'utf8'));
      const models = catalog.models;

      // GPT-4o
      assert(models['gpt-4o']);
      assert.strictEqual(models['gpt-4o'].inputPerMillion, 2.50);
      assert.strictEqual(models['gpt-4o'].cachedInputPerMillion, 1.25);
      assert.strictEqual(models['gpt-4o'].outputPerMillion, 10.00);

      // GPT-4o mini
      assert(models['gpt-4o-mini']);
      assert.strictEqual(models['gpt-4o-mini'].inputPerMillion, 0.15);
      assert.strictEqual(models['gpt-4o-mini'].cachedInputPerMillion, 0.075);
      assert.strictEqual(models['gpt-4o-mini'].outputPerMillion, 0.60);

      // o3-mini
      assert(models['o3-mini']);
      assert.strictEqual(models['o3-mini'].inputPerMillion, 1.10);
      assert.strictEqual(models['o3-mini'].cachedInputPerMillion, 0.55);
      assert.strictEqual(models['o3-mini'].outputPerMillion, 4.40);

      // o1
      assert(models['o1']);
      assert.strictEqual(models['o1'].inputPerMillion, 15.00);
      assert.strictEqual(models['o1'].cachedInputPerMillion, 7.50);
      assert.strictEqual(models['o1'].outputPerMillion, 60.00);
    });

    await test('Should contain proper catalog metadata and source URLs', () => {
      const catalog = JSON.parse(fs.readFileSync(pricingFilePath, 'utf8'));
      assert.strictEqual(typeof catalog.version, 'string');
      assert.strictEqual(typeof catalog.lastUpdated, 'string');
      assert(catalog.sources.google.includes('ai.google.dev'));
      assert(catalog.sources.anthropic.includes('anthropic.com'));
      assert(catalog.sources.openai.includes('openai.com'));
    });
  });

  // --- Suite 12: Price Syncer Unit Tests (Download, Validation & Fallback) ---
  await describe('12. Price Syncer Unit Tests (Download, Validation & Fallback)', async () => {
    await test('validatePricingData should validate correct schema and reject corrupt payloads', () => {
      const validPayload = {
        version: '1.0.0',
        models: {
          'test-model': {
            id: 'test-model',
            inputPerMillion: 1.0,
            cachedInputPerMillion: 0.25,
            outputPerMillion: 3.0
          }
        }
      };
      assert.strictEqual(priceSyncer.validatePricingData(validPayload).valid, true);

      assert.strictEqual(priceSyncer.validatePricingData(null).valid, false);
      assert.strictEqual(priceSyncer.validatePricingData({}).valid, false);
      assert.strictEqual(priceSyncer.validatePricingData({ models: {} }).valid, false);
      assert.strictEqual(priceSyncer.validatePricingData({ models: { 'bad': { inputPerMillion: -1 } } }).valid, false);
      assert.strictEqual(priceSyncer.validatePricingData({ models: { 'bad': { inputPerMillion: 'invalid' } } }).valid, false);
    });

    await test('loadBundledPricing should load and validate bundled data/pricing.json', () => {
      const bundled = priceSyncer.loadBundledPricing();
      assert(bundled !== null);
      assert(bundled.models['gemini-3.7-flash']);
      assert(bundled.models['claude-3.7-sonnet']);
      assert(bundled.models['gpt-4o']);
    });

    await test('saveSyncedPricing and loadLocalSyncedPricing should persist and read cached data', () => {
      const tmpCachePath = path.join(os.tmpdir(), `test_pricing_cache_${Date.now()}.json`);
      const mockData = {
        version: '9.9.9',
        lastUpdated: '2026-08-27',
        models: {
          'custom-synced-test': {
            id: 'custom-synced-test',
            displayName: 'Custom Synced Test',
            inputPerMillion: 0.99,
            cachedInputPerMillion: 0.25,
            outputPerMillion: 2.99
          }
        }
      };

      const saved = priceSyncer.saveSyncedPricing(mockData, tmpCachePath);
      assert.strictEqual(saved, true);

      const loaded = priceSyncer.loadLocalSyncedPricing(tmpCachePath);
      assert(loaded !== null);
      assert.strictEqual(loaded.version, '9.9.9');
      assert.strictEqual(loaded.models['custom-synced-test'].inputPerMillion, 0.99);
      assert(loaded._meta && loaded._meta.syncedAt);

      fs.unlinkSync(tmpCachePath);
    });

    await test('getSyncedPricing should fallback to bundled pricing when cache is absent', () => {
      const nonExistentPath = path.join(os.tmpdir(), `non_existent_${Date.now()}.json`);
      const pricing = priceSyncer.getSyncedPricing({ cachePath: nonExistentPath });
      assert(pricing !== null);
      assert.strictEqual(pricing._source, 'bundled');
      assert(pricing.models['gemini-3.7-flash']);
    });

    await test('syncPricing should gracefully handle unreachable URLs and fallback to bundled data', async () => {
      const tmpCache = path.join(os.tmpdir(), `unreachable_cache_${Date.now()}.json`);
      const result = await priceSyncer.syncPricing({
        url: 'http://127.0.0.1:54321/unreachable-endpoint.json',
        destPath: tmpCache,
        timeoutMs: 500
      });

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.source, 'bundled');
      assert(result.modelCount > 0);
      assert(result.error);
    });

    await test('syncPricing should download, validate, and update cache over HTTP mock server', async () => {
      const mockServerPayload = {
        schemaVersion: 1,
        version: '2.0.0-mock',
        lastUpdated: '2026-08-27',
        sources: { test: 'https://test.local/pricing' },
        models: {
          'mock-gemini-next': {
            id: 'mock-gemini-next',
            displayName: 'Mock Gemini Next',
            provider: 'google',
            contextWindow: '2M',
            inputPerMillion: 0.12,
            cachedInputPerMillion: 0.03,
            outputPerMillion: 0.48
          }
        }
      };

      // Create ephemeral local HTTP test server
      const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(mockServerPayload));
      });

      await new Promise(res => server.listen(0, '127.0.0.1', res));
      const port = server.address().port;
      const testUrl = `http://127.0.0.1:${port}/pricing.json`;
      const testDestPath = path.join(os.tmpdir(), `mock_synced_pricing_${Date.now()}.json`);

      try {
        const syncResult = await priceSyncer.syncPricing({
          url: testUrl,
          destPath: testDestPath,
          timeoutMs: 2000
        });

        assert.strictEqual(syncResult.success, true);
        assert.strictEqual(syncResult.source, 'remote');
        assert.strictEqual(syncResult.version, '2.0.0-mock');
        assert.strictEqual(syncResult.modelCount, 1);
        assert(fs.existsSync(testDestPath));

        const cachedContent = JSON.parse(fs.readFileSync(testDestPath, 'utf8'));
        assert.strictEqual(cachedContent.models['mock-gemini-next'].inputPerMillion, 0.12);
      } finally {
        await new Promise(res => server.close(res));
        if (fs.existsSync(testDestPath)) {
          try { fs.unlinkSync(testDestPath); } catch (_e) {}
        }
      }
    });
  });

  // --- Suite 13: Pricing Table Formatter Tests ---
  await describe('13. Pricing Table Formatter Tests', async () => {
    await test('formatProviderBadge should format badges with color tags', () => {
      const googleBadge = priceSyncer.formatProviderBadge('google');
      const anthropicBadge = priceSyncer.formatProviderBadge('anthropic');
      const openaiBadge = priceSyncer.formatProviderBadge('openai');

      assert(googleBadge.includes('Google'));
      assert(anthropicBadge.includes('Anthropic'));
      assert(openaiBadge.includes('OpenAI'));
    });

    await test('formatUnitRate should format currency amounts accurately', () => {
      const usdRate = priceSyncer.formatUnitRate(0.15, 'usd');
      assert.strictEqual(usdRate, '$0.1500');

      const krwRate = priceSyncer.formatUnitRate(0.15, 'krw');
      assert(krwRate.includes('217.5'));

      const jpyRate = priceSyncer.formatUnitRate(0.15, 'jpy');
      assert(jpyRate.includes('23.25'));

      const eurRate = priceSyncer.formatUnitRate(1.0, 'eur');
      assert(eurRate.includes('0.9500€'));
    });

    await test('formatPricingTable should render a full ASCII/ANSI table without error', () => {
      const tableEn = priceSyncer.formatPricingTable('usd', 'en');
      assert(tableEn.includes('Official API Pricing Catalog'));
      assert(tableEn.includes('Gemini 3.7 Flash'));
      assert(tableEn.includes('Claude 3.7 Sonnet'));
      assert(tableEn.includes('GPT-4o'));
      assert(tableEn.includes('o3-mini'));
      assert(tableEn.includes('o1'));
      assert(tableEn.includes('Official Sources:'));
    });

    await test('formatPricingTable should render properly in Korean, Japanese, and Chinese', () => {
      const tableKo = priceSyncer.formatPricingTable('krw', 'ko');
      assert(tableKo.includes('공식 API 가격 카탈로그'));
      assert(tableKo.includes('제공사'));
      assert(tableKo.includes('모델명'));

      const tableJa = priceSyncer.formatPricingTable('jpy', 'ja');
      assert(tableJa.includes('公式API価格カタログ'));
      assert(tableJa.includes('プロバイダー'));

      const tableZh = priceSyncer.formatPricingTable('usd', 'zh');
      assert(tableZh.includes('官方 API 定价目录'));
      assert(tableZh.includes('供应商'));
    });
  });

  // --- Suite 14: Subcommand & Live Dispatcher Unit Tests ---
  await describe('14. Subcommand & Live Dispatcher Unit Tests', async () => {
    await test('parseArgs should handle prices, sync-prices, and options', () => {
      const optsPrices = parseArgs(['node', 'bin/agy-tokens.js', '--prices', '--currency', 'krw']);
      assert.strictEqual(optsPrices.prices, true);
      assert.strictEqual(optsPrices.currency, 'krw');

      const optsSync = parseArgs(['node', 'bin/agy-tokens.js', 'sync-prices']);
      assert.strictEqual(optsSync.sync, true);

      const optsAuto = parseArgs(['node', 'bin/agy-tokens.js', '--auto-sync']);
      assert.strictEqual(optsAuto.autoSync, true);
    });

    await test('renderHelp should include pricing and sync commands', () => {
      const help = formatter.renderHelp();
      assert(help.includes('--prices'));
      assert(help.includes('--sync'));
      assert(help.includes('--auto-sync'));
    });
  });

  // --- Summary & Exit Code ---
  const duration = Date.now() - startTime;
  console.log('\n\x1b[1m=======================================================');
  console.log(`  Tests: \x1b[32m${passedTests} passed\x1b[0m, \x1b[${failedTests > 0 ? '31' : '32'}m${failedTests} failed\x1b[0m, ${totalTests} total`);
  console.log(`  Duration: ${duration}ms`);
  console.log('=======================================================\x1b[0m\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
