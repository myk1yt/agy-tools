/**
 * @fileoverview Main entry point and CLI coordinator for Antigravity Token & Cost Tracker.
 * Integrates log parsing, local caching, date aggregation, i18n, and ANSI terminal rendering.
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
    json: false,
    hook: false,
    fresh: false,
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
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--hook' || arg === '--badge') {
      options.hook = true;
    } else if (arg === '--fresh' || arg === '--no-cache') {
      options.fresh = true;
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

  // Hook / 1-line badge mode
  if (options.hook) {
    const currency = (options.currency || userConfig.currency || 'usd').toLowerCase();
    const result = await hookHandler.handlePostInvocation({
      currency,
      modelName: options.model
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

  // 1. Session drilldown mode
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
        sessionDetail.startTime.split('T')[0]
      );
      const table = formatter.renderSessionTable(sessionDetail, currency);
      console.log(banner);
      console.log(table);
    }
    return;
  }

  // 2. Aggregations (Today, Yesterday, 7d, 30d, Range, All)
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
      metrics: reportData,
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
  const banner = formatter.renderBanner(periodTitle, activeModel, currency, dateRange);
  const summaryCard = formatter.renderSummaryMetrics(reportData, currency);

  console.log('\n' + banner + '\n');
  console.log(summaryCard + '\n');

  if (reportData.daily && reportData.daily.length > 0) {
    const dailyTable = formatter.renderDailyTable(reportData.daily, currency, reportData);
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
  parseArgs,
  runCli
};
