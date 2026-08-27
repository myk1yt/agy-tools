/**
 * @fileoverview Configuration, model pricing catalog, currency exchange rates,
 * and system path resolvers for Antigravity Token & Cost Tracker.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Standard system paths for Antigravity and token tracking cache.
 */
const HOME_DIR = os.homedir();
const GEMINI_DIR = path.join(HOME_DIR, '.gemini');
const ANTIGRAVITY_DIR = path.join(GEMINI_DIR, 'antigravity-cli');
const BRAIN_DIR = path.join(ANTIGRAVITY_DIR, 'brain');
const HISTORY_FILE = path.join(ANTIGRAVITY_DIR, 'history.jsonl');
const SETTINGS_FILE = path.join(ANTIGRAVITY_DIR, 'settings.json');
const CACHE_FILE = path.join(GEMINI_DIR, 'token_tracker_cache.json');
const USER_CONFIG_FILE = path.join(GEMINI_DIR, 'antigravity_tokens.json');

/**
 * Model pricing catalog (prices in USD per 1,000,000 tokens).
 */
const MODEL_PRICING = {
  'gemini-3.7-flash': {
    id: 'gemini-3.7-flash',
    displayName: 'Gemini 3.7 Flash',
    inputPerMillion: 0.15,
    cachedInputPerMillion: 0.0375,
    outputPerMillion: 0.60,
    aliases: [
      'gemini-3.7-flash',
      'gemini 3.7 flash',
      'gemini 3.7 flash (high)',
      'gemini 3.7 flash (low)',
      'gemini-3.7-flash-high',
      'gemini-3.7-flash-low'
    ]
  },
  'gemini-2.5-flash': {
    id: 'gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash',
    inputPerMillion: 0.15,
    cachedInputPerMillion: 0.0375,
    outputPerMillion: 0.60,
    aliases: ['gemini-2.5-flash', 'gemini 2.5 flash', 'gemini-flash']
  },
  'gemini-2.5-pro': {
    id: 'gemini-2.5-pro',
    displayName: 'Gemini 2.5 Pro',
    inputPerMillion: 1.25,
    cachedInputPerMillion: 0.3125,
    outputPerMillion: 5.00,
    aliases: [
      'gemini-2.5-pro',
      'gemini 2.5 pro',
      'gemini-3-pro',
      'gemini 3 pro',
      'gemini-pro'
    ]
  },
  'claude-3.7-sonnet': {
    id: 'claude-3.7-sonnet',
    displayName: 'Claude 3.7 Sonnet',
    inputPerMillion: 3.00,
    cachedInputPerMillion: 0.30,
    outputPerMillion: 15.00,
    aliases: [
      'claude-3.7-sonnet',
      'claude 3.7 sonnet',
      'claude-3-5-sonnet',
      'claude 3.5 sonnet',
      'sonnet'
    ]
  },
  'default': {
    id: 'default',
    displayName: 'Gemini 3.7 Flash (Default)',
    inputPerMillion: 0.15,
    cachedInputPerMillion: 0.0375,
    outputPerMillion: 0.60,
    aliases: ['default']
  }
};

/**
 * Currency conversion table relative to USD.
 */
const CURRENCIES = {
  usd: {
    code: 'USD',
    symbol: '$',
    rate: 1.0,
    precision: 4,
    displayDecimals: 4,
    position: 'before',
    name: 'US Dollar'
  },
  krw: {
    code: 'KRW',
    symbol: '₩',
    rate: 1450.0,
    precision: 0,
    displayDecimals: 1,
    position: 'before',
    name: 'South Korean Won'
  },
  jpy: {
    code: 'JPY',
    symbol: '¥',
    rate: 155.0,
    precision: 2,
    displayDecimals: 2,
    position: 'before',
    name: 'Japanese Yen'
  },
  eur: {
    code: 'EUR',
    symbol: '€',
    rate: 0.95,
    precision: 4,
    displayDecimals: 4,
    position: 'after',
    name: 'Euro'
  },
  gbp: {
    code: 'GBP',
    symbol: '£',
    rate: 0.80,
    precision: 4,
    displayDecimals: 4,
    position: 'before',
    name: 'British Pound'
  }
};

/**
 * Reads the active model name configured in Antigravity settings.json.
 * @returns {string} The active model name or a default fallback.
 */
function getActiveModelFromSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const content = fs.readFileSync(SETTINGS_FILE, 'utf8');
      const settings = JSON.parse(content);
      if (settings && typeof settings.model === 'string' && settings.model.trim()) {
        return settings.model.trim();
      }
    }
  } catch (_err) {
    // Gracefully ignore file read or parse error
  }
  return 'Gemini 3.7 Flash (High)';
}

/**
 * Resolves pricing structure for a given model string or alias.
 * @param {string} [modelName] - Optional model identifier or display name.
 * @returns {object} Pricing configuration for the matched model.
 */
function getModelPricing(modelName) {
  const target = (modelName || getActiveModelFromSettings()).toLowerCase().trim();

  for (const key of Object.keys(MODEL_PRICING)) {
    const info = MODEL_PRICING[key];
    if (info.aliases.some(alias => target.includes(alias.toLowerCase()))) {
      return info;
    }
  }

  return MODEL_PRICING['default'];
}

/**
 * Loads user custom overrides from ~/.gemini/antigravity_tokens.json if present.
 * @returns {object} Merged configuration object.
 */
function loadUserConfig() {
  const config = {
    currency: 'usd',
    lang: null,
    customRates: {},
    customPricing: {}
  };

  try {
    if (fs.existsSync(USER_CONFIG_FILE)) {
      const raw = fs.readFileSync(USER_CONFIG_FILE, 'utf8');
      const user = JSON.parse(raw);
      if (user.currency && CURRENCIES[user.currency.toLowerCase()]) {
        config.currency = user.currency.toLowerCase();
      }
      if (user.lang) {
        config.lang = user.lang.toLowerCase();
      }
      if (user.rates && typeof user.rates === 'object') {
        config.customRates = user.rates;
      }
      if (user.pricing && typeof user.pricing === 'object') {
        config.customPricing = user.pricing;
      }
    }
  } catch (_err) {
    // Ignore invalid user config
  }

  return config;
}

/**
 * Calculates token cost in USD based on input, cached input, and output tokens.
 * @param {number} inputTokens - Fresh (uncached) input tokens.
 * @param {number} cachedTokens - Cached input prompt tokens.
 * @param {number} outputTokens - Model generation output tokens.
 * @param {string} [modelName] - Model identifier.
 * @returns {number} Cost in USD.
 */
function calculateCostUsd(inputTokens, cachedTokens, outputTokens, modelName) {
  const pricing = getModelPricing(modelName);
  const inputCost = (Math.max(0, inputTokens) / 1000000) * pricing.inputPerMillion;
  const cachedCost = (Math.max(0, cachedTokens) / 1000000) * pricing.cachedInputPerMillion;
  const outputCost = (Math.max(0, outputTokens) / 1000000) * pricing.outputPerMillion;
  return inputCost + cachedCost + outputCost;
}

/**
 * Calculates theoretical savings achieved through prompt caching.
 * @param {number} cachedTokens - Cached prompt tokens.
 * @param {string} [modelName] - Model identifier.
 * @returns {number} Dollar amount saved in USD.
 */
function calculateCacheSavingsUsd(cachedTokens, modelName) {
  if (!cachedTokens || cachedTokens <= 0) return 0;
  const pricing = getModelPricing(modelName);
  const regularInputCost = (cachedTokens / 1000000) * pricing.inputPerMillion;
  const cachedInputCost = (cachedTokens / 1000000) * pricing.cachedInputPerMillion;
  return Math.max(0, regularInputCost - cachedInputCost);
}

/**
 * Converts USD amount to a target currency.
 * @param {number} usdAmount - Amount in USD.
 * @param {string} currencyCode - Target currency code ('usd', 'krw', 'jpy', 'eur', 'gbp').
 * @returns {number} Converted amount.
 */
function convertCurrency(usdAmount, currencyCode = 'usd') {
  const key = (currencyCode || 'usd').toLowerCase();
  const info = CURRENCIES[key] || CURRENCIES.usd;
  return usdAmount * info.rate;
}

module.exports = {
  HOME_DIR,
  GEMINI_DIR,
  ANTIGRAVITY_DIR,
  BRAIN_DIR,
  HISTORY_FILE,
  SETTINGS_FILE,
  CACHE_FILE,
  USER_CONFIG_FILE,
  MODEL_PRICING,
  CURRENCIES,
  getActiveModelFromSettings,
  getModelPricing,
  loadUserConfig,
  calculateCostUsd,
  calculateCacheSavingsUsd,
  convertCurrency
};
