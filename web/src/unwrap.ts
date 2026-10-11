// Helps draw shapes that cross the date line (longitude 180 / -180) on a flat map.
//
// A coastline crossing the date line jumps from, say, 179.9 to -179.9. Drawn as-is,
// that jump becomes a streak right across the map. "Unwrapping" keeps the longitudes
// running on past 180 (179.9 -> 180.1) so the outline stays in one piece.

export type LngLat = [number, number]; // [longitude, latitude]

export interface UnwrappedRing {
  points: LngLat[];
  /** 'north' or 'south' when the ring goes all the way round that pole (like Antarctica). */
  aroundPole: 'north' | 'south' | null;
}

/** The shortest way from one longitude to another, e.g. 179 -> -179 is +2, not -358. */
export function lngStep(from: number, to: number): number {
  const step = to - from;
  if (step > 180) return step - 360;
  if (step < -180) return step + 360;
  return step;
}

export function unwrapRing(ring: LngLat[]): UnwrappedRing {
  const points: LngLat[] = [];
  let lng = ring[0][0];
  ring.forEach(([nextLng, lat], i) => {
    if (i > 0) lng += lngStep(ring[i - 1][0], nextLng);
    points.push([lng, lat]);
  });

  // A normal ring ends where it started. One that circles a pole ends a full turn away.
  const fullTurn = Math.abs(points[points.length - 1][0] - points[0][0]) > 180;
  const averageLat = ring.reduce((sum, point) => sum + point[1], 0) / ring.length;
  return { points, aroundPole: fullTurn ? (averageLat < 0 ? 'south' : 'north') : null };
}
