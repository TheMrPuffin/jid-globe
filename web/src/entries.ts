// A JID can be entered more than once (two Scouts talk to the same station, or one
// Scout talks to it twice). Every entry is saved separately, but the logbook and the
// globe treat them as one JID with a count.
import type { Pin } from './api';

export interface JidGroup {
  jid: string;
  /** Every time this JID was entered, in the order given (newest first). */
  entries: Pin[];
}

/** Groups entries by JID. Groups come out in order of their first entry in the list. */
export function groupByJid(pins: Pin[]): JidGroup[] {
  const groups = new Map<string, JidGroup>();
  for (const pin of pins) {
    const group = groups.get(pin.jid);
    if (group) group.entries.push(pin);
    else groups.set(pin.jid, { jid: pin.jid, entries: [pin] });
  }
  return [...groups.values()];
}

export function countDifferentJids(pins: Pin[]): number {
  return new Set(pins.map((pin) => pin.jid)).size;
}
