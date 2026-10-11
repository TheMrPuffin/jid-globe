import { describe, expect, it } from 'vitest';
import type { Pin } from './api';
import { countDifferentJids, groupByJid } from './entries';

function entry(id: string, jid: string): Pin {
  return { id, jid, lat: 0, lng: 0, placement: 'country', city: null, note: null, added_by: null, created_at: '' };
}

describe('groupByJid', () => {
  it('collects repeat entries of a JID into one group, keeping their order', () => {
    const groups = groupByJid([entry('a', '5GB12A'), entry('b', '6BR44C'), entry('c', '5GB12A')]);
    expect(groups.map((g) => g.jid)).toEqual(['5GB12A', '6BR44C']);
    expect(groups[0].entries.map((e) => e.id)).toEqual(['a', 'c']);
    expect(groups[1].entries).toHaveLength(1);
  });

  it('handles an empty logbook', () => {
    expect(groupByJid([])).toEqual([]);
  });
});

describe('countDifferentJids', () => {
  it('counts each JID once however often it was entered', () => {
    expect(countDifferentJids([entry('a', '5GB12A'), entry('b', '6BR44C'), entry('c', '5GB12A')])).toBe(2);
  });
});
