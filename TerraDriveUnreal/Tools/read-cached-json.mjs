import fs from 'node:fs';

export function readCachedJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    if (!(error instanceof SyntaxError)) throw error;
    console.warn(`Ignoring incomplete JSON in ${file}.`);
    return undefined;
  }
}
