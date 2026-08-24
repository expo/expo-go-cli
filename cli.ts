#!/usr/bin/env node

import { runCliAsync } from './src/cli';
import { formatErrorMessage } from './src/utils/errors';

const args = process.argv.slice(2);
try {
  await runCliAsync(args);
} catch (error) {
  const message = formatErrorMessage(error);
  if (args.includes('--json')) {
    console.log(JSON.stringify({ error: message }));
  } else {
    console.error(message);
  }
  process.exitCode = 1;
}
