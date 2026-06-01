#!/usr/bin/env node

import { runCliAsync } from './src/cli';
import { formatErrorMessage } from './src/utils/errors';

if (import.meta.main) {
  try {
    await runCliAsync(process.argv.slice(2));
  } catch (error) {
    console.error(formatErrorMessage(error));
    process.exitCode = 1;
  }
}
