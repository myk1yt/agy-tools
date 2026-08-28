/**
 * @fileoverview Date-based and session-based aggregation engine.
 * Computes token sums, cache hit rates, cost estimates, and daily trends.
 */

const { calculateCostUsd, calculateCacheSavingsUsd, convertCurrency } = require('./config');

/**
 * Formats a Date object to YYYY-MM-DD string in local time.
 * @param {Date} date - Date object.
 * @returns {string} Formatted date string (e.g. '2026-08-27').
 */
function formatLocalDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parses a YYYY-MM-DD string into a local Date object (at 00:00:00).
 * @param {string} str - Date string.
 * @returns {Date|null}
 */
function parseLocalDate(str) {
  if (!str || typeof str !== 'string') return null;
  const match = str.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1;
  const day = parseInt(match[3], 10);
  return new Date(year, month, day, 0, 0, 0, 0);
}

/**
 * Creates an empty summary accumulator.
 * @returns {object}
 */
function createEmptySummary() {
  return {
    totalSessions: 0,
    totalTurns: 0,
    inputTokens: 0,
    cachedTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cacheHitRate: 0,
    costUsd: 0,
    cacheSavingsUsd: 0
  };
}

/**
 * Summarizes an array of turn objects.
 * @param {Array<object>} turns - Array of turn objects.
 * @param {string} [modelName] - Active model for pricing.
 * @returns {object} Aggregated metrics.
 */
function summarizeTurns(turns, modelName = null) {
  const summary = createEmptySummary();
  summary.totalTurns = turns.length;

  let hasPerTurnCosts = turns.length > 0;
  for (const turn of turns) {
    summary.inputTokens += turn.inputTokens || 0;
    summary.cachedTokens += turn.cachedTokens || 0;
    summary.outputTokens += turn.outputTokens || 0;
    if (typeof turn.costUsd === 'number') {
      summary.costUsd += turn.costUsd;
    } else {
      hasPerTurnCosts = false;
    }
  }

  summary.totalTokens = summary.inputTokens + summary.cachedTokens + summary.outputTokens;
  summary.cacheHitRate =
    summary.inputTokens + summary.cachedTokens > 0
      ? (summary.cachedTokens / (summary.inputTokens + summary.cachedTokens)) * 100
      : 0;

  if (!hasPerTurnCosts) {
    // Legacy fallback: recalculate from aggregate tokens with single model
    summary.costUsd = calculateCostUsd(
      summary.inputTokens, summary.cachedTokens, summary.outputTokens, modelName
    );
  }

  summary.cacheSavingsUsd = calculateCacheSavingsUsd(summary.cachedTokens, modelName);

  return summary;
}

/**
 * Aggregates usage for a specific calendar date (default: today).
 * @param {Array<object>} sessions - List of parsed session objects.
 * @param {Date} [refDate] - Reference date (defaults to new Date()).
 * @param {string} [modelName] - Active model name.
 * @returns {object} Aggregation result.
 */
function getToday(sessions, refDate = new Date(), modelName = null) {
  const targetDateStr = formatLocalDate(refDate);
  const matchingTurns = [];
  const matchingSessionIds = new Set();

  for (const session of sessions) {
    let sessionHasTodayTurn = false;
    if (session.turns && session.turns.length > 0) {
      for (const turn of session.turns) {
        const turnDateStr = formatLocalDate(new Date(turn.createdAt));
        if (turnDateStr === targetDateStr) {
          matchingTurns.push(turn);
          sessionHasTodayTurn = true;
        }
      }
    } else if (session.startTime) {
      const sessionDateStr = formatLocalDate(new Date(session.startTime));
      if (sessionDateStr === targetDateStr) {
        sessionHasTodayTurn = true;
      }
    }

    if (sessionHasTodayTurn) {
      matchingSessionIds.add(session.sessionId);
    }
  }

  const summary = summarizeTurns(matchingTurns, modelName);
  summary.totalSessions = matchingSessionIds.size;
  summary.period = 'today';
  summary.dateStr = targetDateStr;

  return summary;
}

/**
 * Aggregates usage for yesterday.
 * @param {Array<object>} sessions - List of parsed session objects.
 * @param {Date} [refDate] - Reference date (defaults to new Date()).
 * @param {string} [modelName] - Active model name.
 * @returns {object} Aggregation result.
 */
