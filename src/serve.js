/**
 * @fileoverview Local SSE dashboard server for the Antigravity Token & Cost
 * Tracker. Core http server bound to 127.0.0.1 ONLY (C6 — token usage data is
 * personal; never bind 0.0.0.0). Routes:
 *   GET /          -> dashboard.html (Cache-Control: no-store)
 *   GET /events    -> SSE stream; re-aggregates every 5s, pushes payload
 *   GET /data.json -> dashboard-data.json
 * Port auto-increments on EADDRINUSE (up to 10 tries); --port 0 = random (E5).
 * Zero dependencies (Node core: http, fs only).
 */

const http = require('http');
const fs = require('fs');
const {
  DASHBOARD_HTML_FILE,
  DASHBOARD_DATA_JSON,
  DASHBOARD_DEFAULT_PORT
} = require('./config');
const { syncSessions } = require('./cache-manager');
const { buildDashboardPayload } = require('./html-report');

const SSE_INTERVAL_MS = 5000;
const PORT_RETRY_MAX = 10;

/**
 * Starts the local dashboard server.
 * @param {object} [opts]
 * @param {number} [opts.port=8787] - Preferred port (0 = random).
 * @param {string} [opts.currency='usd'] - Currency code.
 * @param {string} [opts.lang] - UI language code.
 * @param {boolean} [opts.isFree=false] - Free quota mode.
 * @param {string} [opts.model] - Active model display id.
 * @param {string} [opts.modelName] - Model name used for pricing lookups.
 * @param {number} [opts.refreshSec] - HTML polling interval (embedded template).
 * @param {number} [opts.intervalMs=5000] - SSE push interval (test hook).
 * @returns {Promise<{ server: http.Server, port: number, url: string }>}
 */
function startDashboardServer(opts = {}) {
  const preferredPort = Number.isInteger(opts.port) ? opts.port : DASHBOARD_DEFAULT_PORT;
  const intervalMs = Number(opts.intervalMs) > 0 ? Number(opts.intervalMs) : SSE_INTERVAL_MS;

  const payloadOpts = {
    currency: opts.currency || 'usd',
    lang: opts.lang || 'en',
    isFree: Boolean(opts.isFree),
    model: opts.model || '',
    modelName: opts.modelName || null
  };

  /**
   * Re-aggregates the payload from a fresh incremental sync pass.
   * @returns {Promise<object>} DashboardPayload.
   */
  async function aggregate() {
    const syncResult = await syncSessions({ modelName: payloadOpts.modelName });
    return buildDashboardPayload(syncResult.sessions, {
      ...payloadOpts,
      parsedCount: syncResult.parsedCount,
      cachedCount: syncResult.cachedCount,
      elapsedMs: syncResult.elapsedMs
    });
  }

  /**
   * Attempts to listen on the given port, auto-incrementing on EADDRINUSE.
   * @param {number} port - Port to try.
   * @param {number} attempt - Current attempt index.
   * @returns {Promise<{ server: http.Server, port: number, url: string }>}
   */
  function tryListen(port, attempt) {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        // CORS for file:// pages (origin null) — E10; localhost-only server (C6)
        res.setHeader('Access-Control-Allow-Origin', '*');

        const urlPath = (req.url || '/').split('?')[0];

        if (urlPath === '/' || urlPath === '/index.html') {
          try {
            const html = fs.readFileSync(DASHBOARD_HTML_FILE, 'utf8');
            res.writeHead(200, {
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'no-store'
            });
            res.end(html);
          } catch (_err) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('dashboard.html not found. Run: agy-tokens --html');
          }
          return;
        }

        if (urlPath === '/events') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-store',
            'Connection': 'keep-alive'
          });
          res.write(': connected\n\n');

          let closed = false;
          const push = async () => {
            if (closed) return;
            try {
              const payload = await aggregate();
              res.write(`data: ${JSON.stringify(payload)}\n\n`);
            } catch (_err) {
              // Keep the stream alive on aggregation errors
            }
          };

          push();
          const timer = setInterval(push, intervalMs);
          req.on('close', () => {
            closed = true;
            clearInterval(timer);
          });
          return;
        }

        if (urlPath === '/data.json') {
          try {
            const json = fs.readFileSync(DASHBOARD_DATA_JSON, 'utf8');
            res.writeHead(200, {
              'Content-Type': 'application/json; charset=utf-8',
              'Cache-Control': 'no-store'
            });
            res.end(json);
          } catch (_err) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('{}');
          }
          return;
        }

        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
      });

      server.once('error', (err) => {
        if (err && err.code === 'EADDRINUSE' && attempt < PORT_RETRY_MAX && port !== 0) {
          server.close();
          resolve(tryListen(port + 1, attempt + 1));
        } else {
          reject(err);
        }
      });

      server.listen(port, '127.0.0.1', () => {
        const boundPort = server.address().port;
        resolve({
          server,
          port: boundPort,
          url: `http://127.0.0.1:${boundPort}/`
        });
      });
    });
  }

  return tryListen(preferredPort, 0);
}

/**
 * Gracefully closes the dashboard server (test hook / Ctrl+C).
 * @param {http.Server} server
 * @returns {Promise<void>}
 */
function stopDashboardServer(server) {
  return new Promise((resolve) => {
    if (!server) {
      resolve();
      return;
    }
    server.close(() => resolve());
  });
}

module.exports = {
  SSE_INTERVAL_MS,
  PORT_RETRY_MAX,
  startDashboardServer,
  stopDashboardServer
};