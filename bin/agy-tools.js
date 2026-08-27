#!/usr/bin/env node

/**
 * @fileoverview Unified CLI dispatcher and toolkit gateway for Antigravity developer tools.
 * Routes subcommands (e.g., `tokens`, `usage`) to their respective modules,
 * serving as an extensible foundation for future tooling.
 */

const { runCli, formatter, i18n } = require('../src/index');
const pkg = require('../package.json');

/**
 * Prints the main toolkit overview help message.
 */
function printToolkitHelp() {
  console.log(`
\x1b[1m\x1b[36mAntigravity CLI Developer Toolkit (agy-tools)\x1b[0m - v${pkg.version}
\x1b[90mModular, zero-dependency tools for Antigravity & LLM developers\x1b[0m

\x1b[1mUsage:\x1b[0m
  agy-tools <command> [options]
  agy-tokens [options]

\x1b[1mAvailable Commands:\x1b[0m
  \x1b[33mtokens, usage\x1b[0m       Track token consumption, cache hit rate %, and API costs
  \x1b[33mhelp\x1b[0m                Show this help screen
  \x1b[33mversion\x1b[0m             Display toolkit version

\x1b[1mExamples:\x1b[0m
  $ agy-tools tokens --today
  $ agy-tools tokens --7d --currency krw
  $ agy-tools tokens --hook
  $ agy-tokens --30d

For command-specific help:
  $ agy-tools tokens --help
`);
}

async function main() {
  const args = process.argv.slice(2);
  const firstArg = (args[0] || '').toLowerCase();

  if (firstArg === 'help' && args.length === 1) {
    printToolkitHelp();
    return;
  }

  if (firstArg === 'version' && args.length === 1) {
    console.log(`agy-tools v${pkg.version}`);
    return;
  }

  if (firstArg === 'tokens' || firstArg === 'usage') {
    // Strip the subcommand name and pass the rest to the token tracker CLI
    const tokenArgv = [process.argv[0], process.argv[1], ...args.slice(1)];
    await runCli(tokenArgv);
    return;
  }

  // If no subcommand is specified or flags are passed directly, default to tokens tracker
  await runCli(process.argv);
}

main().catch(err => {
  console.error('\x1b[31m[Antigravity Tools Error]\x1b[0m', err.message || err);
  process.exit(1);
});
