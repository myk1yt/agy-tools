/**
 * @fileoverview Antigravity PostInvocation hook handler.
 * Generates lightweight, real-time single-line terminal badges
 * displaying turn consumption, daily accumulated totals, and cache hit metrics.
 */

const { syncSessions } = require('./cache-manager');
const { getToday } = require('./aggregator');
const { renderRealTimeBadge } = require('./formatter');

/**
 * Handles PostInvocation hook event and returns status badge data.
 * @param {object} [options] - Options.
 * @param {string} [options.currency='usd'] - Selected currency.
 * @param {string} [options.modelName] - Model override.
 * @returns {Promise<{ badge: string, turnTokens: number, turnCostUsd: number, todayTokens: number, todayCostUsd: number, cacheHitRate: number }>}
 */
async function handlePostInvocation(options = {}) {
  const currency = options.currency || 'usd';
  const modelName = options.modelName || null;

  const { sessions } = await syncSessions({ modelName });
  const todaySummary = getToday(sessions, new Date(), modelName);

  let latestTurn = null;
  if (sessions.length > 0 && sessions[0].turns && sessions[0].turns.length > 0) {
    const turns = sessions[0].turns;
    latestTurn = turns[turns.length - 1];
  }

  const turnTokens = latestTurn ? latestTurn.totalTokens : 0;
  const turnCostUsd = latestTurn ? latestTurn.costUsd : 0;

  const badgeData = {
    turnTokens,
    turnCostUsd,
    todayTokens: todaySummary.totalTokens,
    todayCostUsd: todaySummary.costUsd,
    cacheHitRate: todaySummary.cacheHitRate
  };

  const badgeStr = renderRealTimeBadge(badgeData, currency);

  return {
    badge: badgeStr,
    ...badgeData
  };
}

module.exports = {
  handlePostInvocation
};
