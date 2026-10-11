// City autocomplete: builds cities.db from the GeoNames file and searches it.
import Database from 'better-sqlite3';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

export interface City {
  geonameid: number;
  name: string;
  country_code: string;
  lat: number;
  lng: number;
  population: number;
}

/** Lowercases and strips accents, so "Zürich" and "zurich" compare equal. */
export function normalizeSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

// Column positions in the tab-separated GeoNames file.
const COL = { geonameid: 0, name: 1, asciiname: 2, lat: 4, lng: 5, featureCode: 7, country: 8, population: 14 };

/** Turns a GeoNames cities file into a small SQLite database. Returns the row count. */
export function buildCitiesDb(inputFile: string, outputFile: string): number {
  mkdirSync(path.dirname(outputFile), { recursive: true });
  rmSync(outputFile, { force: true });

  const db = new Database(outputFile);
  db.exec(`
    CREATE TABLE cities (
      geonameid    INTEGER PRIMARY KEY,
      name         TEXT NOT NULL,
      country_code TEXT NOT NULL,
      lat          REAL NOT NULL,
      lng          REAL NOT NULL,
      population   INTEGER NOT NULL,
      search       TEXT NOT NULL,
      search_alt   TEXT
    );
  `);

  const insert = db.prepare('INSERT INTO cities VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const lines = readFileSync(inputFile, 'utf8').split('\n');
  let count = 0;

  db.transaction(() => {
    for (const line of lines) {
      const cols = line.split('\t');
      if (cols.length < 15) continue;
      // PPLX rows are districts of a city ("Manchester City Centre"), which only clutter the list.
      if (cols[COL.featureCode] === 'PPLX') continue;
      // `search` is the real name without accents ("zurich"). GeoNames' own ASCII
      // spelling sometimes differs ("zuerich", "lodz"), so keep it as a second key.
      const search = normalizeSearch(cols[COL.name]);
      const ascii = normalizeSearch(cols[COL.asciiname]);
      insert.run(
        Number(cols[COL.geonameid]),
        cols[COL.name],
        cols[COL.country],
        Number(cols[COL.lat]),
        Number(cols[COL.lng]),
        Number(cols[COL.population]) || 0,
        search,
        ascii && ascii !== search ? ascii : null,
      );
      count++;
    }
  })();

  db.exec('CREATE INDEX cities_country_search ON cities (country_code, search)');
  db.close();
  return count;
}

export function openCitiesDb(file: string): Database.Database {
  return new Database(file, { readonly: true, fileMustExist: true });
}

/** The biggest cities within `radius` degrees of a point (used for labels on the globe). */
export function citiesNear(db: Database.Database, lat: number, lng: number, radius: number, limit = 30): City[] {
  // A degree of longitude gets narrower towards the poles, so widen the search there.
  const lngRadius = Math.min(180, radius / Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
  return db
    .prepare(
      `SELECT geonameid, name, country_code, lat, lng, population
         FROM cities
        WHERE lat BETWEEN ? AND ?
          AND (abs(lng - ?) <= ? OR abs(lng - ?) >= ?) -- second part wraps around the date line
        ORDER BY population DESC
        LIMIT ?`,
    )
    .all(lat - radius, lat + radius, lng, lngRadius, lng, 360 - lngRadius, limit) as City[];
}

/**
 * Cities whose name starts with `query`, biggest first.
 * Pass a country code to search one country, or null to search the whole world.
 */
export function searchCities(db: Database.Database, country: string | null, query: string, limit = 8): City[] {
  const prefix = normalizeSearch(query);
  if (!prefix) return [];
  // Escape LIKE wildcards so typing "%" doesn't match everything.
  const pattern = prefix.replace(/[\\%_]/g, '\\$&') + '%';
  const code = country ? country.toUpperCase() : null;
  return db
    .prepare(
      `SELECT geonameid, name, country_code, lat, lng, population
         FROM cities
        WHERE (? IS NULL OR country_code = ?)
          AND (search LIKE ? ESCAPE '\\' OR search_alt LIKE ? ESCAPE '\\')
        ORDER BY population DESC
        LIMIT ?`,
    )
    .all(code, code, pattern, pattern, limit) as City[];
}
