// Reads settings from environment variables (and from .env when running locally).
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(here, '..');
const repoRoot = path.resolve(apiRoot, '..');

// In Docker the variables come from docker-compose, so there is no .env file to load.
const envFile = path.join(repoRoot, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

// Reads an on/off setting. "on", "true", "yes" and "1" all mean on; anything else is off.
function isOn(value: string | undefined): boolean {
  return /^(on|true|yes|1)$/i.test((value ?? '').trim());
}

// The version number is the one in api/package.json (`make version` keeps it in step
// with the others).
const { version } = JSON.parse(readFileSync(path.join(apiRoot, 'package.json'), 'utf8')) as { version: string };

export const config = {
  version,
  // Which build this is: the short git commit a published image was made from. An image
  // built from source, or `npm run dev`, has none and says "dev".
  build: process.env.BUILD_COMMIT?.trim() || 'dev',
  port: Number(process.env.PORT ?? 8080),
  adminPasscode: process.env.ADMIN_PASSCODE ?? '',
  // When on, a device must be unlocked with SUBMIT_PASSCODE before it can add JIDs.
  submitLock: isOn(process.env.SUBMIT_LOCK),
  submitPasscode: process.env.SUBMIT_PASSCODE ?? '',
  pinsDbPath: process.env.DB_PATH ?? path.join(repoRoot, 'data', 'jid-globe.db'),
  citiesDbPath: process.env.CITIES_DB_PATH ?? path.join(apiRoot, 'data', 'cities.db'),
  webDist: process.env.WEB_DIST ?? path.join(repoRoot, 'web', 'dist'),
};
