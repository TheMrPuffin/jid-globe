// Pin validation and database queries.
import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { checkJid } from './jid.js';

export interface Pin {
  id: string;
  jid: string;
  lat: number;
  lng: number;
  placement: 'country' | 'city' | 'manual';
  city: string | null;
  note: string | null;
  added_by: string | null;
  created_at: string;
}

export type NewPin = Omit<Pin, 'id' | 'created_at'>;

/** Where a JID is: the part of a pin that every entry of the same JID shares. */
export type Place = Pick<Pin, 'lat' | 'lng' | 'placement' | 'city'>;

type Validation = { ok: true; pin: NewPin } | { ok: false; error: string };
type PlaceValidation = { ok: true; place: Place } | { ok: false; error: string };

const PLACEMENTS = ['country', 'city', 'manual'];
const MAX_NOTE = 120;
const MAX_CITY = 100;
const MAX_NICKNAME = 30;

/** Checks everything a client sends before it goes anywhere near the database. */
export function validateNewPin(body: unknown): Validation {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'Expected a JSON object.' };
  const input = body as Record<string, unknown>;

  const checked = checkJid(input.jid);
  if (!checked.ok) return checked;
  const { jid } = checked;

  const placed = validatePlace(input);
  if (!placed.ok) return placed;

  const note = optionalText(input.note, MAX_NOTE);
  const addedBy = optionalText(input.added_by, MAX_NICKNAME);
  if (note === undefined) return { ok: false, error: `Note must be at most ${MAX_NOTE} characters.` };
  if (addedBy === undefined) return { ok: false, error: `Nickname must be at most ${MAX_NICKNAME} characters.` };

  return { ok: true, pin: { jid, ...placed.place, note, added_by: addedBy } };
}

/** Checks the location part of a request (used when adding a pin and when moving a JID). */
export function validatePlace(body: unknown): PlaceValidation {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'Expected a JSON object.' };
  const input = body as Record<string, unknown>;

  const { lat, lng } = input;
  if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    return { ok: false, error: 'Latitude must be a number between -90 and 90.' };
  }
  if (typeof lng !== 'number' || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return { ok: false, error: 'Longitude must be a number between -180 and 180.' };
  }

  if (typeof input.placement !== 'string' || !PLACEMENTS.includes(input.placement)) {
    return { ok: false, error: 'Placement must be country, city or manual.' };
  }

  const city = optionalText(input.city, MAX_CITY);
  if (city === undefined) return { ok: false, error: `City must be at most ${MAX_CITY} characters.` };

  return { ok: true, place: { lat, lng, placement: input.placement as Pin['placement'], city } };
}

// Returns the trimmed text, null when empty/missing, or undefined when invalid.
function optionalText(value: unknown, maxLength: number): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (text.length > maxLength) return undefined;
  return text === '' ? null : text;
}

export function listPins(db: Database.Database): Pin[] {
  return db.prepare('SELECT * FROM pins ORDER BY created_at DESC, rowid DESC').all() as Pin[];
}

/**
 * Saves an entry. A JID is one station, so it has one place: if this JID has been
 * entered before, the new entry takes the place it already has, whatever was sent.
 */
export function insertPin(db: Database.Database, pin: NewPin): Pin {
  const id = randomUUID();
  return db.transaction(() => {
    const existing = db
      .prepare('SELECT lat, lng, placement, city FROM pins WHERE jid = ? LIMIT 1')
      .get(pin.jid) as Place | undefined;
    db.prepare(
      `INSERT INTO pins (id, jid, lat, lng, placement, city, note, added_by)
       VALUES (@id, @jid, @lat, @lng, @placement, @city, @note, @added_by)`,
    ).run({ id, ...pin, ...existing });
    return db.prepare('SELECT * FROM pins WHERE id = ?').get(id) as Pin;
  })();
}

/** Moves every entry of a JID to a new place. Returns the entries that were moved. */
export function moveJid(db: Database.Database, jid: string, place: Place): Pin[] {
  db.prepare(
    'UPDATE pins SET lat = @lat, lng = @lng, placement = @placement, city = @city WHERE jid = @jid',
  ).run({ jid, ...place });
  return db.prepare('SELECT * FROM pins WHERE jid = ? ORDER BY created_at DESC, rowid DESC').all(jid) as Pin[];
}

/** Returns true if a pin was deleted. */
export function deletePin(db: Database.Database, id: string): boolean {
  return db.prepare('DELETE FROM pins WHERE id = ?').run(id).changes > 0;
}
