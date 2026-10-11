// A "station" is a label for the machine a JID was entered on, such as PC01. It is set by
// adding ?station=PC01 to the address, so nobody has to type anything (or give their name).
// Every JID saved from that page is tagged with it. Entries saved with no label are
// shown as "Unknown".

import type { Pin } from './api';

const MAX_LENGTH = 30; // the most the server accepts

/** What an entry with no station label is shown as. (The server's CSV export uses the same word.) */
export const NO_STATION = 'Unknown';

/** Reads the station label out of the query part of an address, e.g. "?kiosk&station=PC01". */
export function parseStation(query: string): string | null {
  const label = new URLSearchParams(query).get('station')?.trim().slice(0, MAX_LENGTH);
  return label || null;
}

/** The station label for this page, or null if the address doesn't set one. */
export function currentStation(): string | null {
  return parseStation(window.location.search);
}

/** The station an entry came from, or "Unknown" if it has no label. */
export function stationOf(pin: Pin): string {
  return pin.added_by ?? NO_STATION;
}

/**
 * Whether station labels are in use at all. Until one entry has a real label there is
 * nothing to tell apart, so the logbook and stats don't mention stations.
 */
export function stationsInUse(pins: Pin[]): boolean {
  return pins.some((pin) => pin.added_by !== null);
}