function getYesterday(sessions, refDate = new Date(), modelName = null) {
  const yesterday = new Date(refDate);
  yesterday.setDate(yesterday.getDate() - 1);
  const targetDateStr = formatLocalDate(yesterday);

  const matchingTurns = [];
  const matchingSessionIds = new Set();

  for (const session of sessions) {
    let sessionHasYesterdayTurn = false;
    if (session.turns && session.turns.length > 0) {
      for (const turn of session.turns) {
        const turnDateStr = formatLocalDate(new Date(turn.createdAt));
        if (turnDateStr === targetDateStr) {
          matchingTurns.push(turn);
          sessionHasYesterdayTurn = true;
        }
      }
    } else if (session.startTime) {
      const sessionDateStr = formatLocalDate(new Date(session.startTime));
      if (sessionDateStr === targetDateStr) {
        sessionHasYesterdayTurn = true;
      }
    }

    if (sessionHasYesterdayTurn) {
      matchingSessionIds.add(session.sessionId);
    }
  }

  const summary = summarizeTurns(matchingTurns, modelName);
  summary.totalSessions = matchingSessionIds.size;
  summary.period = 'yesterday';
  summary.dateStr = targetDateStr;

  return summary;
}

/**
 * Aggregates usage across the last N days with daily breakdown.
 * @param {Array<object>} sessions - List of parsed session objects.
 * @param {number} nDays - Number of days (e.g. 7 or 30).
 * @param {Date} [refDate] - Reference date.
 * @param {string} [modelName] - Active model name.
 * @returns {object} Daily breakdown and grand total.
 */
function getLastNDays(sessions, nDays = 7, refDate = new Date(), modelName = null) {
  const dailyMap = new Map();
  const dateList = [];

  // Generate ordered list of dates from oldest to newest
  for (let i = nDays - 1; i >= 0; i--) {
    const d = new Date(refDate);
    d.setDate(d.getDate() - i);
    const dateStr = formatLocalDate(d);
    dateList.push(dateStr);
    dailyMap.set(dateStr, {
      date: dateStr,
      sessions: new Set(),
      turns: []
    });
  }

  // Distribute turns into corresponding date buckets
  for (const session of sessions) {
    if (session.turns && session.turns.length > 0) {
      for (const turn of session.turns) {
        const turnDateStr = formatLocalDate(new Date(turn.createdAt));
        if (dailyMap.has(turnDateStr)) {
          const bucket = dailyMap.get(turnDateStr);
          bucket.turns.push(turn);
          bucket.sessions.add(session.sessionId);
        }
      }
    }
  }

  const dailyBreakdown = [];
  const allTurns = [];
  const allSessionIds = new Set();

  for (const dateStr of dateList) {
    const bucket = dailyMap.get(dateStr);
    const daySummary = summarizeTurns(bucket.turns, modelName);
    daySummary.date = dateStr;
    daySummary.sessions = bucket.sessions.size;
    dailyBreakdown.push(daySummary);

    for (const t of bucket.turns) allTurns.push(t);
    for (const s of bucket.sessions) allSessionIds.add(s);
  }

  const grandTotal = summarizeTurns(allTurns, modelName);
  grandTotal.totalSessions = allSessionIds.size;
  grandTotal.period = `${nDays}d`;
  grandTotal.dateRange = `${dateList[0]}..${dateList[dateList.length - 1]}`;
  grandTotal.daily = dailyBreakdown;

  return grandTotal;
}

/**
 * Aggregates usage for a custom date range (YYYY-MM-DD..YYYY-MM-DD).
 * @param {Array<object>} sessions - List of parsed session objects.
 * @param {string} rangeStr - Date range string (e.g. '2026-08-01..2026-08-27').
 * @param {string} [modelName] - Active model name.
 * @returns {object} Aggregated range summary with daily breakdown.
 */
