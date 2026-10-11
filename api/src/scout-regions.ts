// Which Scout (WOSM) region each country belongs to, so a JID like "1GB12A" can be
// caught: the UK is in the European region, so its JIDs start with 5.
//
// There is no official list bundled with the app, so this is worked out from each
// country's geography plus the exceptions below. Where a country could reasonably be
// in more than one region, every possibility is accepted: it is better to let an odd
// typo through than to refuse a real JID in the middle of the event.
// If a real JID is ever refused, add its country to the right list here.
//
// This file exists twice, in web/src and in api/src, because the web page and the
// server both need it. Keep the two copies identical (an API test checks they are).

/** The facts about a country this needs (as provided by the world-countries package). */
export interface CountryFacts {
  code: string; // ISO alpha-2, e.g. "GB"
  continent: string; // "Africa", "Americas", "Asia", "Europe", "Oceania" or "Antarctic"
  part: string; // e.g. "Western Asia", "Central Asia"
  independent: boolean;
}

const AFRICA = '1';
const ARAB = '2';
const ASIA_PACIFIC = '3';
const EURASIA = '4';
const EUROPEAN = '5';
const INTERAMERICAN = '6';

// Arabic-speaking countries are in the Arab region wherever they are on the map.
const ARAB_COUNTRIES = 'DZ EG LY MA TN SD MR BH IQ JO KW LB OM PS QA SA SY AE YE'.split(' ');

// Arab League members in East Africa: accepted as either Africa or Arab.
const AFRICA_OR_ARAB = 'SO DJ KM EH'.split(' ');

// In Asia on the map, but in the European Scout region.
const EUROPEAN_IN_ASIA = 'IL CY TR'.split(' ');

// The Eurasia region was wound up in 2023 and its countries joined their neighbours.
// JIDs for them may use the old digit or the new one, so both are accepted.
const EURASIA_OR_EUROPEAN = 'AM AZ GE MD UA BY RU'.split(' ');
const EURASIA_OR_ASIA_PACIFIC = 'KZ KG TJ TM UZ'.split(' ');

const BY_CONTINENT: Record<string, string> = {
  Africa: AFRICA,
  Americas: INTERAMERICAN,
  Asia: ASIA_PACIFIC,
  Europe: EUROPEAN,
  Oceania: ASIA_PACIFIC,
};

/**
 * The region digits a JID for this country may start with (not counting 7, the
 * "special" region, which is allowed for every country). An empty list means
 * "no idea" (Antarctica), and then anything is accepted.
 */
export function scoutRegionsFor(country: CountryFacts): string[] {
  const { code } = country;
  if (ARAB_COUNTRIES.includes(code)) return [ARAB];
  if (AFRICA_OR_ARAB.includes(code)) return [AFRICA, ARAB];
  if (EUROPEAN_IN_ASIA.includes(code)) return [EUROPEAN];
  if (EURASIA_OR_EUROPEAN.includes(code)) return [EURASIA, EUROPEAN];
  if (EURASIA_OR_ASIA_PACIFIC.includes(code)) return [EURASIA, ASIA_PACIFIC];

  const local = BY_CONTINENT[country.continent];
  if (!local) return [];
  // Overseas territories (Gibraltar, Greenland, French Guiana...) often belong to the Scout
  // association of the country that runs them, most of which are European. Accept both.
  if (!country.independent && local !== EUROPEAN) return [local, EUROPEAN];
  return [local];
}
