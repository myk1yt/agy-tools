/**
 * @fileoverview Configuration, dynamic model pricing catalog, currency exchange rates,
 * and system path resolvers for Antigravity Token & Cost Tracker.
 * Supports smart fuzzy heuristic pricing resolution and dynamic user config overrides.
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
const USER_PRICING_FILE = path.join(GEMINI_DIR, 'pricing.json');
const ALT_PRICING_FILE = path.join(ANTIGRAVITY_DIR, 'pricing.json');

/**
 * Regex patterns for smart fuzzy heuristic pricing tier detection.
 * Uses token-boundary matching to prevent false substring matches (e.g., 'mini' in 'gemini').
 */
const FLASH_PATTERN = /(?:^|[^a-z0-9])(flash|lite|mini|haiku|fast|small|turbo|low)(?:[^a-z0-9]|$)/i;
const PRO_PATTERN = /(?:^|[^a-z0-9])(pro|ultra|opus|sonnet|large|max|high)(?:[^a-z0-9]|$)/i;
const FREE_PATTERN = /(?:^|[^a-z0-9])(free|flat|zero|local|ollama)(?:[^a-z0-9]|$)/i;

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
 * Formats a model name into a human-readable title.
 * @param {string} name - Raw model string.
 * @returns {string} Formatted display name.
 */
function formatModelDisplayName(name) {
  if (!name || typeof name !== 'string') return 'Default Model';
  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(token => {
      if (/^\d+(\.\d+)*[a-z]?$/i.test(token)) {
        return token;
      }
      return token.charAt(0).toUpperCase() + token.slice(1);
    })
    .join(' ');
}

/**
 * Dynamically resolves pricing tier using regex/fuzzy heuristic pattern matching
 * for models not explicitly hardcoded in MODEL_PRICING.
 * @param {string} modelName - Model identifier or display name.
 * @returns {object} Pricing configuration with tier information.
 */
function smartHeuristicPricing(modelName) {
  if (!modelName || typeof modelName !== 'string') {
    return { ...MODEL_PRICING['default'] };
  }

  const normalized = modelName.toLowerCase().trim();
  const displayName = formatModelDisplayName(modelName);

  // 1. Free Tier heuristic: contains free, flat, zero, local, or ollama
  if (FREE_PATTERN.test(normalized)) {
    return {
      id: normalized,
      displayName: displayName || 'Custom Free Model',
      inputPerMillion: 0.0,
      cachedInputPerMillion: 0.0,
      outputPerMillion: 0.0,
      aliases: [normalized],
      tier: 'free'
    };
  }

  // 2. Flash Tier heuristic: contains flash, lite, mini, haiku, fast, small, turbo, or low
  if (FLASH_PATTERN.test(normalized)) {
    return {
      id: normalized,
      displayName: displayName || 'Custom Flash Model',
      inputPerMillion: 0.15,
      cachedInputPerMillion: 0.0375,
      outputPerMillion: 0.60,
      aliases: [normalized],
      tier: 'flash'
    };
  }

  // 3. Pro Tier heuristic: contains pro, ultra, opus, sonnet, large, max, or high
  if (PRO_PATTERN.test(normalized)) {
    return {
      id: normalized,
      displayName: displayName || 'Custom Pro Model',
      inputPerMillion: 1.25,
      cachedInputPerMillion: 0.3125,
      outputPerMillion: 5.00,
      aliases: [normalized],
      tier: 'pro'
    };
  }

  // 4. Graceful fallback to Default Flash Tier
  return {
    id: normalized,
    displayName: `${displayName} (Default)`,
    inputPerMillion: 0.15,
    cachedInputPerMillion: 0.0375,
    outputPerMillion: 0.60,
    aliases: [normalized],
    tier: 'default'
  };
}

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
 * Checks registered MODEL_PRICING (including user overrides) first,
 * then falls back to smart fuzzy heuristic resolution.
 * @param {string} [modelName] - Optional model identifier or display name.
 * @returns {object} Pricing configuration for the matched model.
 */
function getModelPricing(modelName) {
  loadUserConfig();

  const rawTarget = modelName || getActiveModelFromSettings();
  const target = (rawTarget || '').toLowerCase().trim();

  // 1. Exact key match in MODEL_PRICING
  if (MODEL_PRICING[target]) {
    return MODEL_PRICING[target];
  }

  // 2. Exact or substring match against known model aliases
  for (const key of Object.keys(MODEL_PRICING)) {
    const info = MODEL_PRICING[key];
    if (key === 'default') continue;
    if (info.aliases && info.aliases.some(alias => alias.toLowerCase() === target || target.includes(alias.toLowerCase()))) {
      return info;
    }
  }

  // 3. Fallback to smart fuzzy heuristic pattern matching
  return smartHeuristicPricing(rawTarget || target);
}

