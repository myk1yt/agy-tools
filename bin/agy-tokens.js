#!/usr/bin/env node

/**
 * @fileoverview Executable CLI binary for Antigravity Token & Cost Tracker.
 */

const { runCli } = require('../src/index');

runCli().catch(err => {
  console.error('\x1b[31m[Antigravity Token Tracker Error]\x1b[0m', err.message || err);
  process.exit(1);
});
