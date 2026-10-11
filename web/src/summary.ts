// Works out the numbers for the stats panel from the list of entries.
// "JIDs" always means different JIDs; "entries" counts every time one was entered.
import type { Pin } from './api';
import { countryFor } from './countries';
import { groupByJid } from './entries';
import { REGIONS } from './regions';
import { stationOf, stationsInUse } from './station';

export interface RegionStat {
  digit: string;
  name: string;
  color: string;
  jids: number;
  countries: number;
}

export interface CountryStat {
  code: string;
  name: string;
  regionDigit: string; // the region of its first JID, used for the bar colour
  jids: number;
  entries: number;
}

export interface JidStat {
  jid: string;
  times: number;
  place: string;
}

export interface StationStat {
  name: string;
  entries: number;
  jids: number; // different JIDs entered on this machine
}

export interface Summary {
  jids: number;
  entries: number;
  /** Every region, including ones with nothing yet, in order 1 to 7. */
  regions: RegionStat[];
  /** Countries with at least one JID, the one with the most different JIDs first. */
  countries: CountryStat[];
  /** The JIDs entered most often, most first. */
  mostSeen: JidStat[];
  /**
   * Machines that entries came from (set with ?station=... in the address), busiest first.
   * Empty until at least one entry has a label; after that, unlabelled entries are "Unknown".
   */
  stations: StationStat[];
}

const MOST_SEEN_LIMIT = 5;

export function summarise(pins: Pin[]): Summary {
  const groups = groupByJid(pins);

  const countries = new Map<string, CountryStat>();
  for (const { jid, entries } of groups) {
    const code = jid.slice(1, 3);
    const stat = countries.get(code) ?? {
      code,
      name: countryFor(code)?.name ?? code,
      regionDigit: jid[0],
      jids: 0,
      entries: 0,
    };
    stat.jids += 1;
    stat.entries += entries.length;
    countries.set(code, stat);
  }

  const regions = REGIONS.map((region) => {
    const inRegion = groups.filter((group) => group.jid[0] === region.digit);
    return {
      digit: region.digit,
      name: region.name,
      color: region.color,
      jids: inRegion.length,
      countries: new Set(inRegion.map((group) => group.jid.slice(1, 3))).size,
    };
  });

  const mostSeen = groups
    .map(({ jid, entries }) => {
      const country = countryFor(jid.slice(1, 3))?.name ?? jid.slice(1, 3);
      return { jid, times: entries.length, place: [entries[0].city, country].filter(Boolean).join(', ') };
    })
    .sort((a, b) => b.times - a.times || a.jid.localeCompare(b.jid))
    .slice(0, MOST_SEEN_LIMIT);

  // Only worth listing once labels are in use; then unlabelled entries count as "Unknown".
  const byStation = new Map<string, Pin[]>();
  for (const pin of stationsInUse(pins) ? pins : []) {
    const name = stationOf(pin);
    byStation.set(name, [...(byStation.get(name) ?? []), pin]);
  }
  const stations = [...byStation.entries()]
    .map(([name, entries]) => ({ name, entries: entries.length, jids: new Set(entries.map((pin) => pin.jid)).size }))
    .sort((a, b) => b.entries - a.entries || a.name.localeCompare(b.name));

  return {
    stations,
    jids: groups.length,
    entries: pins.length,
    regions,
    countries: [...countries.values()].sort(
      (a, b) => b.jids - a.jids || b.entries - a.entries || a.name.localeCompare(b.name),
    ),
    mostSeen,
  };
}
