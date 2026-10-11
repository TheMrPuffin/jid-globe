import { describe, expect, it } from 'vitest';
import { turnLength } from './announce';

describe('turnLength', () => {
  it('gives a full turn when nothing else is waiting', () => {
    expect(turnLength(0)).toBe(7000);
  });

  it('shortens the turn as the queue builds up', () => {
    expect(turnLength(1)).toBe(4000);
    expect(turnLength(2)).toBe(4000);
    expect(turnLength(3)).toBe(2500);
    expect(turnLength(20)).toBe(2500);
  });
});