function getDateRange(sessions, rangeStr, modelName = null) {
  const parts = rangeStr.split(/\.\.|:/);
  if (parts.length !== 2) {
    throw new Error('Invalid date range format. Expected YYYY-MM-DD..YYYY-MM-DD');
  }

  const start = parseLocalDate(parts[0]);
  const end = parseLocalDate(parts[1]);

  if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error('Invalid date range format. Expected YYYY-MM-DD..YYYY-MM-DD');
  }

  const startTime = start.getTime();
  const endTime = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999).getTime();

  if (startTime > endTime) {
    throw new Error('Start date must be before or equal to end date.');
  }

  const dailyMap = new Map();
  const cur = new Date(start);
  while (cur <= end) {
    const dateStr = formatLocalDate(cur);
    dailyMap.set(dateStr, {
      date: dateStr,
      sessions: new Set(),
      turns: []
    });
    cur.setDate(cur.getDate() + 1);
  }

  for (const session of sessions) {
    if (session.turns && session.turns.length > 0) {
      for (const turn of session.turns) {
        const turnTime = new Date(turn.createdAt).getTime();
        if (turnTime >= startTime && turnTime <= endTime) {
          const dateStr = formatLocalDate(new Date(turn.createdAt));
          if (dailyMap.has(dateStr)) {
            const bucket = dailyMap.get(dateStr);
            bucket.turns.push(turn);
            bucket.sessions.add(session.sessionId);
          }
        }
      }
    }
  }

  const dailyBreakdown = [];
  const allTurns = [];
  const allSessionIds = new Set();

  for (const [dateStr, bucket] of dailyMap.entries()) {
    const daySummary = summarizeTurns(bucket.turns, modelName);
    daySummary.date = dateStr;
    daySummary.sessions = bucket.sessions.size;
    dailyBreakdown.push(daySummary);

    for (const t of bucket.turns) allTurns.push(t);
    for (const s of bucket.sessions) allSessionIds.add(s);
  }

  const grandTotal = summarizeTurns(allTurns, modelName);
  grandTotal.totalSessions = allSessionIds.size;
  grandTotal.period = 'range';
  grandTotal.dateRange = rangeStr;
  grandTotal.daily = dailyBreakdown;

  return grandTotal;
}

/**
 * Retrieves drilldown details for a specific session ID or the latest session.
 * @param {Array<object>} sessions - List of parsed sessions.
 * @param {string} [sessionId] - Optional session ID or prefix.
 * @returns {object|null} Detailed session object.
 */
function getSessionDrilldown(sessions, sessionId = null) {
  if (!sessions || sessions.length === 0) return null;

  if (!sessionId) {
    // Return latest session
    return sessions[0];
  }

  const query = sessionId.toLowerCase().trim();
  const match = sessions.find(s => s.sessionId.toLowerCase().startsWith(query));
  return match || null;
}

/**
 * Aggregates all-time history across all sessions.
 * @param {Array<object>} sessions - List of parsed sessions.
 * @param {string} [modelName] - Active model name.
 * @returns {object} All-time summary.
 */
function getAllTime(sessions, modelName = null) {
  const allTurns = [];
  const allSessionIds = new Set();
  const dailyMap = new Map();

  for (const session of sessions) {
    allSessionIds.add(session.sessionId);
    if (session.turns && session.turns.length > 0) {
      for (const turn of session.turns) {
        allTurns.push(turn);
        const dateStr = formatLocalDate(new Date(turn.createdAt));
        if (!dailyMap.has(dateStr)) {
          dailyMap.set(dateStr, {
            date: dateStr,
            sessions: new Set(),
            turns: []
          });
        }
        const bucket = dailyMap.get(dateStr);
        bucket.turns.push(turn);
        bucket.sessions.add(session.sessionId);
      }
    }
  }

  const sortedDates = Array.from(dailyMap.keys()).sort();
  const dailyBreakdown = sortedDates.map(dateStr => {
    const bucket = dailyMap.get(dateStr);
    const daySummary = summarizeTurns(bucket.turns, modelName);
    daySummary.date = dateStr;
    daySummary.sessions = bucket.sessions.size;
    return daySummary;
  });

  const grandTotal = summarizeTurns(allTurns, modelName);
  grandTotal.totalSessions = allSessionIds.size;
  grandTotal.period = 'all';
  grandTotal.dateRange =
    sortedDates.length > 0
      ? `${sortedDates[0]}..${sortedDates[sortedDates.length - 1]}`
      : 'all-time';
  grandTotal.daily = dailyBreakdown;

  return grandTotal;
}

module.exports = {
  formatLocalDate,
  parseLocalDate,
  createEmptySummary,
  summarizeTurns,
  getToday,
  getYesterday,
  getLastNDays,
  getDateRange,
  getSessionDrilldown,
  getAllTime
};
