import { describe, expect, it } from 'vitest';
import { parseJid } from './jid';

describe('parseJid', () => {
  it('decodes a full JID typed in lowercase', () => {
    const result = parseJid('5gb12a');
    expect(result.valid).toBe(true);
    expect(result.jid).toBe('5GB12A');
    expect(result.region?.name).toBe('European');
    expect(result.country?.name).toBe('United Kingdom');
    expect(result.bingo).toBe('12');
    expect(result.suffix).toBe('A');
  });

  it('decodes as you type without complaining', () => {
    const result = parseJid('5GB');
    expect(result.valid).toBe(false);
    expect(result.error).toBeNull();
    expect(result.country?.code).toBe('GB');
    expect(result.bingo).toBeNull();
  });

  it('accepts a digit as the suffix', () => {
    expect(parseJid('3AU079').valid).toBe(true);
  });

  it('rejects a region outside 1-7', () => {
    const result = parseJid('9ZZ12A');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/region number/);
  });

  it('rejects an unknown country code', () => {
    expect(parseJid('5ZZ12A').error).toMatch(/not a country code/);
  });

  it('rejects a region that does not match the country', () => {
    const result = parseJid('1GB12A');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/United Kingdom is not in the Africa region/);
    expect(result.error).toMatch(/Did you mean 5GB12A/);
    // The mistake is flagged as soon as the country is typed, without waiting for the rest.
    expect(parseJid('1GB').error).toMatch(/start with 5 \(European\)/);
  });

  it('accepts the right region for countries all over the world', () => {
    for (const jid of ['1KE01A', '2EG01A', '2SA01A', '3AU01A', '3JP01A', '5TR01A', '5IL01A', '6BR01A', '6US01A']) {
      expect(parseJid(jid).error, jid).toBeNull();
    }
    expect(parseJid('1EG01A').valid).toBe(false);
    expect(parseJid('3BR01A').valid).toBe(false);
  });

  it('accepts either digit where a country could be in two regions', () => {
    for (const jid of ['4UA01A', '5UA01A', '4KZ01A', '3KZ01A', '5GI01A', '6GF01A', '5GF01A']) {
      expect(parseJid(jid).valid, jid).toBe(true);
    }
  });

  it('accepts region 7 (special stations) with any country', () => {
    expect(parseJid('7GB12A').valid).toBe(true);
    expect(parseJid('7BR12A').valid).toBe(true);
  });

  it('spots amateur radio callsigns', () => {
    for (const callsign of ['G4ABC', '2E0ABC', 'PA3XYZ', 'M0ABC']) {
      const result = parseJid(callsign);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/callsign/);
    }
  });

  it('rejects input that is too long', () => {
    expect(parseJid('5GB12AB').error).toMatch(/6 characters/);
  });

  it('has no error for empty input', () => {
    expect(parseJid('  ')).toMatchObject({ valid: false, error: null });
  });
});
