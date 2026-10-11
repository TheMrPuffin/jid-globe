// Works out what the logbook feed shows: one line per entry, newest first, each with
// how many times its JID had been seen by then (so a repeat can say "×3").
import type { Pin } from './api';

export interface FeedItem {
  pin: Pin;
  /** 1 the first time this JID was entered, 2 the second time, and so on. */
  timesSeen: number;
}

/**
 * `pins` must be newest first (as the store keeps them). If `keep` is given, only the
 * entries it says yes to are returned (the "times seen" numbers still count every entry).
 */
export function buildFeed(pins: Pin[], keep: (pin: Pin) => boolean = () => true): FeedItem[] {
  // Count upwards from the oldest entry, so each entry knows its place in the sequence.
  const seenSoFar = new Map<string, number>();
  const items: FeedItem[] = [];
  for (let i = pins.length - 1; i >= 0; i--) {
    const pin = pins[i];
    const timesSeen = (seenSoFar.get(pin.jid) ?? 0) + 1;
    seenSoFar.set(pin.jid, timesSeen);
    items.push({ pin, timesSeen });
  }
  return items.reverse().filter((item) => keep(item.pin));
}
