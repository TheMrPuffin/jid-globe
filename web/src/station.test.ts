import { describe, expect, it } from 'vitest';
import type { Pin } from './api';
import { parseStation, stationOf, stationsInUse } from './station';

describe('parseStation', () => {
  it('reads the label from the address', () => {
    expect(parseStation('?station=PC01')).toBe('PC01');
    expect(parseStation('?kiosk&station=Tent%202')).toBe('Tent 2');
  });

  it('gives null when there is no label', () => {
    expect(parseStation('')).toBeNull();
    expect(parseStation('?kiosk')).toBeNull();
    expect(parseStation('?station=')).toBeNull();
    expect(parseStation('?station=%20%20')).toBeNull();
  });

  it('cuts an over-long label down to what the server accepts', () => {
    expect(parseStation(`?station=${'x'.repeat(50)}`)).toHaveLength(30);
  });
});

function entry(station: string | null): Pin {
  return { id: '1', jid: '5GB012AXA', lat: 0, lng: 0, placement: 'country', city: null, note: null, added_by: station, created_at: '' };
}

describe('stationOf', () => {
  it('calls an entry with no label "Unknown"', () => {
    expect(stationOf(entry('PC01'))).toBe('PC01');
    expect(stationOf(entry(null))).toBe('Unknown');
  });
});

describe('stationsInUse', () => {
  it('is true once any entry has a real label', () => {
    expect(stationsInUse([entry(null), entry(null)])).toBe(false);
    expect(stationsInUse([entry(null), entry('PC01')])).toBe(true);
    expect(stationsInUse([])).toBe(false);
  });
});
