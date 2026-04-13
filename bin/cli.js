#!/usr/bin/env node
// create-llm-wiki CLI entry point
// Zero-dependency, Node 18+ (uses util.parseArgs, fetch, fs/promises)

import { parseArgs } from 'node:util';
import { run } from '../src/index.js';

const { values, positionals } = parseArgs({
  options: {
    retrofit: { type: 'boolean', default: false },
    'vault-dir': { type: 'string', default: 'vault' },
    'vault-name': { type: 'string' },
    'scripts-dir': { type: 'string', default: 'scripts' },
    domain: { type: 'string', default: 'generic' },
    'commit-policy': { type: 'string', default: 'auto' },
    'skip-obsidian-check': { type: 'boolean', default: false },
    'install-obsidian': { type: 'boolean', default: false },
    'skip-plugins': { type: 'boolean', default: false },
    lang: { type: 'string' },
    yes: { type: 'boolean', short: 'y', default: false },
    help: { type: 'boolean', short: 'h', default: false },
    version: { type: 'boolean', short: 'v', default: false },
  },
  allowPositionals: true,
  strict: false,
});

try {
  await run({ values, positionals });
} catch (err) {
  console.error(`\nerror: ${err.message}`);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
}
