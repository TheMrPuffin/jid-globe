import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { openPinsDb } from '../src/db.js';

const migration = (file: string) => readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8');

describe('openPinsDb', () => {
  it('saves 9-character JIDs in a new database', () => {
    const db = openPinsDb(':memory:');
    db.prepare(`INSERT INTO pins (id, jid, lat, lng, placement) VALUES ('a', '5GB123TXA', 54, -2, 'country')`).run();
    expect(db.prepare('SELECT jid FROM pins').pluck().all()).toEqual(['5GB123TXA']);
  });

  it('upgrades a database from 1.0.1, keeping its 6-character entries', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'jid-db-'));
    const file = path.join(dir, 'pins.db');
    try {
      // A database as 1.0.1 left it: the first two migrations and an old-style entry.
      const old = new Database(file);
      old.exec(migration('001_create_pins.sql'));
      old.exec(migration('002_one_place_per_jid.sql'));
      old.pragma('user_version = 2');
      old.prepare(`INSERT INTO pins (id, jid, lat, lng, placement, city) VALUES ('old', '5GB12A', 53.8, -1.5, 'city', 'Leeds')`).run();
      old.close();

      const db = openPinsDb(file);
      db.prepare(`INSERT INTO pins (id, jid, lat, lng, placement) VALUES ('new', '5GB123TXA', 54, -2, 'country')`).run();
      expect(db.prepare('SELECT id, jid, city FROM pins ORDER BY rowid').all()).toEqual([
        { id: 'old', jid: '5GB12A', city: 'Leeds' },
        { id: 'new', jid: '5GB123TXA', city: null },
      ]);
      expect(() =>
        db.prepare(`INSERT INTO pins (id, jid, lat, lng, placement) VALUES ('bad', '5GB1234', 54, -2, 'country')`).run(),
      ).toThrow(/CHECK/);
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
