import { countryFor } from './countries.js';

// A JID is 9 characters: region digit, 2-letter country, 3-digit number, 3-character suffix.
const JID_PATTERN = /^[1-7][A-Z]{2}[0-9]{3}[A-Z0-9]{3}$/;

/** Uppercases and trims the input, returning the JID or null if it isn't one. */
export function normalizeJid(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const jid = input.trim().toUpperCase();
  return JID_PATTERN.test(jid) ? jid : null;
}

const SPECIAL_REGION = '7'; // special stations: allowed with any country

type JidCheck = { ok: true; jid: string } | { ok: false; error: string };

/**
 * The full check used before saving: the right shape, a real country, and a first
 * digit that suits that country (the UK is in region 5, so "1GB123TXA" is refused).
 * The web page makes the same checks as you type; this is the backstop.
 */
export function checkJid(input: unknown): JidCheck {
  const jid = normalizeJid(input);
  if (!jid) return { ok: false, error: 'That is not a valid JID. A JID looks like 5GB123TXA.' };

  const region = jid[0];
  const countryCode = jid.slice(1, 3);
  const country = countryFor(countryCode);
  if (!country) return { ok: false, error: `"${countryCode}" is not a country code we know.` };

  const allowed = country.scoutRegions;
  if (region !== SPECIAL_REGION && allowed.length > 0 && !allowed.includes(region)) {
    return {
      ok: false,
      error: `${country.name} is not in region ${region}. Its JIDs start with ${allowed.join(' or ')}.`,
    };
  }
  return { ok: true, jid };
}
