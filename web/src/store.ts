// The list of pins shared by the globe, logbook and stats, kept newest first.
import type { Pin } from './api';

type Listener = (pins: Pin[]) => void;

let pins: Pin[] = [];
const listeners: Listener[] = [];

function changed(): void {
  pins.sort((a, b) => b.created_at.localeCompare(a.created_at));
  for (const listener of listeners) listener(pins);
}

export const store = {
  get pins(): Pin[] {
    return pins;
  },
  /** Calls `listener` now and every time the pins change. */
  subscribe(listener: Listener): void {
    listeners.push(listener);
    listener(pins);
  },
  replaceAll(next: Pin[]): void {
    pins = [...next];
    changed();
  },
  // A pin we save ourselves arrives twice (the reply and the live event), so ignore repeats.
  add(pin: Pin): void {
    if (pins.some((existing) => existing.id === pin.id)) return;
    pins.push(pin);
    changed();
  },
  /** Swaps in newer copies of pins we already have (used when a JID is moved). */
  update(newer: Pin[]): void {
    const byId = new Map(newer.map((pin) => [pin.id, pin]));
    pins = pins.map((pin) => byId.get(pin.id) ?? pin);
    changed();
  },
  remove(id: string): void {
    const before = pins.length;
    pins = pins.filter((pin) => pin.id !== id);
    if (pins.length !== before) changed();
  },
};
