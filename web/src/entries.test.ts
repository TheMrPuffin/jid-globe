import { describe, expect, it } from 'vitest';
import type { Pin } from './api';
import { countDifferentJids, groupByJid } from './entries';

function entry(id: string, jid: string): Pin {
  return { id, jid, lat: 0, lng: 0, placement: 'country', city: null, note: null, added_by: null, created_at: '' };
}

describe('groupByJid', () => {
  it('collects repeat entries of a JID into one group, keeping their order', () => {
    const groups = groupByJid([entry('a', '5GB012AXA'), entry('b', '6BR044CXA'), entry('c', '5GB012AXA')]);
    expect(groups.map((g) => g.jid)).toEqual(['5GB012AXA', '6BR044CXA']);
    expect(groups[0].entries.map((e) => e.id)).toEqual(['a', 'c']);
    expect(groups[1].entries).toHaveLength(1);
  });

  it('handles an empty logbook', () => {
    expect(groupByJid([])).toEqual([]);
  });
});

describe('countDifferentJids', () => {
  it('counts each JID once however often it was entered', () => {
    expect(countDifferentJids([entry('a', '5GB012AXA'), entry('b', '6BR044CXA'), entry('c', '5GB012AXA')])).toBe(2);
  });
});
