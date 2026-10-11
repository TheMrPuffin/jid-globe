// The logbook page at /logbook: a live feed of entries for a screen on the wall.
// New entries slide in at the top and everything else moves down. It is for looking at
// only; moving and deleting are done from the logbook on the globe page.
import { setupAbout } from './about';
import type { Pin } from './api';
import { countryFor } from './countries';
import { arrange, byId, el, setMessage } from './dom';
import { buildFeed, type FeedItem } from './feed';
import { refreshKioskLink, setupKioskLink } from './kiosk-link';
import { startLiveSync } from './live';
import { regionColor, regionFor } from './regions';
import { stationOf, stationsInUse } from './station';
import { renderStats } from './stats';
import { store } from './store';

// The feed shows the newest PAGE_SIZE entries. "Show more" adds another PAGE_SIZE each press.
// However many are showing, that number stays fixed: as new entries arrive at the top, the
// oldest ones showing drop off the bottom, and "Show more" brings them back.
const PAGE_SIZE = 150;
const HIGHLIGHT_MS = 6000;

const list = byId('feed');
const empty = byId('feed-empty');
const moreButton = byId<HTMLButtonElement>('feed-more');
const lessButton = byId<HTMLButtonElement>('feed-less');
let rowsToShow = PAGE_SIZE;

// ---- Filters: show just one station's entries, one region's, one country's, or a mix ----
// The choices are kept in the address (?from=PC01&region=5&country=GB), so a filtered list
// can be bookmarked or linked to (the stats page links here). Leaving one out means "all".
const filterBar = byId('feed-filter');
const stationPicker = byId<HTMLSelectElement>('feed-station');
const regionPicker = byId<HTMLSelectElement>('feed-region');
const countryPicker = byId<HTMLSelectElement>('feed-country');
const filterSummary = byId('feed-summary');
const clearButton = byId<HTMLButtonElement>('feed-clear');

interface Filters {
  station: string | null;
  region: string | null; // the region digit, "1" to "7"
  country: string | null; // the two-letter country code
}
const startingAddress = new URLSearchParams(window.location.search);
let filters: Filters = {
  station: startingAddress.get('from'),
  region: startingAddress.get('region'),
  country: startingAddress.get('country')?.toUpperCase() ?? null,
};

const regionOf = (pin: Pin) => pin.jid[0];
const countryOf = (pin: Pin) => pin.jid.slice(1, 3);
const regionName = (digit: string) => regionFor(digit)?.name ?? digit;
const countryName = (code: string) => countryFor(code)?.name ?? code;

/** Whether an entry gets through the filters. Pass `ignoring` to leave one filter out. */
function matches(pin: Pin, ignoring?: keyof Filters): boolean {
  if (ignoring !== 'station' && filters.station && stationOf(pin) !== filters.station) return false;
  if (ignoring !== 'region' && filters.region && regionOf(pin) !== filters.region) return false;
  if (ignoring !== 'country' && filters.country && countryOf(pin) !== filters.country) return false;
  return true;
}

function setFilters(next: Filters): void {
  filters = next;
  rowsToShow = PAGE_SIZE;
  const address = new URLSearchParams(window.location.search);
  const put = (name: string, value: string | null) => (value ? address.set(name, value) : address.delete(name));
  put('from', next.station);
  put('region', next.region);
  put('country', next.country);
  const query = address.toString();
  history.replaceState(null, '', query ? `${window.location.pathname}?${query}` : window.location.pathname);
  refreshKioskLink(); // so going into kiosk mode keeps the filters
  render();
}

stationPicker.addEventListener('change', () => setFilters({ ...filters, station: stationPicker.value || null }));
regionPicker.addEventListener('change', () => setFilters({ ...filters, region: regionPicker.value || null }));
countryPicker.addEventListener('change', () => setFilters({ ...filters, country: countryPicker.value || null }));
clearButton.addEventListener('click', () => setFilters({ station: null, region: null, country: null }));

// Fills one picker with "All ... (total)" then each choice and how many entries it has.
function fillPicker(
  picker: HTMLSelectElement,
  allLabel: string,
  pins: Pin[],
  keyOf: (pin: Pin) => string,
  labelOf: (key: string) => string,
  chosen: string | null,
): void {
  const counts = new Map<string, number>();
  for (const pin of pins) counts.set(keyOf(pin), (counts.get(keyOf(pin)) ?? 0) + 1);
  // Keep the current choice in the list even if nothing matches it (yet).
  if (chosen && !counts.has(chosen)) counts.set(chosen, 0);
  const choices = [...counts.entries()]
    .sort(([a], [b]) => labelOf(a).localeCompare(labelOf(b)))
    .map(([key, count]) => new Option(`${labelOf(key)} (${count})`, key));
  picker.replaceChildren(new Option(`${allLabel} (${pins.length})`, ''), ...choices);
  picker.value = chosen ?? '';
}

// Fills in the pickers and the line beside them. Each picker counts only the entries the
// other filters let through, so its numbers always match what choosing it would show.
function renderFilters(pins: Pin[]): void {
  const anyChosen = Boolean(filters.station || filters.region || filters.country);
  filterBar.hidden = pins.length === 0 && !anyChosen;
  clearButton.hidden = !anyChosen;
  // Stations are only offered once station labels are in use.
  stationPicker.hidden = !stationsInUse(pins) && !filters.station;

  const letThrough = (ignoring: keyof Filters) => pins.filter((pin) => matches(pin, ignoring));
  fillPicker(stationPicker, 'All stations', letThrough('station'), stationOf, (name) => name, filters.station);
  // Regions are labelled "5 European", which also puts them in number order.
  fillPicker(regionPicker, 'All regions', letThrough('region'), regionOf, (digit) => `${digit} ${regionName(digit)}`, filters.region);
  fillPicker(countryPicker, 'All countries', letThrough('country'), countryOf, countryName, filters.country);

  if (!anyChosen) return setMessage(filterSummary, null);
  const shown = pins.filter((pin) => matches(pin));
  const different = new Set(shown.map((pin) => pin.jid)).size;
  const entries = `${shown.length} ${shown.length === 1 ? 'entry' : 'entries'}`;
  const jids = `${different} different ${different === 1 ? 'JID' : 'JIDs'}`;
  const who = filters.station ? ` added by ${filters.station}` : '';
  // A country says more than its region, so name the country if both are chosen.
  const where = filters.country
    ? ` in ${countryName(filters.country)}`
    : filters.region
      ? ` in the ${regionName(filters.region)} region`
      : '';
  setMessage(filterSummary, `${entries} (${jids})${who}${where}.`);
}

