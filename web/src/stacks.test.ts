import { describe, expect, it } from 'vitest';
import type { Pin } from './api';
import { stackPins } from './stacks';

function pin(id: string, lat: number, lng: number): Pin {
  return { id, jid: '5GB12A', lat, lng, placement: 'city', city: null, note: null, added_by: null, created_at: '' };
}

describe('stackPins', () => {
  it('puts JIDs in the same place into one stack, keeping their order', () => {
    const stacks = stackPins([pin('a', 52.04, -0.76), pin('b', 48.85, 2.35), pin('c', 52.04, -0.76)]);
    expect(stacks).toHaveLength(2);
    expect(stacks[0].pins.map((p) => p.id)).toEqual(['a', 'c']);
    expect(stacks[1].pins.map((p) => p.id)).toEqual(['b']);
  });

  it('keeps nearby but different spots apart', () => {
    expect(stackPins([pin('a', 52.04, -0.76), pin('b', 52.05, -0.76)])).toHaveLength(2);
  });

  it('handles no pins', () => {
    expect(stackPins([])).toEqual([]);
  });
});
