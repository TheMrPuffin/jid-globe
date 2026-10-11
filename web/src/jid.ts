// Decodes a JID as it is typed, e.g. "5GB12A" -> European / United Kingdom / 12 / A.
import { countryFor, type Country } from './countries';
import { regionFor, type Region } from './regions';

export const JID_EXAMPLE = '5GB12A';
const SPECIAL_REGION = '7';

export interface JidResult {
  /** The input, trimmed and uppercased. */
  jid: string;
  /** True only for a complete, correct JID. */
  valid: boolean;
  /** A friendly message when something typed so far is wrong, otherwise null. */
  error: string | null;
  // Whatever could be decoded so far; null for the parts not typed yet.
  region: Region | null;
  country: Country | null;
  bingo: string | null;
  suffix: string | null;
}

// Callsigns look like G4ABC, 2E0XYZ or PA3ABC: a short prefix, a digit, then letters.
const CALLSIGN = /^[A-Z0-9]{1,2}[0-9][A-Z]{1,4}$/;

export function parseJid(input: string): JidResult {
  const jid = input.trim().toUpperCase();
  const result: JidResult = { jid, valid: false, error: null, region: null, country: null, bingo: null, suffix: null };

  result.error = decode(jid, result);
  if (result.error && CALLSIGN.test(jid)) {
    result.error = `That looks like an amateur radio callsign, not a JID. A JID looks like ${JID_EXAMPLE}.`;
  }
  result.valid = result.error === null && jid.length === 6;
  return result;
}

// Checks the first digit suits the country, e.g. the UK is in the European region (5),
// so "1GB12A" must be a typo. Region 7 is for special stations and can be any country.
function regionMismatch(jid: string, region: Region, country: Country): string | null {
  const allowed = country.scoutRegions;
  if (region.digit === SPECIAL_REGION || allowed.length === 0 || allowed.includes(region.digit)) return null;

  const names = allowed.map((digit) => `${digit} (${regionFor(digit)!.name})`).join(' or ');
  const suggestion = allowed[0] + jid.slice(1) + (jid.length < 6 ? '…' : '');
  return `${country.name} is not in the ${region.name} region. Its JIDs start with ${names}. Did you mean ${suggestion}?`;
}

// Fills in the decoded parts and returns an error message, or null if all is well so far.
function decode(jid: string, result: JidResult): string | null {
  if (jid.length === 0) return null;

  result.region = regionFor(jid[0]) ?? null;
  if (!result.region) return 'A JID starts with a region number from 1 to 7.';

  const countryCode = jid.slice(1, 3);
  if (!/^[A-Z]*$/.test(countryCode)) return 'Characters 2 and 3 are a two-letter country code.';
  if (countryCode.length === 2) {
    result.country = countryFor(countryCode) ?? null;
    if (!result.country) return `"${countryCode}" is not a country code we know.`;
    const wrongRegion = regionMismatch(jid, result.region, result.country);
    if (wrongRegion) return wrongRegion;
  }

  const bingo = jid.slice(3, 5);
  if (!/^[0-9]*$/.test(bingo)) return 'Characters 4 and 5 are a two-digit number.';
  if (bingo.length === 2) result.bingo = bingo;

  const suffix = jid.slice(5, 6);
  if (!/^[A-Z0-9]?$/.test(suffix)) return 'The last character is a letter or a digit.';
  if (suffix) result.suffix = suffix;

  if (jid.length > 6) return 'A JID is exactly 6 characters long.';
  return null;
}
