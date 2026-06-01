import { stderr } from 'node:process';
import { EOL } from 'node:os';

import { env } from './utils/env';

const Log = {
  debug(message: string): void {
    if (env.EXPO_GO_DEBUG) {
      stderr.write(message);
      stderr.write(EOL);
    }
  },

  log(message: string): void {
    stderr.write(message);
    stderr.write(EOL);
  },

  rawLog(message: string): void {
    stderr.write(message);
  },

  out(message: string): void {
    console.log(message);
  },
};

export default Log;
