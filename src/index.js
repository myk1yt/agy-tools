/**
 * @fileoverview Main entry point and CLI coordinator for Antigravity Token & Cost Tracker.
 * Integrates log parsing, local caching, date aggregation, remote price synchronization,
 * i18n, and ANSI terminal rendering.
 */

const path = require('path');
const config = require('./config');
const i18n = require('./i18n');
const tokenizer = require('./tokenizer');
const logParser = require('./log-parser');
const cacheManager = require('./cache-manager');
const aggregator = require('./aggregator');
const formatter = require('./formatter');
const hookHandler = require('./hook-handler');
const priceSyncer = require('./price-syncer');

const pkg = require('../package.json');

/**
 * Parses raw process.argv arguments into a structured options object.
 * @param {Array<string>} argv - CLI argument array.
 * @returns {object} Parsed flags and arguments.
 */
function parseArgs(argv) {
  const args = argv.slice(2);
  const options = {
    today: false,
    yesterday: false,
    sevenDays: false,
    thirtyDays: false,
    range: null,
    session: false,
    sessionId: null,
    all: false,
    currency: null,
    lang: null,
    model: null,
    free: false,
    json: false,
    hook: false,
    fresh: false,
    sync: false,
    prices: false,
    autoSync: false,
    noColor: false,
    help: false,
    version: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-h' || arg === '--help') {
      options.help = true;
    } else if (arg === '-v' || arg === '--version') {
      options.version = true;
    } else if (arg === '-t' || arg === '--today') {
      options.today = true;
    } else if (arg === '-y' || arg === '--yesterday') {
      options.yesterday = true;
    } else if (arg === '--7d' || arg === '--week') {
      options.sevenDays = true;
    } else if (arg === '--30d' || arg === '--month') {
      options.thirtyDays = true;
    } else if (arg === '--range') {
      options.range = args[i + 1] || null;
      i++;
    } else if (arg.startsWith('--range=')) {
      options.range = arg.split('=')[1];
    } else if (arg === '-s' || arg === '--session') {
      options.session = true;
      if (args[i + 1] && !args[i + 1].startsWith('-')) {
        options.sessionId = args[i + 1];
        i++;
      }
    } else if (arg.startsWith('--session=')) {
      options.session = true;
      options.sessionId = arg.split('=')[1];
    } else if (arg === '-a' || arg === '--all') {
      options.all = true;
    } else if (arg === '--currency') {
      options.currency = args[i + 1] || null;
      i++;
    } else if (arg.startsWith('--currency=')) {
      options.currency = arg.split('=')[1];
    } else if (arg === '--lang') {
      options.lang = args[i + 1] || null;
      i++;
    } else if (arg.startsWith('--lang=')) {
      options.lang = arg.split('=')[1];
    } else if (arg === '--model') {
      options.model = args[i + 1] || null;
      i++;
    } else if (arg.startsWith('--model=')) {
      options.model = arg.split('=')[1];
    } else if (arg === '--free' || arg === '--no-cost') {
      options.free = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--hook' || arg === '--badge') {
      options.hook = true;
    } else if (arg === '--fresh' || arg === '--no-cache') {
      options.fresh = true;
    } else if (arg === 'sync-prices' || arg === 'sync' || arg === '--sync' || arg === '--sync-prices') {
      options.sync = true;
    } else if (arg === 'prices' || arg === 'models' || arg === '--prices' || arg === '--models') {
      options.prices = true;
    } else if (arg === '--auto-sync') {
      options.autoSync = true;
    } else if (arg === '--no-color') {
      options.noColor = true;
    }
  }

  // Default to today if no specific report mode is specified
  if (
    !options.yesterday &&
    !options.sevenDays &&
    !options.thirtyDays &&
    !options.range &&
    !options.session &&
    !options.all &&
    !options.hook &&
    !options.sync &&
    !options.prices &&
    !options.help &&
    !options.version
  ) {
    options.today = true;
  }

  return options;
}

/**
 * Main CLI runner function.
 * @param {Array<string>} [argv=process.argv] - Command line arguments.
 */
