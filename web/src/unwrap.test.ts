import { describe, expect, it } from 'vitest';
import { lngStep, unwrapRing, type LngLat } from './unwrap';

describe('lngStep', () => {
  it('takes the short way across the date line', () => {
    expect(lngStep(179, -179)).toBe(2);
    expect(lngStep(-179, 179)).toBe(-2);
    expect(lngStep(10, 30)).toBe(20);
  });
});

describe('unwrapRing', () => {
  it('leaves an ordinary ring alone', () => {
    const ring: LngLat[] = [[0, 0], [10, 0], [10, 10], [0, 0]];
    expect(unwrapRing(ring)).toEqual({ points: ring, aroundPole: null });
  });

  it('keeps a ring that crosses the date line in one piece', () => {
    const ring: LngLat[] = [[170, 60], [-170, 60], [-170, 70], [170, 70], [170, 60]];
    const { points, aroundPole } = unwrapRing(ring);
    expect(points.map((p) => p[0])).toEqual([170, 190, 190, 170, 170]);
    expect(aroundPole).toBeNull();
  });

  it('spots a ring that goes all the way round the South Pole', () => {
    const ring: LngLat[] = [[-180, -70], [-90, -70], [0, -70], [90, -70], [180, -70], [-180, -70]];
    const { points, aroundPole } = unwrapRing(ring);
    expect(aroundPole).toBe('south');
    expect(points[points.length - 1][0] - points[0][0]).toBe(360);
  });
});
