// Country names and centre points, bundled from the world-countries package.
import worldCountries from 'world-countries';
import { scoutRegionsFor } from './scout-regions';

export interface Country {
  code: string; // ISO alpha-2, e.g. "GB"
  numericCode: string; // ISO numeric, e.g. "826" (what the map polygons use)
  name: string;
  lat: number;
  lng: number;
  /** The region digits a JID for this country may start with. Empty means any. */
  scoutRegions: string[];
}

const byCode = new Map<string, Country>();
for (const c of worldCountries) {
  byCode.set(c.cca2, {
    code: c.cca2,
    numericCode: c.ccn3,
    name: c.name.common,
    lat: c.latlng[0],
    lng: c.latlng[1],
    scoutRegions: scoutRegionsFor({
      code: c.cca2,
      continent: c.region,
      part: c.subregion,
      independent: c.independent ?? false,
    }),
  });
}

export function countryFor(code: string): Country | undefined {
  return byCode.get(code.toUpperCase());
}

// Lowercase without accents, so "cote" finds "Côte d'Ivoire".
function plain(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

/** Countries whose name starts with `query` (or has a word starting with it). */
export function searchCountries(query: string, limit: number): Country[] {
  const wanted = plain(query);
  if (!wanted) return [];
  const all = [...byCode.values()];
  const startsWith = all.filter((country) => plain(country.name).startsWith(wanted));
  const wordStartsWith = all.filter(
    (country) => !startsWith.includes(country) && plain(country.name).includes(' ' + wanted),
  );
  return [...startsWith, ...wordStartsWith].slice(0, limit);
}
