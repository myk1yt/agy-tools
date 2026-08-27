/**
 * @fileoverview OSC 8 terminal hyperlink formatting and dashboard file URL
 * resolution for the Antigravity Token & Cost Tracker statusline badge.
 * Zero dependencies (Node core: url only).
 */

const { pathToFileURL } = require('url');
const { DASHBOARD_HTML_FILE } = require('./config');

/**
 * Detects whether the current environment can render OSC 8 hyperlinks.
 * Disabled when colors are disabled (NO_COLOR, TERM=dumb) or when stdout
 * is not a TTY (statusline pipes output through the renderer).
 * @returns {boolean}
 */
function isOsc8Supported() {
  if (process.env.NO_COLOR) return false;
  if (process.env.TERM === 'dumb') return false;
  return true;
}

/**
 * Formats an OSC 8 terminal hyperlink escape sequence pair around a label.
 * Format: ESC ] 8 ; ; <uri> ESC \ <label> ESC ] 8 ; ; ESC \
 * Terminals without OSC 8 support ignore the escapes and render the label
 * as plain text (graceful degradation, E6).
 * @param {string} uri - Absolute URI to open (e.g. file:///C:/...).
 * @param {string} label - Visible link text.
 * @returns {string} OSC 8 wrapped label, or plain label when unsupported.
 */
function formatOsc8Link(uri, label) {
  if (!uri || !label) return label || '';
  if (!isOsc8Supported()) return label;
  const ESC = '\x1b';
  const BEL = '\x07';
  return `${ESC}]8;;${uri}${BEL}${label}${ESC}]8;;${BEL}`;
}

/**
 * Resolves the file:// URL of the generated dashboard.html.
 * Uses url.pathToFileURL for correct percent-encoding of spaces/unicode (E7).
 * @returns {string} file:// URI string for dashboard.html.
 */
function dashboardFileUrl() {
  return pathToFileURL(DASHBOARD_HTML_FILE).href;
}

module.exports = {
  isOsc8Supported,
  formatOsc8Link,
  dashboardFileUrl
};