// Groups JIDs that are in the same place into one "stack", so the globe shows a
// single pin with a count instead of several pins hidden behind each other.
import type { Pin } from './api';

export interface Stack {
  /** Identifies the place, so the same stack can be recognised from one update to the next. */
  key: string;
  lat: number;
  lng: number;
  /** The JIDs at this spot, in the order they were given (newest first). */
  pins: Pin[];
}

// Rounded to 3 decimal places (about 100 m), so the same town or the same country
// centre always matches, but two hand-picked spots in one town stay separate.
function placeKey(pin: Pin): string {
  return `${pin.lat.toFixed(3)},${pin.lng.toFixed(3)}`;
}

export function stackPins(pins: Pin[]): Stack[] {
  const stacks = new Map<string, Stack>();
  for (const pin of pins) {
    const key = placeKey(pin);
    const stack = stacks.get(key);
    if (stack) stack.pins.push(pin);
    else stacks.set(key, { key, lat: pin.lat, lng: pin.lng, pins: [pin] });
  }
  return [...stacks.values()];
}
