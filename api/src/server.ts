// Entry point: opens the databases and starts listening.
import { existsSync } from 'node:fs';
import { buildApp } from './app.js';
import { openCitiesDb } from './cities.js';
import { config } from './config.js';
import { openPinsDb } from './db.js';

const pinsDb = openPinsDb(config.pinsDbPath);
const citiesDb = existsSync(config.citiesDbPath) ? openCitiesDb(config.citiesDbPath) : null;

const app = await buildApp({
  pinsDb,
  citiesDb,
  adminPasscode: config.adminPasscode,
  submitLock: config.submitLock,
  submitPasscode: config.submitPasscode,
  jidPlaceholder: config.jidPlaceholder,
  webDist: config.webDist,
  logger: true,
  version: config.version,
  build: config.build,
});

app.log.info(`JID Globe ${config.version} (build ${config.build})`);

if (!citiesDb) app.log.warn(`No city data at ${config.citiesDbPath}. Run "npm run cities -w api".`);
if (!config.adminPasscode) app.log.warn('ADMIN_PASSCODE is not set, so pins cannot be deleted.');
if (config.submitLock && !config.submitPasscode) {
  app.log.warn('SUBMIT_LOCK is on but SUBMIT_PASSCODE is not set, so only admin-unlocked devices can add JIDs.');
}
app.log.info(`Adding JIDs is ${config.submitLock ? 'LOCKED: devices must be unlocked with SUBMIT_PASSCODE' : 'open to anyone who can reach this page'}.`);

// Shut down cleanly on Ctrl+C or `docker compose down`.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.close();
    pinsDb.close();
    process.exit(0);
  });
}

// 0.0.0.0 makes the app reachable from phones on the same Wi-Fi, not just this machine.
await app.listen({ port: config.port, host: '0.0.0.0' });
