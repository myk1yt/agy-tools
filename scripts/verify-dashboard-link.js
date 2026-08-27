/**
 * One-shot verification harness for the VS Code dashboard-link fix.
 * Runs the CLI badge in both terminal modes, checks link targets,
 * verifies the auto-started server responds 200, and measures timing.
 * Zero dependencies. Usage: node scripts/verify-dashboard-link.js
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const REPO = path.join(__dirname, '..');
const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name} | ${detail}`);
}

function runBadge(envOverrides) {
  const env = { ...process.env, ...envOverrides };
  delete env.AGY_TOKENS_LINK_MODE;
  if (!('TERM_PROGRAM' in envOverrides)) delete env.TERM_PROGRAM;
  const out = execFileSync(process.execPath, [path.join(REPO, 'bin', 'agy-tokens.js'), '--hook', '--raw'], {
    cwd: REPO,
    env,
    encoding: 'utf8',
    timeout: 30000,
    input: ''
  });
  return out;
}

async function fetchStatus(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body, cacheControl: res.headers['cache-control'] }));
    });
    req.on('error', (err) => resolve({ status: 0, body: String(err.message) }));
    req.setTimeout(5000, () => { req.destroy(); resolve({ status: 0, body: 'timeout' }); });
  });
}

async function main() {
  // Gate 2: VS Code terminal → http link
  const vscodeOut = runBadge({ TERM_PROGRAM: 'vscode' });
  record(
    'G2: badge under TERM_PROGRAM=vscode contains ]8;;http://127.0.0.1:8787/',
    vscodeOut.includes(']8;;http://127.0.0.1:8787/'),
    vscodeOut.replace(/\x1b/g, '<ESC>').trim().slice(0, 220)
  );

  // Gate 3: non-VS Code → file:// link (unchanged behavior)
  const plainOut = runBadge({});
  record(
    'G3: badge without TERM_PROGRAM contains ]8;;file:/// and no http link',
    plainOut.includes(']8;;file:///') && !plainOut.includes(']8;;http://'),
    plainOut.replace(/\x1b/g, '<ESC>').trim().slice(0, 220)
  );

  // Gate 4: auto-started server responds 200 with dashboard HTML
  const root = await fetchStatus('http://127.0.0.1:8787/');
  record(
    'G4a: http://127.0.0.1:8787/ responds 200 with dashboard HTML',
    root.status === 200 && root.body.includes('<!DOCTYPE html>'),
    `status=${root.status} bytes=${root.body.length} cache-control=${root.cacheControl}`
  );

  const portFile = path.join(os.homedir(), '.gemini', 'antigravity-dashboard', 'dashboard-server.json');
  let portFileOk = false;
  let portFileDetail = 'missing';
  try {
    const parsed = JSON.parse(fs.readFileSync(portFile, 'utf8'));
    portFileOk = Number.isInteger(parsed.port) && Number.isInteger(parsed.pid) && typeof parsed.startedAt === 'string';
    portFileDetail = JSON.stringify(parsed);
  } catch (err) {
    portFileDetail = String(err.message);
  }
  record('G4b: dashboard-server.json exists with valid JSON', portFileOk, portFileDetail);

  // Gate 5: timing with server already running (steady-state statusline path)
  const t0 = Date.now();
  runBadge({ TERM_PROGRAM: 'vscode' });
  const elapsed = Date.now() - t0;
  record(
    'G5: steady-state --hook --raw wall time (includes node startup)',
    elapsed < 2000,
    `${elapsed}ms (budget: statusline script work <20ms after node startup; wall includes node boot + 50ms stdin timeout)`
  );

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} gates passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error('Harness error:', err);
  process.exit(1);
});