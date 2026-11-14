import path from 'node:path';
import {verifySourceExport} from './source-export-state.mjs';

try {
  console.log(verifySourceExport(path.resolve(import.meta.dirname, '..')));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
