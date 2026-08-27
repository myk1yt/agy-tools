/**
 * @fileoverview Multi-language internationalization (i18n) module supporting
 * English (en), Korean (ko), Japanese (ja), and Chinese (zh).
 * Provides automatic locale detection and parameter interpolation.
 */

const fs = require('fs');
const os = require('os');

/**
 * Supported locale codes.
 */
const SUPPORTED_LOCALES = ['en', 'ko', 'ja', 'zh'];
const DEFAULT_LOCALE = 'en';

/**
 * Translation dictionaries for all supported languages.
 */
const TRANSLATIONS = {
  en: {
    appName: 'Antigravity Token & Cost Tracker',
    tagline: 'High-Precision Token Estimation & Real-Time Cost Analytics',
    
    // Period & Filter headers
    periodToday: 'Today',
    periodYesterday: 'Yesterday',
    period7Days: 'Last 7 Days',
    period30Days: 'Last 30 Days',
    periodRange: 'Custom Date Range',
    periodAll: 'All-Time History',
    periodSession: 'Session Drilldown',

    // Summary Card Labels
    activeModel: 'Active Model',
    currency: 'Currency',
    timeRange: 'Period',
    workspace: 'Workspace',
    totalTokens: 'Total Tokens',
    inputTokens: 'Input Tokens',
    cachedTokens: 'Cached Tokens',
    outputTokens: 'Output Tokens',
    cacheHitRate: 'Cache Hit Rate',
    totalCost: 'Total Estimated Cost',
    cacheSavings: 'Cache Savings',
    totalTurns: 'Total Turns',
    totalSessions: 'Total Sessions',
    avgTokensPerTurn: 'Avg Tokens / Turn',

    // Table Headers
    colDate: 'Date',
    colSessions: 'Sessions',
    colTurns: 'Turns',
    colInput: 'Input',
    colCached: 'Cached',
    colOutput: 'Output',
    colTotal: 'Total Tokens',
    colCacheHit: 'Cache %',
    colCost: 'Cost',
    colSavings: 'Savings',
    colStep: 'Step',
    colType: 'Type',
    colAction: 'Action / Tool',
    colTokens: 'Tokens',
    colTime: 'Time',
    colSummary: 'Summary',
    colGrandTotal: 'GRAND TOTAL',

    // Hook & Badge
    hookBadgeTurn: 'Turn',
    hookBadgeToday: 'Today',
    hookBadgeCache: 'Cache',
    hookBadgeCost: 'Cost',

    // CLI Options & Help
    cliHelpTitle: 'Usage:',
    cliHelpUsage: 'agy-tokens [options]',
    cliHelpDescription: 'Track, analyze, and estimate token consumption and API costs for Antigravity CLI conversations.',
    cliOptToday: "Show today's token & cost summary (default)",
    cliOptYesterday: "Show yesterday's token & cost summary",
    cliOpt7d: 'Show 7-day daily breakdown and total',
    cliOpt30d: 'Show 30-day daily breakdown and total',
    cliOptRange: 'Show aggregation for custom date range (YYYY-MM-DD..YYYY-MM-DD)',
    cliOptSession: 'Show turn-by-turn breakdown for latest or specified conversation ID',
    cliOptAll: 'Show full historical breakdown across all sessions',
    cliOptCurrency: 'Select display currency (usd, krw, jpy, eur, gbp)',
    cliOptLang: 'Select interface language (en, ko, ja, zh)',
    cliOptModel: 'Override active model pricing (e.g., gemini-3.7-flash, claude-3.7-sonnet)',
    cliOptJson: 'Output raw JSON for script integration',
    cliOptHook: 'Output 1-line real-time status badge for Antigravity PostInvocation hook',
    cliOptFresh: 'Bypass cache and force re-parsing of all transcript logs',
    cliOptNoColor: 'Disable ANSI terminal colors',
    cliOptHelp: 'Display this help message',
    cliOptVersion: 'Display version number',

    // Messages & Alerts
    noDataFound: 'No transcript logs or conversation records found for the selected period.',
    sessionNotFound: 'Session "{id}" not found in brain directory.',
    invalidDateRange: 'Invalid date range format. Use YYYY-MM-DD..YYYY-MM-DD.',
    cacheSynced: 'Cache synchronized successfully ({count} sessions parsed in {ms}ms).',
    versionInfo: 'v{version} (Zero-Dependency Node.js)'
  },

  ko: {
    appName: 'Antigravity 토큰 & 비용 트래커',
    tagline: '정밀 서브워드 토큰 측정 및 실시간 비용 분석기',

    // Period & Filter headers
    periodToday: '오늘',
    periodYesterday: '어제',
    period7Days: '최근 7일',
    period30Days: '최근 30일',
    periodRange: '사용자 지정 날짜 범위',
    periodAll: '전체 사용 기록',
    periodSession: '세션 상세 분석',

    // Summary Card Labels
    activeModel: '사용 모델',
    currency: '표시 통화',
    timeRange: '조회 기간',
    workspace: '작업 공간',
    totalTokens: '총 토큰 수',
    inputTokens: '입력 토큰',
    cachedTokens: '캐시 토큰',
    outputTokens: '출력 토큰',
    cacheHitRate: '캐시 적중률',
    totalCost: '예상 총 비용',
    cacheSavings: '캐시 절감액',
    totalTurns: '총 턴(Turn) 수',
    totalSessions: '총 세션 수',
    avgTokensPerTurn: '턴당 평균 토큰',

    // Table Headers
    colDate: '날짜',
    colSessions: '세션',
    colTurns: '턴 수',
    colInput: '입력',
    colCached: '캐시',
    colOutput: '출력',
    colTotal: '총 토큰',
    colCacheHit: '캐시 %',
    colCost: '비용',
    colSavings: '절감액',
    colStep: '스텝',
    colType: '유형',
    colAction: '도구 / 액션',
    colTokens: '토큰',
    colTime: '시간',
    colSummary: '요약',
    colGrandTotal: '합계 (GRAND TOTAL)',

    // Hook & Badge
    hookBadgeTurn: '이번 턴',
    hookBadgeToday: '오늘 누적',
    hookBadgeCache: '캐시',
    hookBadgeCost: '비용',

    // CLI Options & Help
    cliHelpTitle: '사용법:',
    cliHelpUsage: 'agy-tokens [옵션]',
    cliHelpDescription: 'Antigravity 대화 로그의 토큰 사용량과 API 비용을 정밀하게 분석하고 추적합니다.',
    cliOptToday: '오늘의 토큰 및 비용 요약 표시 (기본값)',
    cliOptYesterday: '어제의 토큰 및 비용 요약 표시',
    cliOpt7d: '최근 7일간의 일별 상세 내역 및 합계 표시',
    cliOpt30d: '최근 30일간의 일별 상세 내역 및 합계 표시',
    cliOptRange: '지정 날짜 범위 사용량 표시 (YYYY-MM-DD..YYYY-MM-DD)',
    cliOptSession: '최근 또는 지정된 대화 세션의 턴별 상세 내역 표시',
    cliOptAll: '전체 기간의 모든 대화 세션 사용량 요약 표시',
    cliOptCurrency: '표시 통화 선택 (usd, krw, jpy, eur, gbp)',
    cliOptLang: '인터페이스 언어 선택 (en, ko, ja, zh)',
    cliOptModel: '적용할 모델 가격 수동 지정 (예: gemini-3.7-flash, claude-3.7-sonnet)',
    cliOptJson: '프로그래밍 연동을 위한 순수 JSON 출력',
    cliOptHook: 'Antigravity PostInvocation 훅용 1줄 실시간 상태 배지 출력',
    cliOptFresh: '캐시를 무시하고 모든 로그 파일을 새로 파싱',
    cliOptNoColor: 'ANSI 터미널 색상 비활성화',
    cliOptHelp: '도움말 메시지 출력',
    cliOptVersion: '버전 정보 출력',

    // Messages & Alerts
    noDataFound: '선택한 기간에 해당하는 대화 로그가 없습니다.',
    sessionNotFound: '세션 "{id}"을(를) 찾을 수 없습니다.',
    invalidDateRange: '날짜 범위 형식이 올바르지 않습니다. (예: YYYY-MM-DD..YYYY-MM-DD)',
    cacheSynced: '캐시가 성공적으로 동기화되었습니다 ({count}개 세션, {ms}ms 소요).',
    versionInfo: 'v{version} (무의존 Node.js)'
  },

  ja: {
    appName: 'Antigravity トークン＆コストトラッカー',
    tagline: '高精度サブワードトークン推定とリアルタイムコスト分析',

    // Period & Filter headers
    periodToday: '今日',
    periodYesterday: '昨日',
    period7Days: '過去7日間',
    period30Days: '過去30日間',
    periodRange: 'カスタム日付範囲',
    periodAll: '全期間の履歴',
    periodSession: 'セッション詳細',

    // Summary Card Labels
    activeModel: '使用モデル',
    currency: '通貨',
    timeRange: '対象期間',
    workspace: 'ワークスペース',
    totalTokens: '総トークン数',
    inputTokens: '入力トークン',
    cachedTokens: 'キャッシュトークン',
    outputTokens: '出力トークン',
    cacheHitRate: 'キャッシュヒット率',
    totalCost: '推定総コスト',
    cacheSavings: 'キャッシュ節約額',
    totalTurns: '総ターン数',
    totalSessions: '総セッション数',
    avgTokensPerTurn: 'ターン平均トークン',

    // Table Headers
    colDate: '日付',
    colSessions: 'セッション',
    colTurns: 'ターン',
    colInput: '入力',
    colCached: 'キャッシュ',
    colOutput: '出力',
    colTotal: '総トークン',
    colCacheHit: 'キャッシュ率',
    colCost: 'コスト',
    colSavings: '節約額',
    colStep: 'ステップ',
    colType: 'タイプ',
    colAction: 'アクション / ツール',
    colTokens: 'トークン',
    colTime: '時刻',
    colSummary: '概要',
    colGrandTotal: '総計 (GRAND TOTAL)',

    // Hook & Badge
    hookBadgeTurn: '今回ターン',
    hookBadgeToday: '本日累計',
    hookBadgeCache: 'キャッシュ',
    hookBadgeCost: 'コスト',

    // CLI Options & Help
    cliHelpTitle: '使用方法:',
    cliHelpUsage: 'agy-tokens [オプション]',
    cliHelpDescription: 'Antigravity の対話ログからトークン消費量とAPIコストを高精度に分析します。',
    cliOptToday: '本日のトークンおよびコスト概要を表示 (デフォルト)',
    cliOptYesterday: '昨日のトークンおよびコスト概要を表示',
    cliOpt7d: '過去7日間の日別内訳と合計を表示',
    cliOpt30d: '過去30日間の日別内訳と合計を表示',
    cliOptRange: '指定した日付範囲の集計を表示 (YYYY-MM-DD..YYYY-MM-DD)',
    cliOptSession: '最新または指定した会話IDのターン毎の内訳を表示',
    cliOptAll: '全履歴の集計を表示',
    cliOptCurrency: '表示通貨を選択 (usd, krw, jpy, eur, gbp)',
    cliOptLang: '言語を選択 (en, ko, ja, zh)',
    cliOptModel: 'モデル価格の上書き (例: gemini-3.7-flash, claude-3.7-sonnet)',
    cliOptJson: 'プログラム連携用のJSON形式で出力',
    cliOptHook: 'Antigravity PostInvocation フック用の1行バッジを出力',
    cliOptFresh: 'キャッシュを破棄して全ログを再解析',
    cliOptNoColor: 'ターミナルカラー出力を無効化',
    cliOptHelp: 'ヘルプメッセージを表示',
    cliOptVersion: 'バージョンを表示',

    // Messages & Alerts
    noDataFound: '指定された期間のログデータが見つかりませんでした。',
    sessionNotFound: 'セッション「{id}」が見つかりません。',
    invalidDateRange: '日付範囲の形式が無効です (例: YYYY-MM-DD..YYYY-MM-DD)。',
    cacheSynced: 'キャッシュの同期が完了しました ({count} 件、{ms}ms)。',
    versionInfo: 'v{version} (依存関係ゼロ Node.js)'
  },

  zh: {
    appName: 'Antigravity 词元与成本追踪器',
    tagline: '高精度子词 Token 估算与实时成本分析',

    // Period & Filter headers
    periodToday: '今天',
    periodYesterday: '昨天',
    period7Days: '最近 7 天',
    period30Days: '最近 30 天',
    periodRange: '自定义日期范围',
    periodAll: '全部历史记录',
    periodSession: '会话深度分析',

    // Summary Card Labels
    activeModel: '当前模型',
    currency: '显示货币',
    timeRange: '查询期间',
    workspace: '工作区',
    totalTokens: '总 Token 数',
    inputTokens: '输入 Token',
    cachedTokens: '缓存 Token',
    outputTokens: '输出 Token',
    cacheHitRate: '缓存命中率',
    totalCost: '预计总成本',
    cacheSavings: '缓存节省费用',
    totalTurns: '总轮次',
    totalSessions: '总会话数',
    avgTokensPerTurn: '每轮平均 Token',

    // Table Headers
    colDate: '日期',
    colSessions: '会话',
    colTurns: '轮次',
    colInput: '输入',
    colCached: '缓存',
    colOutput: '输出',
    colTotal: '总 Token',
    colCacheHit: '缓存率',
    colCost: '成本',
    colSavings: '节省',
    colStep: '步骤',
    colType: '类型',
    colAction: '操作 / 工具',
    colTokens: 'Token',
    colTime: '时间',
    colSummary: '摘要',
    colGrandTotal: '总计 (GRAND TOTAL)',

    // Hook & Badge
    hookBadgeTurn: '本轮',
    hookBadgeToday: '今日累计',
    hookBadgeCache: '缓存',
    hookBadgeCost: '成本',

    // CLI Options & Help
    cliHelpTitle: '用法:',
    cliHelpUsage: 'agy-tokens [选项]',
    cliHelpDescription: '精准分析和跟踪 Antigravity 会话日志的 Token 消耗和 API 费用。',
    cliOptToday: '显示今日 Token 及成本摘要（默认）',
    cliOptYesterday: '显示昨日 Token 及成本摘要',
    cliOpt7d: '显示过去 7 天每日明细与总计',
    cliOpt30d: '显示过去 30 天每日明细与总计',
    cliOptRange: '显示指定日期范围的用量统计 (YYYY-MM-DD..YYYY-MM-DD)',
    cliOptSession: '显示最新或指定会话 ID 的逐轮明细',
    cliOptAll: '显示所有会话的完整历史统计',
    cliOptCurrency: '选择显示货币 (usd, krw, jpy, eur, gbp)',
    cliOptLang: '选择界面语言 (en, ko, ja, zh)',
    cliOptModel: '覆盖模型定价规则 (例如: gemini-3.7-flash, claude-3.7-sonnet)',
    cliOptJson: '输出原始 JSON 供脚本集成使用',
    cliOptHook: '输出用于 Antigravity PostInvocation 钩子的单行实时状态徽章',
    cliOptFresh: '忽略缓存并强制重新解析所有日志文件',
    cliOptNoColor: '禁用终端彩色输出',
    cliOptHelp: '显示此帮助信息',
    cliOptVersion: '显示版本号',

    // Messages & Alerts
    noDataFound: '在所选时间段内未找到任何会话日志。',
    sessionNotFound: '未找到会话 "{id}"。',
    invalidDateRange: '日期范围格式错误，请使用 YYYY-MM-DD..YYYY-MM-DD。',
    cacheSynced: '缓存同步完成（已解析 {count} 个会话，耗时 {ms}ms）。',
    versionInfo: 'v{version} (纯原生零依赖 Node.js)'
  }
};

