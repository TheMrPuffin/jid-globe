// Opens the pins database and applies any migrations that haven't run yet.
import Database from 'better-sqlite3';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export function openPinsDb(file: string): Database.Database {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}

// Migration files are numbered (001_..., 002_...). PRAGMA user_version stores
// how many have already been applied to this database file.
function migrate(db: Database.Database): void {
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  const applied = db.pragma('user_version', { simple: true }) as number;

  files.forEach((file, index) => {
    const version = index + 1;
    if (version <= applied) return;
    const sql = readFileSync(path.join(migrationsDir, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.pragma(`user_version = ${version}`);
    })();
  });
}
