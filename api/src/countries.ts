// Country names and Scout regions, used to check a JID's first digit suits its country.
import { createRequire } from 'node:module';
import { scoutRegionsFor } from './scout-regions.js';

// The parts of the world-countries data used here. It is read straight from the
// package's JSON file, which is the simplest way to load it on the server.
interface CountryData {
  cca2: string; // ISO alpha-2 code, e.g. "GB"
  name: { common: string };
  region: string;
  subregion: string;
  independent?: boolean;
}
const worldCountries: CountryData[] = createRequire(import.meta.url)('world-countries/countries.json');

export interface Country {
  name: string;
  /** The region digits a JID for this country may start with. Empty means any. */
  scoutRegions: string[];
}

const byCode = new Map<string, Country>();
for (const c of worldCountries) {
  byCode.set(c.cca2, {
    name: c.name.common,
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
