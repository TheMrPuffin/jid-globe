import { describe, expect, it } from 'vitest';
import { parseJid } from './jid';

describe('parseJid', () => {
  it('decodes a full JID typed in lowercase', () => {
    const result = parseJid('5gb012axa');
    expect(result.valid).toBe(true);
    expect(result.jid).toBe('5GB012AXA');
    expect(result.region?.name).toBe('European');
    expect(result.country?.name).toBe('United Kingdom');
    expect(result.bingo).toBe('012');
    expect(result.suffix).toBe('AXA');
  });

  it('decodes as you type without complaining', () => {
    const result = parseJid('5GB');
    expect(result.valid).toBe(false);
    expect(result.error).toBeNull();
    expect(result.country?.code).toBe('GB');
    expect(result.bingo).toBeNull();
  });

  it('decodes the 9-character format', () => {
    expect(parseJid('5GB123TXA')).toMatchObject({ valid: true, error: null, bingo: '123', suffix: 'TXA' });
  });

  it('waits for all 3 digits and all 3 suffix characters', () => {
    expect(parseJid('5GB12')).toMatchObject({ valid: false, error: null, bingo: null });
    expect(parseJid('5GB123TX')).toMatchObject({ valid: false, error: null, bingo: '123', suffix: null });
    expect(parseJid('5GB12A').error).toMatch(/three-digit number/); // the old 6-character format
    expect(parseJid('5GB123T-A').error).toMatch(/letters or digits/);
  });

  it('accepts digits in the suffix', () => {
    expect(parseJid('3AU079X9A').valid).toBe(true);
  });

  it('rejects a region outside 1-7', () => {
    const result = parseJid('9ZZ012AXA');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/region number/);
  });

  it('rejects an unknown country code', () => {
    expect(parseJid('5ZZ012AXA').error).toMatch(/not a country code/);
  });

  it('rejects a region that does not match the country', () => {
    const result = parseJid('1GB012AXA');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/United Kingdom is not in the Africa region/);
    expect(result.error).toMatch(/Did you mean 5GB012AXA/);
    // The mistake is flagged as soon as the country is typed, without waiting for the rest.
    expect(parseJid('1GB').error).toMatch(/start with 5 \(European\)/);
  });

  it('accepts the right region for countries all over the world', () => {
    for (const jid of ['1KE001AXA', '2EG001AXA', '2SA001AXA', '3AU001AXA', '3JP001AXA', '5TR001AXA', '5IL001AXA', '6BR001AXA', '6US001AXA']) {
      expect(parseJid(jid).error, jid).toBeNull();
    }
    expect(parseJid('1EG001AXA').valid).toBe(false);
    expect(parseJid('3BR001AXA').valid).toBe(false);
  });

  it('accepts either digit where a country could be in two regions', () => {
    for (const jid of ['4UA001AXA', '5UA001AXA', '4KZ001AXA', '3KZ001AXA', '5GI001AXA', '6GF001AXA', '5GF001AXA']) {
      expect(parseJid(jid).valid, jid).toBe(true);
    }
  });

  it('accepts region 7 (special stations) with any country', () => {
    expect(parseJid('7GB012AXA').valid).toBe(true);
    expect(parseJid('7BR012AXA').valid).toBe(true);
  });

  it('spots amateur radio callsigns', () => {
    for (const callsign of ['G4ABC', '2E0ABC', 'PA3XYZ', 'M0ABC']) {
      const result = parseJid(callsign);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/callsign/);
    }
  });

  it('rejects input that is too long', () => {
    expect(parseJid('5GB123TXAB').error).toMatch(/9 characters/);
  });

  it('has no error for empty input', () => {
    expect(parseJid('  ')).toMatchObject({ valid: false, error: null });
  });
});
