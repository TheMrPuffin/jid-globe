import { describe, expect, it } from 'vitest';
import type { Pin } from './api';
import { buildFeed } from './feed';

function entry(id: string, jid: string): Pin {
  return { id, jid, lat: 0, lng: 0, placement: 'country', city: null, note: null, added_by: null, created_at: '' };
}

describe('buildFeed', () => {
  // Newest first, as the store keeps them: "d" is the latest entry.
  const pins = [entry('d', '5GB12A'), entry('c', '6BR44C'), entry('b', '5GB12A'), entry('a', '5GB12A')];

  it('keeps the entries newest first, one line each', () => {
    expect(buildFeed(pins).map((item) => item.pin.id)).toEqual(['d', 'c', 'b', 'a']);
  });

  it('numbers each entry by how many times its JID had been seen by then', () => {
    expect(buildFeed(pins).map((item) => item.timesSeen)).toEqual([3, 1, 2, 1]);
  });

  it('can return just some entries, still numbered against all of them', () => {
    const feed = buildFeed(pins, (pin) => pin.id === 'd' || pin.id === 'c');
    expect(feed.map((item) => item.pin.id)).toEqual(['d', 'c']);
    expect(feed[0].timesSeen).toBe(3);
  });

  it('copes with an empty logbook', () => {
    expect(buildFeed([])).toEqual([]);
  });
});
