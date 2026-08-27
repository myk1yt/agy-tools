/**
 * @fileoverview High-precision subword and multilingual token estimator.
 * Calibrated against modern LLM tokenizers (BPE / SentencePiece) across
 * code (Dart, Python, JS/TS, Rust, Go, C++) and human languages (EN, KO, JA, ZH).
 * Pure zero-dependency Node.js implementation.
 */

// BPE Subword and Token Segmentation Regex
const RE_BPE_PATTERN =
  /[\uAC00-\uD7AF]|[\u1100-\u11FF\u3130-\u318F]|[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]|[\u3040-\u309F]|[\u30A0-\u30FF]|[\u{1F300}-\u{1FAFF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{27BF}]|'s|'t|'re|'ve|'m|'ll|'d|[A-Z]?[a-z0-9]+|[A-Z]+(?![a-z0-9])|[0-9]{1,3}| {4}|\t|\r?\n|[^\s\w]/gu;

/**
 * Estimates token count for a raw string.
 * Uses calibrated subword weightings matching Byte-Pair Encoding and SentencePiece.
 *
 * @param {string} text - Input text content to estimate.
 * @returns {number} Estimated token count (integer >= 0).
 */
function estimateTokens(text) {
  if (!text || typeof text !== 'string') {
    return 0;
  }

  const len = text.length;
  if (len === 0) return 0;
  if (len <= 4 && /^[a-zA-Z0-9]+$/.test(text)) return 1;

  const matches = text.match(RE_BPE_PATTERN);
  if (!matches) {
    return Math.max(1, Math.ceil(len / 4));
  }

  let count = 0;
  for (let i = 0; i < matches.length; i++) {
    const chunk = matches[i];
    const cLen = chunk.length;

    if (cLen > 8 && /^[a-zA-Z0-9]+$/.test(chunk)) {
      // Long identifier or compound word (e.g. StatelessWidget, calculateCostUsd)
      count += Math.ceil(cLen / 4.5);
    } else {
      count += 1;
    }
  }

  return Math.max(1, count);
}

/**
 * Estimates token count for a structured message turn, including framing overhead.
 * @param {object} message - Message or turn object containing role, content, tool_calls, etc.
 * @returns {number}
 */
function estimateMessageTokens(message) {
  if (!message) return 0;

  // Base message framing overhead: <|im_start|>role\n ... <|im_end|>\n (~4 tokens)
  let tokens = 4;

  if (typeof message === 'string') {
    return tokens + estimateTokens(message);
  }

  if (message.content && typeof message.content === 'string') {
    tokens += estimateTokens(message.content);
  }

  if (message.display && typeof message.display === 'string') {
    tokens += estimateTokens(message.display);
  }

  if (message.tool_calls && Array.isArray(message.tool_calls)) {
    // Tool call wrapper overhead (~4 tokens)
    tokens += 4;
    for (const tc of message.tool_calls) {
      if (tc.name) tokens += estimateTokens(tc.name) + 2;
      if (tc.args) {
        const argsStr = typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args);
        tokens += estimateTokens(argsStr);
      }
    }
  }

  if (message.toolCall) {
    tokens += 4;
    if (message.toolCall.name) tokens += estimateTokens(message.toolCall.name) + 2;
    if (message.toolCall.argumentsJson) tokens += estimateTokens(message.toolCall.argumentsJson);
  }

  return tokens;
}

/**
 * Estimates cumulative token count for an array of conversation turns.
 * @param {Array<object>} turns - Array of message/turn objects.
 * @returns {number}
 */
function estimateConversationTokens(turns) {
  if (!Array.isArray(turns)) return 0;
  let total = 3; // Conversation start/end priming tokens
  for (const turn of turns) {
    total += estimateMessageTokens(turn);
  }
  return total;
}

module.exports = {
  estimateTokens,
  estimateMessageTokens,
  estimateConversationTokens
};