/**
 * Current active locale in state.
 */
let currentLocale = detectSystemLocale();

/**
 * Automatically detects the user's system locale.
 * Priority: AGY_LANG -> LC_ALL -> LANG -> LANGUAGE -> Intl.DateTimeFormat -> fallback
 * @returns {string} One of supported locale codes.
 */
function detectSystemLocale() {
  const envLang =
    process.env.AGY_LANG ||
    process.env.LC_ALL ||
    process.env.LANG ||
    process.env.LANGUAGE;

  if (envLang) {
    const code = envLang.split('.')[0].split('_')[0].split('-')[0].toLowerCase();
    if (SUPPORTED_LOCALES.includes(code)) {
      return code;
    }
  }

  try {
    const intlLocale = Intl.DateTimeFormat().resolvedOptions().locale;
    if (intlLocale) {
      const code = intlLocale.split('-')[0].toLowerCase();
      if (SUPPORTED_LOCALES.includes(code)) {
        return code;
      }
    }
  } catch (_err) {
    // Fallback if Intl API fails
  }

  return DEFAULT_LOCALE;
}

/**
 * Sets the active locale.
 * @param {string} locale - Target locale code ('en', 'ko', 'ja', 'zh').
 * @returns {string} The resolved active locale.
 */
function setLocale(locale) {
  if (!locale) return currentLocale;
  const normalized = locale.toLowerCase().trim().split('-')[0];
  if (SUPPORTED_LOCALES.includes(normalized)) {
    currentLocale = normalized;
  } else {
    currentLocale = DEFAULT_LOCALE;
  }
  return currentLocale;
}

/**
 * Gets the current active locale.
 * @returns {string}
 */
function getLocale() {
  return currentLocale;
}

/**
 * Translates a key with optional parameter substitution.
 * @param {string} key - Translation key.
 * @param {object} [params] - Key-value map for string interpolation {var}.
 * @param {string} [overrideLocale] - Specific locale override.
 * @returns {string} Translated string.
 */
function t(key, params = {}, overrideLocale = null) {
  const locale = overrideLocale || currentLocale;
  const dict = TRANSLATIONS[locale] || TRANSLATIONS[DEFAULT_LOCALE];
  let template = dict[key] || TRANSLATIONS[DEFAULT_LOCALE][key] || key;

  if (params && typeof params === 'object') {
    for (const [k, val] of Object.entries(params)) {
      template = template.replace(new RegExp(`\\{${k}\\}`, 'g'), String(val));
    }
  }

  return template;
}

module.exports = {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  TRANSLATIONS,
  detectSystemLocale,
  setLocale,
  getLocale,
  t
};