/** A row that has been built, plus a summary of what it shows, used to tell whether it has changed. */
interface BuiltRow {
  contents: string;
  element: HTMLLIElement;
}
let builtRows = new Map<string, BuiltRow>(); // by entry id
const justArrived = new Set<string>(); // entries that came in while the page was open

function render(): void {
  const pins = store.pins;
  renderStats(pins);
  const showStations = stationsInUse(pins);
  renderFilters(pins);
  const feed = buildFeed(pins, (pin) => matches(pin));

  // Rows are kept from one update to the next, so a new entry adds one row at the top
  // and the browser slides the rest down, instead of the whole list being rebuilt.
  const stillUsed = new Map<string, BuiltRow>();
  const wanted = feed.slice(0, rowsToShow).map((item) => {
    const { pin } = item;
    const contents = `${item.timesSeen}|${showStations}|${pin.city ?? ''}|${pin.lat},${pin.lng}`;
    const before = builtRows.get(pin.id);
    const built = before?.contents === contents ? before : { contents, element: row(item, showStations) };
    stillUsed.set(pin.id, built);
    return built.element;
  });
  builtRows = stillUsed;
  arrange(list, wanted);
  setMessage(
    empty,
    feed.length > 0
      ? null
      : filters.station || filters.region || filters.country
        ? 'Nothing matches yet.'
        : 'No JIDs yet. They will appear here as they are added.',
  );

  // The buttons under the list.
  const older = feed.length - wanted.length;
  moreButton.hidden = older <= 0;
  moreButton.textContent = `Show ${Math.min(PAGE_SIZE, older)} more (${older} older ${older === 1 ? 'entry' : 'entries'} not shown)`;
  lessButton.hidden = rowsToShow <= PAGE_SIZE;
}

moreButton.addEventListener('click', () => {
  rowsToShow += PAGE_SIZE;
  render();
});
lessButton.addEventListener('click', () => {
  rowsToShow = PAGE_SIZE;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

store.subscribe(render);

function row(item: FeedItem, showStation: boolean): HTMLLIElement {
  const { pin, timesSeen } = item;
  const element = el('li', 'feed-row');

  const dot = el('span', 'dot');
  dot.style.background = regionColor(pin.jid[0]);

  const jid = el('strong', 'feed-jid', pin.jid);
  if (timesSeen > 1) {
    const count = el('span', 'log-count', `×${timesSeen}`);
    count.title = `Seen ${timesSeen} times`;
    jid.append(count);
  }

  const what = el('div', 'feed-what');
  what.append(jid, el('span', 'feed-place', placeText(pin)));
  if (pin.note) what.append(el('span', 'feed-note', `“${pin.note}”`));

  const when = el('div', 'feed-when');
  // A real station label stands out; "Unknown" (no label) is kept quiet.
  if (showStation) {
    // Pressing a station's name shows just that station's entries.
    const station = el('button', pin.added_by ? 'feed-station' : 'feed-station unknown', stationOf(pin));
    station.type = 'button';
    station.title = `Show only entries from ${stationOf(pin)}`;
    station.addEventListener('click', () => setFilters({ ...filters, station: stationOf(pin) }));
    when.append(station);
  }
  when.append(el('time', '', timeText(pin.created_at)));

  element.append(dot, what, when);

  // Entries that arrive while the page is open slide in and glow for a few seconds.
  if (justArrived.has(pin.id)) {
    justArrived.delete(pin.id);
    element.classList.add('feed-new');
    window.setTimeout(() => element.classList.remove('feed-new'), HIGHLIGHT_MS);
    // Once it is on the page (next frame), open it up from nothing so the rows below ease down.
    requestAnimationFrame(() => growIn(element));
  }
  return element;
}

// Grows a row from zero height to its full height, pushing the rest of the list down smoothly.
function growIn(element: HTMLElement): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const fullHeight = element.offsetHeight;
  element.style.overflow = 'hidden';
  const growing = element.animate(
    [
      { height: '0px', paddingTop: '0px', paddingBottom: '0px', marginBottom: '0px', opacity: 0 },
      { height: `${fullHeight}px`, opacity: 1 },
    ],
    { duration: 500, easing: 'ease-out' },
  );
  growing.onfinish = () => (element.style.overflow = '');
}

function placeText(pin: Pin): string {
  const country = countryFor(pin.jid.slice(1, 3))?.name ?? pin.jid.slice(1, 3);
  return [pin.city, country].filter(Boolean).join(', ');
}

function timeText(iso: string): string {
  return new Date(iso).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
}

// Loads the entries and keeps them up to date. Each new arrival is noted first, so that
// when its row is built it gets the "just arrived" treatment.
startLiveSync((pin) => {
  // The live system adds the entry to the store before calling this, so the row already
  // exists; rebuild it with the highlight.
  justArrived.add(pin.id);
  builtRows.delete(pin.id);
  store.update([pin]);
});

setupKioskLink();
setupAbout();
