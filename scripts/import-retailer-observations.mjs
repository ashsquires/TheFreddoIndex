import { readFile, writeFile, rename } from 'node:fs/promises';
import { mergeObservations } from '../retailer-data.js';

const inputPath = process.argv[2];
if (!inputPath || inputPath.startsWith('--')) throw new Error('Usage: npm run prices:import -- /path/to/observations.json [--write]');
const path = new URL('../data/retailer-prices.json', import.meta.url);
const snapshot = JSON.parse(await readFile(path, 'utf8'));
const input = JSON.parse(await readFile(inputPath, 'utf8'));
const merged = mergeObservations(snapshot, input.observations);
const count = merged.observations.length - snapshot.observations.length;
if (process.argv.includes('--write')) {
  const temp = new URL('../data/retailer-prices.json.tmp', import.meta.url);
  await writeFile(temp, `${JSON.stringify(merged, null, 2)}\n`);
  await rename(temp, path);
  console.log(`Saved ${count} new observations. Existing history preserved. Rebuild to refresh static HTML.`);
} else {
  console.log(`Validated ${count} new observations; no files changed. Add --write after reviewing source evidence.`);
}
