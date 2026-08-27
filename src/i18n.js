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
    freeQuota: 'Free Quota',
    freeCostLabel: 'Free ($0.00)',

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

    // Pricing Table & Sync
    pricingCatalogTitle: 'Official API Pricing Catalog (/model)',
    pricingCatalogSubtitle: 'Live model rates per 1,000,000 tokens across Google Gemini, Claude & OpenAI',
    colProvider: 'Provider',
    colModel: 'Model',
    colContext: 'Context',
    colInputRate: 'Input / 1M',
    colCachedRate: 'Cached / 1M',
    colOutputRate: 'Output / 1M',
    pricingFooterSources: 'Official Sources: {sources}',
    pricingFooterSyncTip: 'Run "agy-tools sync-prices" to sync latest remote rates from GitHub',
    pricingFooterVersion: 'Pricing Catalog v{version} • Updated: {date} • Source: {source}',
    syncInProgress: 'Fetching latest pricing catalog from remote repository...',
    syncSuccess: 'Pricing catalog synchronized successfully ({count} models updated, v{version}).',
    syncFailed: 'Failed to fetch remote pricing: {error}. Using {fallback} pricing.',
    syncCacheSaved: 'Saved pricing catalog to {path}',

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
    cliOptFree: 'Display pure token metrics without dollar cost (free/flat subscription quota)',
    cliOptJson: 'Output raw JSON for script integration',
    cliOptHook: 'Output 1-line real-time status badge for Antigravity PostInvocation hook',
    cliOptRaw: 'Output raw badge string without PostInvocation JSON wrapper',
    cliOptFresh: 'Bypass cache and force re-parsing of all transcript logs',
    cliOptSync: 'Synchronize official API pricing catalog from remote repository',
    cliOptPrices: 'Display official API pricing table for all Antigravity /model choices',
    cliOptAutoSync: 'Automatically check and sync pricing if older than 24 hours',
    cliOptHtml: 'Generate self-refreshing HTML dashboard (summary + 30-day table + chart)',
    cliOptServe: 'Start local SSE dashboard server (default port 8787)',
    cliOptPort: 'Port for --serve (0 = random)',
    cliOptOpen: 'Open dashboard in default browser after --html/--serve',
    cliOptWriteDashboard: 'Write dashboard data files (statusline side effect)',
    cliOptNoLink: 'Suppress clickable dashboard link in statusline badge',
    cliOptRefresh: 'Dashboard polling interval in seconds (default 5)',
    cliOptNoColor: 'Disable ANSI terminal colors',
    cliOptHelp: 'Display this help message',
    cliOptVersion: 'Display version number',

    // Dashboard (real-time HTML)
    dashboardLink: 'Dashboard',
    dashboardTitle: 'Antigravity Token Dashboard',
    summaryToday: 'Today',
    summaryYesterday: 'Yesterday',
    summary7d: 'Last 7 Days',
    summary30d: 'Last 30 Days',
    chartTitle: 'Token Usage Trend (30 Days)',
    tableTitle: 'Daily Breakdown (30 Days)',
    lastUpdated: 'Last updated: {time}',
    liveStatus: 'Live',
    openDashboard: 'Opening dashboard in browser: {url}',
    serveStarted: 'Dashboard server running at {url} (Ctrl+C to stop)',
    servePortInUse: 'Port {port} in use, trying {nextPort}...',

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
    freeQuota: '무료 플랜',
    freeCostLabel: '무료 (₩0)',

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

    // Pricing Table & Sync
    pricingCatalogTitle: '공식 API 가격 카탈로그 (/model)',
    pricingCatalogSubtitle: 'Google Gemini, Anthropic Claude, OpenAI 모델별 100만(1M) 토큰당 공식 단가',
    colProvider: '제공사',
    colModel: '모델명',
    colContext: '컨텍스트',
    colInputRate: '입력 / 1M',
    colCachedRate: '캐시 / 1M',
    colOutputRate: '출력 / 1M',
    pricingFooterSources: '공식 출처: {sources}',
    pricingFooterSyncTip: '"agy-tools sync-prices" 명령으로 최신 원격 가격을 동기화할 수 있습니다.',
    pricingFooterVersion: '가격 카탈로그 v{version} • 업데이트: {date} • 출처: {source}',
    syncInProgress: '원격 저장소에서 최신 가격 카탈로그를 가져오는 중...',
    syncSuccess: '가격 카탈로그가 성공적으로 동기화되었습니다 ({count}개 모델 업데이트, v{version}).',
    syncFailed: '원격 가격 동기화 실패: {error}. {fallback} 가격 정보를 사용합니다.',
    syncCacheSaved: '가격 카탈로그를 {path}에 저장했습니다.',

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
    cliOptFree: '비용(달러) 없이 순수 토큰 사용량만 표시 (무료/구독 플랫 요금제)',
    cliOptJson: '프로그래밍 연동을 위한 순수 JSON 출력',
    cliOptHook: 'Antigravity PostInvocation 훅용 1줄 실시간 상태 배지 출력',
    cliOptRaw: 'PostInvocation JSON 래퍼 없이 순수 배지 문자열만 출력',
    cliOptFresh: '캐시를 무시하고 모든 로그 파일을 새로 파싱',
    cliOptSync: '원격 저장소에서 공식 API 가격 카탈로그 동기화',
    cliOptPrices: 'Antigravity /model에서 선택 가능한 모든 모델의 공식 가격표 출력',
    cliOptAutoSync: '가격 캐시가 24시간 이상 지난 경우 자동 동기화',
    cliOptHtml: '실시간 자동 갱신 HTML 대시보드 생성 (요약 + 30일 표 + 차트)',
    cliOptServe: '로컬 SSE 대시보드 서버 시작 (기본 포트 8787)',
    cliOptPort: '--serve 포트 지정 (0 = 랜덤)',
    cliOptOpen: '--html/--serve 후 기본 브라우저에서 대시보드 열기',
    cliOptWriteDashboard: '대시보드 데이터 파일 기록 (상태줄 부수 효과)',
    cliOptNoLink: '상태줄 배지에서 대시보드 링크 비활성화',
    cliOptRefresh: '대시보드 폴링 간격(초, 기본 5)',
    cliOptNoColor: 'ANSI 터미널 색상 비활성화',
    cliOptHelp: '도움말 메시지 출력',
    cliOptVersion: '버전 정보 출력',

    // Dashboard (real-time HTML)
    dashboardLink: '대시보드',
    dashboardTitle: 'Antigravity 토큰 대시보드',
    summaryToday: '오늘',
    summaryYesterday: '어제',
    summary7d: '최근 7일',
    summary30d: '최근 30일',
    chartTitle: '토큰 사용 추이 (30일)',
    tableTitle: '일별 상세 (30일)',
    lastUpdated: '마지막 업데이트: {time}',
    liveStatus: '실시간',
    openDashboard: '브라우저에서 대시보드를 엽니다: {url}',
    serveStarted: '대시보드 서버 실행 중: {url} (종료: Ctrl+C)',
    servePortInUse: '포트 {port} 사용 중, {nextPort} 시도...',

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
    freeQuota: '無料枠',
    freeCostLabel: '無料 (¥0)',

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

    // Pricing Table & Sync
    pricingCatalogTitle: '公式API価格カタログ (/model)',
    pricingCatalogSubtitle: 'Google Gemini、Anthropic Claude、OpenAI の各モデル 1,000,000 トークンあたりの公式レート',
    colProvider: 'プロバイダー',
    colModel: 'モデル名',
    colContext: 'コンテキスト',
    colInputRate: '入力 / 1M',
    colCachedRate: 'キャッシュ / 1M',
    colOutputRate: '出力 / 1M',
    pricingFooterSources: '公式ソース: {sources}',
    pricingFooterSyncTip: '「agy-tools sync-prices」を実行して最新のリモート価格を同期できます。',
    pricingFooterVersion: '価格カタログ v{version} • 更新日: {date} • ソース: {source}',
    syncInProgress: 'リモートリポジトリから最新の価格カタログを取得中...',
    syncSuccess: '価格カタログの同期に成功しました ({count} 件のモデル更新、v{version})。',
    syncFailed: 'リモート価格の取得に失敗しました: {error}。{fallback} の価格情報を使用します。',
    syncCacheSaved: '価格カタログを {path} に保存しました。',

    // Hook & Badge
    hookBadgeTurn: '今回ターン',
    hookBadgeToday: '本日累計',
    hookBadgeCache: 'キャッシュ',
    hookBadgeCost: 'コスト',

    // CLI Options & Help
    cliHelpTitle: '使用方法:',
    cliHelpUsage: 'agy-tokens [オプション]',
    cliHelpDescription: 'Antigravity の対话ログからトークン消費量とAPIコストを高精度に分析します。',
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
    cliOptFree: '金額を表示せず純粋なトークン量のみを表示 (無料/定額プラン)',
    cliOptJson: 'プログラム連携用のJSON形式で出力',
    cliOptHook: 'Antigravity PostInvocation フック用の1行バッジを出力',
    cliOptRaw: 'PostInvocation JSONラッパーなしで生のバッジ文字列を出力',
    cliOptFresh: 'キャッシュを破棄して全ログを再解析',
    cliOptSync: 'リモートリポジトリから公式API価格カタログを同期',
    cliOptPrices: 'Antigravity /model で選択可能な全モデルの公式価格表を表示',
    cliOptAutoSync: '24時間以上経過した価格キャッシュを自動同期',
    cliOptHtml: '自動更新HTMLダッシュボードを生成 (サマリー + 30日テーブル + チャート)',
    cliOptServe: 'ローカルSSEダッシュボードサーバーを起動 (デフォルトポート8787)',
    cliOptPort: '--serve のポート指定 (0 = ランダム)',
    cliOptOpen: '--html/--serve の後、既定ブラウザでダッシュボードを開く',
    cliOptWriteDashboard: 'ダッシュボードデータファイルを書き出す (ステータスライン副作用)',
    cliOptNoLink: 'ステータスラインバッジのダッシュボードリンクを無効化',
    cliOptRefresh: 'ダッシュボードのポーリング間隔(秒、既定5)',
    cliOptNoColor: 'ターミナルカラー出力を無効化',
    cliOptHelp: 'ヘルプメッセージを表示',
    cliOptVersion: 'バージョンを表示',

    // Dashboard (real-time HTML)
    dashboardLink: 'ダッシュボード',
    dashboardTitle: 'Antigravity トークンダッシュボード',
    summaryToday: '今日',
    summaryYesterday: '昨日',
    summary7d: '過去7日間',
    summary30d: '過去30日間',
    chartTitle: 'トークン使用推移 (30日間)',
    tableTitle: '日別内訳 (30日間)',
    lastUpdated: '最終更新: {time}',
    liveStatus: 'ライブ',
    openDashboard: 'ブラウザでダッシュボードを開きます: {url}',
    serveStarted: 'ダッシュボードサーバー実行中: {url} (終了: Ctrl+C)',
    servePortInUse: 'ポート {port} は使用中、{nextPort} を試行...',

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
    freeQuota: '免费配额',
    freeCostLabel: '免费 ($0.00)',

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

    // Pricing Table & Sync
    pricingCatalogTitle: '官方 API 定价目录 (/model)',
    pricingCatalogSubtitle: 'Google Gemini、Anthropic Claude、OpenAI 各模型每 1,000,000 Token 官方费率',
    colProvider: '供应商',
    colModel: '模型名称',
    colContext: '上下文',
    colInputRate: '输入 / 1M',
    colCachedRate: '缓存 / 1M',
    colOutputRate: '输出 / 1M',
    pricingFooterSources: '官方来源: {sources}',
    pricingFooterSyncTip: '运行 "agy-tools sync-prices" 可从远程同步最新定价。',
    pricingFooterVersion: '定价目录 v{version} • 更新日期: {date} • 来源: {source}',
    syncInProgress: '正在从远程仓库获取最新定价目录...',
    syncSuccess: '定价目录同步成功（已更新 {count} 个模型，v{version}）。',
    syncFailed: '获取远程定价失败: {error}。将使用 {fallback} 定价。',
    syncCacheSaved: '定价目录已保存至 {path}',

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
    cliOptFree: '仅显示纯 Token 用量指标，不计算费用（免费/订阅制配额）',
    cliOptJson: '输出原始 JSON 供脚本集成使用',
    cliOptHook: '输出用于 Antigravity PostInvocation 钩子的单行实时状态徽章',
    cliOptRaw: '输出原始徽章字符串，无需 PostInvocation JSON 包装',
    cliOptFresh: '忽略缓存并强制重新解析所有日志文件',
    cliOptSync: '从远程仓库同步官方 API 定价目录',
    cliOptPrices: '显示 Antigravity /model 中所有可选模型的官方价格表',
    cliOptAutoSync: '若价格缓存超过 24 小时则自动同步',
    cliOptHtml: '生成自动刷新的 HTML 仪表板（摘要 + 30 天表格 + 图表）',
    cliOptServe: '启动本地 SSE 仪表板服务器（默认端口 8787）',
    cliOptPort: '指定 --serve 端口（0 = 随机）',
    cliOptOpen: '--html/--serve 后在默认浏览器中打开仪表板',
    cliOptWriteDashboard: '写入仪表板数据文件（状态栏副作用）',
    cliOptNoLink: '在状态栏徽章中禁用仪表板链接',
    cliOptRefresh: '仪表板轮询间隔（秒，默认 5）',
    cliOptNoColor: '禁用终端彩色输出',
    cliOptHelp: '显示此帮助信息',
    cliOptVersion: '显示版本号',

    // Dashboard (real-time HTML)
    dashboardLink: '仪表板',
    dashboardTitle: 'Antigravity Token 仪表板',
    summaryToday: '今天',
    summaryYesterday: '昨天',
    summary7d: '最近 7 天',
    summary30d: '最近 30 天',
    chartTitle: 'Token 使用趋势 (30 天)',
    tableTitle: '每日明细 (30 天)',
    lastUpdated: '最后更新: {time}',
    liveStatus: '实时',
    openDashboard: '在浏览器中打开仪表板: {url}',
    serveStarted: '仪表板服务器运行中: {url} (退出: Ctrl+C)',
    servePortInUse: '端口 {port} 已被占用，尝试 {nextPort}...',

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
