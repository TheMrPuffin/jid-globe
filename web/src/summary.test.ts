import { describe, expect, it } from 'vitest';
import type { Pin } from './api';
import { summarise } from './summary';

let nextId = 0;
function entry(jid: string, city: string | null = null, station: string | null = null): Pin {
  return { id: String(nextId++), jid, lat: 0, lng: 0, placement: 'city', city, note: null, added_by: station, created_at: '' };
}

// Three UK JIDs (one entered three times), one Brazilian JID entered twice, one Japanese JID.
const pins = [
  entry('5GB12A', 'Leeds'),
  entry('5GB12A', 'Leeds'),
  entry('5GB12A', 'Leeds'),
  entry('5GB34B'),
  entry('5GB56C'),
  entry('6BR44C', 'Rio de Janeiro'),
  entry('6BR44C', 'Rio de Janeiro'),
  entry('3JP01A', 'Tokyo'),
];

describe('summarise', () => {
  const summary = summarise(pins);

  it('counts different JIDs and total entries', () => {
    expect(summary.jids).toBe(5);
    expect(summary.entries).toBe(8);
  });

  it('ranks countries by how many different JIDs they have', () => {
    expect(summary.countries.map((c) => [c.name, c.jids, c.entries])).toEqual([
      ['United Kingdom', 3, 5],
      ['Brazil', 1, 2],
      ['Japan', 1, 1],
    ]);
  });

  it('lists all seven regions, including empty ones', () => {
    expect(summary.regions).toHaveLength(7);
    expect(summary.regions.find((r) => r.name === 'European')).toMatchObject({ jids: 3, countries: 1 });
    expect(summary.regions.find((r) => r.name === 'Africa')).toMatchObject({ jids: 0, countries: 0 });
  });

  it('puts the most-entered JIDs first', () => {
    expect(summary.mostSeen.slice(0, 2)).toEqual([
      { jid: '5GB12A', times: 3, place: 'Leeds, United Kingdom' },
      { jid: '6BR44C', times: 2, place: 'Rio de Janeiro, Brazil' },
    ]);
    expect(summary.mostSeen).toHaveLength(5);
  });

  it('counts entries per station, with unlabelled entries as "Unknown"', () => {
    const tagged = summarise([
      entry('5GB12A', null, 'PC01'),
      entry('5GB12A', null, 'PC01'),
      entry('5GB34B', null, 'PC01'),
      entry('6BR44C', null, 'PC02'),
      entry('3JP01A'),
    ]);
    expect(tagged.stations).toEqual([
      { name: 'PC01', entries: 3, jids: 2 },
      { name: 'PC02', entries: 1, jids: 1 },
      { name: 'Unknown', entries: 1, jids: 1 },
    ]);
    // With no labels in use at all, there is nothing to list.
    expect(summary.stations).toEqual([]);
  });

  it('copes with an empty logbook', () => {
    const empty = summarise([]);
    expect(empty).toMatchObject({ jids: 0, entries: 0, countries: [], mostSeen: [] });
    expect(empty.regions).toHaveLength(7);
  });
});
