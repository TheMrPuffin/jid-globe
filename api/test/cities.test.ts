import type Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildCitiesDb, citiesNear, normalizeSearch, openCitiesDb, searchCities } from '../src/cities.js';

const sample = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'cities-sample.txt');
let dir: string;
let db: Database.Database;

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'jid-cities-'));
  const file = path.join(dir, 'cities.db');
  expect(buildCitiesDb(sample, file)).toBe(6);
  db = openCitiesDb(file);
});

afterAll(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('normalizeSearch', () => {
  it('lowercases and strips accents', () => {
    expect(normalizeSearch('  Zürich ')).toBe('zurich');
    expect(normalizeSearch('São Paulo')).toBe('sao paulo');
  });
});

describe('searchCities', () => {
  it('finds a city by prefix', () => {
    expect(searchCities(db, 'GB', 'manch').map((c) => c.name)).toEqual(['Manchester']);
  });

  it('leaves out city districts', () => {
    expect(searchCities(db, 'GB', 'manchester c')).toEqual([]);
  });

  it('orders matches by population', () => {
    expect(searchCities(db, 'GB', 'man').map((c) => c.name)).toEqual(['Manchester', 'Mansfield']);
  });

  it('only returns cities in the given country', () => {
    const cities = searchCities(db, 'us', 'manch');
    expect(cities).toHaveLength(1);
    expect(cities[0].country_code).toBe('US');
  });

  it('matches an accented city with or without the accent', () => {
    expect(searchCities(db, 'CH', 'zur')[0].name).toBe('Zürich');
    expect(searchCities(db, 'CH', 'Zür')[0].name).toBe('Zürich');
    expect(searchCities(db, 'CH', 'zuer')[0].name).toBe('Zürich');
  });

  it('matches letters that have no accent to strip, via the ASCII name', () => {
    expect(searchCities(db, 'PL', 'lodz')[0].name).toBe('Łódź');
  });

  it('searches every country when none is given', () => {
    const cities = searchCities(db, null, 'manchester');
    expect(cities.map((c) => c.country_code)).toEqual(['GB', 'US']);
  });

  it('treats LIKE wildcards as plain text', () => {
    expect(searchCities(db, 'GB', '%')).toEqual([]);
    expect(searchCities(db, 'GB', '')).toEqual([]);
  });
});

describe('citiesNear', () => {
  it('returns nearby cities, biggest first', () => {
    expect(citiesNear(db, 47.3, 8.5, 1).map((c) => c.name)).toEqual(['Zürich', 'Zug']);
  });

  it('leaves out cities that are further away', () => {
    expect(citiesNear(db, 47.3, 8.5, 0.05)).toEqual([]);
    expect(citiesNear(db, 53.4, -2.0, 1).map((c) => c.name)).toEqual(['Manchester', 'Mansfield']);
  });
});
