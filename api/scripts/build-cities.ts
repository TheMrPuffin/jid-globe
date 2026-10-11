// Usage: tsx scripts/build-cities.ts [--if-missing] [input.txt] [output.db]
// Builds data/cities.db from data/cities5000.txt (run at Docker build time).
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCitiesDb } from '../src/cities.js';

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const args = process.argv.slice(2);
const ifMissing = args.includes('--if-missing');
const [input = path.join(dataDir, 'cities5000.txt'), output = path.join(dataDir, 'cities.db')] =
  args.filter((arg) => !arg.startsWith('--'));

if (ifMissing && existsSync(output)) {
  console.log(`cities: ${output} already exists, skipping`);
} else {
  const count = buildCitiesDb(input, output);
  console.log(`cities: wrote ${count} cities to ${output}`);
}
