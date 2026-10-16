import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { checkJid, normalizeJid } from '../src/jid.js';

describe('normalizeJid', () => {
  it('accepts a valid JID and uppercases it', () => {
    expect(normalizeJid('5gb123txa')).toBe('5GB123TXA');
    expect(normalizeJid('5gb012axa')).toBe('5GB012AXA');
    expect(normalizeJid(' 3AU0079XA ')).toBe('3AU0079XA');
  });

  it('rejects a region digit outside 1-7', () => {
    expect(normalizeJid('9ZZ012AXA')).toBeNull();
    expect(normalizeJid('0GB012AXA')).toBeNull();
  });

  it('rejects amateur radio callsigns', () => {
    expect(normalizeJid('G4ABC')).toBeNull();
    expect(normalizeJid('2E0ABC')).toBeNull();
  });

  it('rejects the wrong length and non-strings', () => {
    expect(normalizeJid('5GB123TX')).toBeNull();
    expect(normalizeJid('5GB12A')).toBeNull(); // the old 6-character format
    expect(normalizeJid('5GB123TXAB')).toBeNull();
    expect(normalizeJid(512)).toBeNull();
  });
});

describe('checkJid', () => {
  it('accepts a JID whose first digit suits its country', () => {
    expect(checkJid('5gb012axa')).toEqual({ ok: true, jid: '5GB012AXA' });
    for (const jid of ['1KE001AXA', '2EG001AXA', '3AU001AXA', '6BR001AXA', '4UA001AXA', '5UA001AXA', '7GB012AXA']) {
      expect(checkJid(jid).ok, jid).toBe(true);
    }
  });

  it('refuses a region that does not match the country', () => {
    const result = checkJid('1GB012AXA');
    expect(result).toMatchObject({ ok: false });
    expect(result.ok ? '' : result.error).toMatch(/United Kingdom is not in region 1.*start with 5/);
    expect(checkJid('3BR044CXA').ok).toBe(false);
  });

  it('refuses an unknown country code and a badly shaped JID', () => {
    expect(checkJid('5ZZ012AXA').ok).toBe(false);
    expect(checkJid('G4ABC').ok).toBe(false);
  });
});

describe('the region table', () => {
  // The web page and the server each need the table, so there are two copies of the
  // file. If you change one, copy it over the other; this test fails until you do.
  it('is the same file in api/src and web/src', () => {
    const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8').replaceAll(String.fromCharCode(13), '');
    expect(read('../src/scout-regions.ts')).toBe(read('../../web/src/scout-regions.ts'));
  });
});