async function runCli(argv = process.argv) {
  const options = parseArgs(argv);

  if (options.noColor) {
    formatter.setColorsEnabled(false);
  }

  // Handle language configuration
  const userConfig = config.loadUserConfig();
  const targetLang = options.lang || userConfig.lang;
  if (targetLang) {
    i18n.setLocale(targetLang);
  }

  // Determine if free/no-cost quota mode is enabled
  const isFree = Boolean(options.free || userConfig.free || userConfig.noCost);

  // Version check
  if (options.version) {
    console.log(`agy-tokens v${pkg.version}`);
    return;
  }

  // Help check
  if (options.help) {
    console.log(formatter.renderHelp());
    return;
  }

  // Handle Auto-Sync if requested or configured
  if (options.autoSync) {
    try {
      const cached = priceSyncer.loadLocalSyncedPricing();
      const syncedAt = cached?._meta?.syncedAt ? new Date(cached._meta.syncedAt).getTime() : 0;
      if (!syncedAt || Date.now() - syncedAt > priceSyncer.MAX_CACHE_AGE_MS) {
        await priceSyncer.syncPricing({ silent: true });
      }
    } catch (_err) {
      // Auto-sync errors are non-blocking
    }
  }

  // 1. Sync Prices Subcommand
  if (options.sync) {
    const syncRes = await priceSyncer.syncPricing();
    if (options.json) {
      console.log(JSON.stringify(syncRes, null, 2));
      return;
    }

    if (syncRes.success) {
      console.log(`\n  ${formatter.styleText('✔', 'brightGreen')} ${formatter.styleText(i18n.t('syncSuccess', { count: syncRes.modelCount, version: syncRes.version }), 'bold')}`);
      console.log(`  ${formatter.styleText('↳', 'gray')} ${i18n.t('syncCacheSaved', { path: syncRes.path })}\n`);
    } else {
      console.log(`\n  ${formatter.styleText('⚠', 'brightYellow')} ${i18n.t('syncFailed', { error: syncRes.error, fallback: syncRes.source })}`);
      console.log(`  ${formatter.styleText('↳', 'gray')} ${i18n.t('syncCacheSaved', { path: syncRes.path })}\n`);
    }
    return;
  }

  // 2. Prices / Models Catalog Table Subcommand
  if (options.prices) {
    const currency = (options.currency || userConfig.currency || 'usd').toLowerCase();
    if (options.json) {
      const catalog = priceSyncer.getSyncedPricing();
      console.log(JSON.stringify(catalog, null, 2));
      return;
    }

    const tableOutput = priceSyncer.formatPricingTable(currency, targetLang);
    console.log('\n' + tableOutput + '\n');
    return;
  }

  // 3. Hook / 1-line badge mode
  if (options.hook) {
    const currency = (options.currency || userConfig.currency || 'usd').toLowerCase();
    const result = await hookHandler.handlePostInvocation({
      currency,
      modelName: options.model,
      isFree
    });
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(result.badge);
    }
    return;
  }

  const activeModel = options.model || config.getActiveModelFromSettings();
  const currency = (options.currency || userConfig.currency || 'usd').toLowerCase();

  // Sync sessions with cache
  const syncResult = await cacheManager.syncSessions({
    forceFresh: options.fresh,
    modelName: activeModel
  });

  const sessions = syncResult.sessions;

  // 4. Session drilldown mode
  if (options.session) {
    const sessionDetail = aggregator.getSessionDrilldown(sessions, options.sessionId);
    if (!sessionDetail) {
      if (options.json) {
        console.log(JSON.stringify({ error: i18n.t('sessionNotFound', { id: options.sessionId || 'latest' }) }));
      } else {
        console.log(`\n  ${i18n.t('sessionNotFound', { id: options.sessionId || 'latest' })}\n`);
      }
      return;
    }

    if (options.json) {
      console.log(JSON.stringify(sessionDetail, null, 2));
    } else {
      const banner = formatter.renderBanner(
        i18n.t('periodSession'),
        activeModel,
        currency,
        sessionDetail.startTime.split('T')[0],
        isFree
      );
      const table = formatter.renderSessionTable(sessionDetail, currency, isFree);
      console.log(banner);
      console.log(table);
    }
    return;
  }

  // 5. Aggregations (Today, Yesterday, 7d, 30d, Range, All)
  let reportData = null;
  let periodTitle = '';
  let dateRange = '';

  if (options.yesterday) {
    reportData = aggregator.getYesterday(sessions, new Date(), activeModel);
    periodTitle = i18n.t('periodYesterday');
    dateRange = reportData.dateStr;
  } else if (options.sevenDays) {
    reportData = aggregator.getLastNDays(sessions, 7, new Date(), activeModel);
    periodTitle = i18n.t('period7Days');
    dateRange = reportData.dateRange;
  } else if (options.thirtyDays) {
    reportData = aggregator.getLastNDays(sessions, 30, new Date(), activeModel);
    periodTitle = i18n.t('period30Days');
    dateRange = reportData.dateRange;
  } else if (options.range) {
    try {
      reportData = aggregator.getDateRange(sessions, options.range, activeModel);
      periodTitle = i18n.t('periodRange');
      dateRange = options.range;
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  } else if (options.all) {
    reportData = aggregator.getAllTime(sessions, activeModel);
    periodTitle = i18n.t('periodAll');
    dateRange = reportData.dateRange;
  } else {
    // Default: Today
    reportData = aggregator.getToday(sessions, new Date(), activeModel);
    periodTitle = i18n.t('periodToday');
    dateRange = reportData.dateStr;
  }

  // Programmatic JSON Output
  if (options.json) {
    console.log(JSON.stringify({
      period: periodTitle,
      dateRange,
      model: activeModel,
      currency,
      freeQuota: isFree,
      metrics: isFree
        ? {
            ...reportData,
            costUsd: 0,
            cacheSavingsUsd: 0,
            daily: reportData.daily ? reportData.daily.map(d => ({ ...d, costUsd: 0, cacheSavingsUsd: 0 })) : undefined
          }
        : reportData,
      cacheStats: {
        totalSessions: syncResult.sessions.length,
        parsedCount: syncResult.parsedCount,
        cachedCount: syncResult.cachedCount,
        elapsedMs: syncResult.elapsedMs
      }
    }, null, 2));
    return;
  }

  // Visual Terminal Output
  const banner = formatter.renderBanner(periodTitle, activeModel, currency, dateRange, isFree);
  const summaryCard = formatter.renderSummaryMetrics(
    isFree ? { ...reportData, costUsd: 0, cacheSavingsUsd: 0 } : reportData,
    currency,
    isFree
  );

  console.log('\n' + banner + '\n');
  console.log(summaryCard + '\n');

  if (reportData.daily && reportData.daily.length > 0) {
    const dailyTable = formatter.renderDailyTable(reportData.daily, currency, reportData, isFree);
    console.log(dailyTable + '\n');
  }
}

module.exports = {
  config,
  i18n,
  tokenizer,
  logParser,
  cacheManager,
  aggregator,
  formatter,
  hookHandler,
  priceSyncer,
  parseArgs,
  runCli
};
