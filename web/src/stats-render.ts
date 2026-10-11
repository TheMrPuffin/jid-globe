// Draws the pieces of the stats display. Used by both the pop-up on the globe page
// (stats-view.ts) and the full-page dashboard (stats-page.ts), so they always match.
import type { Pin } from './api';
import { countryFor } from './countries';
import { el } from './dom';
import { groupByJid } from './entries';
import { regionColor } from './regions';
import type { Summary } from './summary';

const LATEST_LIMIT = 8;

/** The four headline cards. */
export function headlines(summary: Summary): HTMLElement {
  const regionsReached = summary.regions.filter((region) => region.jids > 0).length;
  const topCountry = summary.countries[0];
  const topJid = summary.mostSeen[0];

  const cards = el('div', 'stat-cards');
  cards.append(
    card('Different JIDs', String(summary.jids), `${summary.entries} entries in total`),
    card('Countries', String(summary.countries.length), `${regionsReached} of ${summary.regions.length} regions`),
    card('Country with most JIDs', topCountry ? topCountry.name : '–', topCountry ? plural(topCountry.jids, 'JID') : 'Nothing yet'),
    card('Most seen JID', topJid ? topJid.jid : '–', topJid ? `entered ${times(topJid.times)}` : 'Nothing yet'),
  );
  return cards;
}

function card(label: string, value: string, detail: string): HTMLElement {
  const box = el('div', 'stat-card');
  box.append(el('span', 'stat-card-label', label), el('strong', '', value), el('span', 'stat-card-detail', detail));
  return box;
}

export function regionsSection(summary: Summary): HTMLElement {
  const most = Math.max(1, ...summary.regions.map((region) => region.jids));
  const rows = summary.regions.map((region) =>
    barRow({
      label: `${region.digit}  ${region.name}`,
      value: String(region.jids),
      detail: region.jids > 0 ? plural(region.countries, 'country', 'countries') : 'not yet',
      share: region.jids / most,
      color: region.color,
      faded: region.jids === 0,
      // Opens the logbook page showing just this region's entries (if it has any).
      href: region.jids > 0 ? `/logbook?${new URLSearchParams({ region: region.digit })}` : undefined,
    }),
  );
  return section('JIDs by region', rows);
}

/** How many countries are listed before the rest are folded into "and N more". */
export const TOP_COUNTRIES = 15;

interface CountriesOptions {
  /** List every country instead of just the top few. */
  showAll?: boolean;
  /** If given, the "and N more" line becomes a button that calls this (to show all, or fewer again). */
  onToggle?: () => void;
}

export function countriesSection(summary: Summary, options: CountriesOptions = {}): HTMLElement {
  if (summary.countries.length === 0) return section('JIDs by country', [nothingYet()]);
  const most = summary.countries[0].jids;
  const hiddenCount = options.showAll ? 0 : Math.max(0, summary.countries.length - TOP_COUNTRIES);
  const listed = hiddenCount > 0 ? summary.countries.slice(0, TOP_COUNTRIES) : summary.countries;
  const rows = listed.map((country) =>
    barRow({
      label: country.name,
      value: String(country.jids),
      detail: country.entries > country.jids ? `${country.entries} entries` : '',
      share: country.jids / most,
      color: regionColor(country.regionDigit),
      faded: false,
      // Opens the logbook page showing just this country's entries.
      href: `/logbook?${new URLSearchParams({ country: country.code })}`,
    }),
  );

  // The line under the list: how many more there are, and (in the pop-up) a way to see them.
  const foldable = summary.countries.length > TOP_COUNTRIES;
  if (foldable && options.onToggle) {
    const toggle = el('button', 'stat-more', hiddenCount > 0 ? `Show all (${hiddenCount} more)` : `Show only the top ${TOP_COUNTRIES}`);
    toggle.type = 'button';
    toggle.addEventListener('click', options.onToggle);
    rows.push(toggle);
  } else if (hiddenCount > 0) {
    rows.push(el('p', 'stat-more', `and ${hiddenCount} more`));
  }
  return section(`JIDs by country (${summary.countries.length})`, rows);
}

export function mostSeenSection(summary: Summary): HTMLElement {
  if (summary.mostSeen.length === 0) return section('Most seen JIDs', [nothingYet()]);
  const most = summary.mostSeen[0].times;
  const rows = summary.mostSeen.map((jid) =>
    barRow({
      label: jid.jid,
      value: String(jid.times),
      detail: jid.place,
      share: jid.times / most,
      color: regionColor(jid.jid[0]),
      faded: false,
    }),
  );
  return section('Most seen JIDs', rows);
}

/** Entries per machine. Returns null when no entries are tagged, so the section is left out. */
export function stationsSection(summary: Summary): HTMLElement | null {
  if (summary.stations.length === 0) return null;
  const most = summary.stations[0].entries;
  const rows = summary.stations.map((station) =>
    barRow({
      label: station.name,
      value: String(station.entries),
      detail: plural(station.jids, 'different JID'),
      share: station.entries / most,
      color: '#38bdf8',
      faded: false,
      // Opens the logbook page showing just this station's entries.
      href: `/logbook?${new URLSearchParams({ from: station.name })}`,
    }),
  );
  return section('Entries by station', rows);
}

/** The JIDs entered most recently. (The globe page has the logbook for this; the dashboard doesn't.) */
export function latestSection(pins: Pin[]): HTMLElement {
  const latest = groupByJid(pins).slice(0, LATEST_LIMIT); // pins arrive newest first
  if (latest.length === 0) return section('Latest JIDs', [nothingYet()]);
  const rows = latest.map(({ jid, entries }) => {
    const country = countryFor(jid.slice(1, 3))?.name ?? jid.slice(1, 3);
    return barRow({
      label: jid,
      value: timeText(entries[0].created_at),
      detail: [entries[0].city, country].filter(Boolean).join(', '),
      share: 0,
      color: regionColor(jid[0]),
      faded: false,
    });
  });
  return section('Latest JIDs', rows);
}

/** Turns a section that might be missing into a list of zero or one, ready to add to the page. */
export function present(section: HTMLElement | null): HTMLElement[] {
  return section ? [section] : [];
}

function section(title: string, rows: HTMLElement[]): HTMLElement {
  const box = el('section', 'stat-section');
  box.append(el('h3', '', title), ...rows);
  return box;
}

function nothingYet(): HTMLElement {
  return el('p', 'message hint', 'No JIDs yet.');
}

interface Bar {
  label: string;
  value: string; // shown in bold at the right-hand end
  detail: string;
  share: number; // 0 to 1: how long the bar is compared with the longest
  color: string;
  faded: boolean;
  /** If given, the whole line is a link to this address. */
  href?: string;
}

// One line of a chart: a name, a value, and a bar behind them showing the size.
function barRow(bar: Bar): HTMLElement {
  const row = el(bar.href ? 'a' : 'div', bar.faded ? 'stat-row faded' : 'stat-row');
  if (bar.href) (row as HTMLAnchorElement).href = bar.href;
  const fill = el('span', 'stat-bar');
  fill.style.width = `${Math.round(bar.share * 100)}%`;
  fill.style.background = bar.color;
  row.append(fill, el('span', 'stat-name', bar.label), el('span', 'stat-detail', bar.detail), el('b', '', bar.value));
  return row;
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

function times(count: number): string {
  return count === 1 ? 'once' : count === 2 ? 'twice' : `${count} times`;
}

function timeText(iso: string): string {
  return new Date(iso).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
}
