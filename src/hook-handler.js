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
 * @param {boolean} [options.isFree=false] - Free quota flag.
 * @returns {Promise<{ badge: string, turnTokens: number, turnCostUsd: number, todayTokens: number, todayCostUsd: number, cacheHitRate: number, isFree: boolean }>}
 */
async function handlePostInvocation(options = {}) {
  const currency = options.currency || 'usd';
  const modelName = options.modelName || null;
  const isFree = Boolean(options.isFree);

  const { sessions } = await syncSessions({ modelName });
  const todaySummary = getToday(sessions, new Date(), modelName);

  let latestTurn = null;
  if (sessions.length > 0 && sessions[0].turns && sessions[0].turns.length > 0) {
    const turns = sessions[0].turns;
    latestTurn = turns[turns.length - 1];
  }

  const turnTokens = latestTurn ? latestTurn.totalTokens : 0;
  const turnCostUsd = isFree ? 0 : (latestTurn ? latestTurn.costUsd : 0);
  const todayCostUsd = isFree ? 0 : todaySummary.costUsd;

  const badgeData = {
    turnTokens,
    turnCostUsd,
    todayTokens: todaySummary.totalTokens,
    todayCostUsd,
    cacheHitRate: todaySummary.cacheHitRate,
    isFree
  };

  const badgeStr = renderRealTimeBadge(badgeData, currency, isFree);

  return {
    badge: badgeStr,
    ...badgeData
  };
}

module.exports = {
  handlePostInvocation
};