/**
 * Loads user custom overrides from ~/.gemini/antigravity_tokens.json or pricing.json if present.
 * Merges user-defined custom pricing models directly into MODEL_PRICING.
 * @returns {object} Merged configuration object.
 */
function loadUserConfig() {
  const config = {
    currency: 'usd',
    lang: null,
    free: false,
    noCost: false,
    customRates: {},
    customPricing: {}
  };

  /**
   * Helper to normalize and merge a dictionary of custom model definitions into MODEL_PRICING.
   * @param {object} pricingDict - Map of model keys to pricing definitions.
   */
  function mergePricingDict(pricingDict) {
    if (!pricingDict || typeof pricingDict !== 'object') return;
    for (const [key, def] of Object.entries(pricingDict)) {
      if (!def || typeof def !== 'object') continue;
      const normalizedKey = key.toLowerCase().trim();
      const id = def.id || normalizedKey;
      const displayName = def.displayName || def.name || formatModelDisplayName(id);
      const inputPerMillion = Number(def.inputPerMillion ?? def.input ?? def.prompt ?? 0);
      const cachedInputPerMillion = Number(
        def.cachedInputPerMillion ?? def.cachedInput ?? def.cached ?? (inputPerMillion * 0.25)
      );
      const outputPerMillion = Number(def.outputPerMillion ?? def.output ?? def.completion ?? 0);
      const customAliases = Array.isArray(def.aliases)
        ? def.aliases.map(a => String(a).toLowerCase().trim())
        : [];
      const aliases = Array.from(
        new Set([normalizedKey, id.toLowerCase().trim(), ...customAliases])
      );

      const modelEntry = {
        id,
        displayName,
        inputPerMillion,
        cachedInputPerMillion,
        outputPerMillion,
        aliases
      };

      MODEL_PRICING[normalizedKey] = modelEntry;
      config.customPricing[normalizedKey] = modelEntry;
    }
  }

  // 1. Try reading ~/.gemini/antigravity_tokens.json
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
      if (user.free || user.noCost || user.freeTier) {
        config.free = true;
        config.noCost = true;
      }
      if (user.rates && typeof user.rates === 'object') {
        config.customRates = user.rates;
        for (const [currKey, rate] of Object.entries(user.rates)) {
          const cKey = currKey.toLowerCase();
          if (CURRENCIES[cKey] && typeof rate === 'number') {
            CURRENCIES[cKey].rate = rate;
          }
        }
      }
      if (user.pricing && typeof user.pricing === 'object') {
        mergePricingDict(user.pricing);
      }
      if (user.customPricing && typeof user.customPricing === 'object') {
        mergePricingDict(user.customPricing);
      }
      if (user.models && typeof user.models === 'object') {
        mergePricingDict(user.models);
      }
    }
  } catch (_err) {
    // Ignore invalid user config file
  }

  // 2. Try reading ~/.gemini/pricing.json or ~/.gemini/antigravity-cli/pricing.json
  const pricingFiles = [USER_PRICING_FILE, ALT_PRICING_FILE];
  for (const pFile of pricingFiles) {
    try {
      if (fs.existsSync(pFile)) {
        const raw = fs.readFileSync(pFile, 'utf8');
        const data = JSON.parse(raw);
        if (data && typeof data === 'object') {
          if (data.pricing && typeof data.pricing === 'object') {
            mergePricingDict(data.pricing);
          } else if (data.models && typeof data.models === 'object') {
            mergePricingDict(data.models);
          } else {
            mergePricingDict(data);
          }
        }
      }
    } catch (_err) {
      // Ignore invalid pricing file
    }
  }

  return config;
}

// Perform initial user config merge on load
loadUserConfig();

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
  USER_PRICING_FILE,
  ALT_PRICING_FILE,
  MODEL_PRICING,
  CURRENCIES,
  FLASH_PATTERN,
  PRO_PATTERN,
  FREE_PATTERN,
  formatModelDisplayName,
  smartHeuristicPricing,
  getActiveModelFromSettings,
  getModelPricing,
  loadUserConfig,
  calculateCostUsd,
  calculateCacheSavingsUsd,
  convertCurrency
};
