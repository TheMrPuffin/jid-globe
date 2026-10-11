// Wires the pieces together: globe, form, logbook, stats and live sync.
import { setupAbout } from './about';
import { createAnnouncer } from './announce';
import { byId } from './dom';
import { setupForm } from './form';
import { createGlobe } from './globe';
import { startLiveSync } from './live';
import { setupKioskLink } from './kiosk-link';
import { setupLogbook } from './logbook';
import { setupPanelToggle } from './panel-toggle';
import { setupPlaceSearch } from './place-search';
import { renderLegend, renderStats } from './stats';
import { setupStationLink } from './station-link';
import { setupStatsView } from './stats-view';
import { store } from './store';
import { setupViewSwitch } from './views';

const PIN_ALTITUDE = 0.5;

const globeWrap = byId('globe-wrap');
const pickHint = byId('pick-hint');

// The play / pause button for the globe's slow spin.
const spinButton = byId<HTMLButtonElement>('spin');
let spinning = false;
spinButton.addEventListener('click', () => globe.setSpinning(!spinning));

// "Follow new pins": whether a spinning globe flies to each new pin. Only offered while spinning.
const FOLLOW_KEY = 'jid-globe-follow';
const followButton = byId<HTMLButtonElement>('follow');
let following = localStorage.getItem(FOLLOW_KEY) !== 'off'; // on unless this device turned it off

function showFollowing(): void {
  followButton.classList.toggle('active', following);
  followButton.setAttribute('aria-pressed', String(following));
  followButton.textContent = following ? 'Following new pins' : 'Follow new pins';
}

followButton.addEventListener('click', () => {
  following = !following;
  localStorage.setItem(FOLLOW_KEY, following ? 'on' : 'off');
  globe.setFollowing(following);
  showFollowing();
});

const globe = createGlobe(byId('globe'), {
  onSpinChange(on) {
    spinning = on;
    spinButton.textContent = on ? '⏸ Pause' : '▶ Spin';
    spinButton.setAttribute('aria-label', on ? 'Stop the globe spinning' : 'Spin the globe');
    followButton.hidden = !on;
  },
  onClick(lat, lng) {
    if (form.picking) form.setManualSpot(lat, lng);
  },
  onPinClick(pins) {
    logbook.reveal(pins.map((pin) => pin.id));
  },
});

globe.setFollowing(following);
showFollowing();

// "Counts": whether pins holding more than one JID show how many. The numbers are hidden
// with a style rule, so switching them on and off doesn't redraw anything on the globe.
const COUNTS_KEY = 'jid-globe-counts';
const countsButton = byId<HTMLButtonElement>('counts-toggle');
let countsOn = localStorage.getItem(COUNTS_KEY) !== 'off'; // on unless this device turned them off

function showCounts(): void {
  countsButton.classList.toggle('active', countsOn);
  countsButton.setAttribute('aria-pressed', String(countsOn));
  byId('globe-wrap').classList.toggle('hide-counts', !countsOn);
}

countsButton.addEventListener('click', () => {
  countsOn = !countsOn;
  localStorage.setItem(COUNTS_KEY, countsOn ? 'on' : 'off');
  showCounts();
});
showCounts();

const form = setupForm({
  onDraftChange(draft, flyAltitude) {
    globe.setDraft(draft && { lat: draft.lat, lng: draft.lng, region: draft.jid[0] });
    if (draft && flyAltitude) globe.flyTo(draft.lat, draft.lng, flyAltitude);
  },
  onPickModeChange(picking) {
    globeWrap.classList.toggle('picking', picking);
    pickHint.hidden = !picking;
    // On a phone the globe may be scrolled out of view, so bring it back.
    if (picking) globeWrap.scrollIntoView({ block: 'start', behavior: 'smooth' });
  },
  entriesFor: (jid) => store.pins.filter((pin) => pin.jid === jid),
  onSaved(pin) {
    store.add(pin);
    announcer.announce(pin);
  },
  onMoved: (pins) => store.update(pins),
});

const logbook = setupLogbook({
  onSelect(pin) {
    globe.flyTo(pin.lat, pin.lng, PIN_ALTITUDE);
  },
  onMove: (pin) => form.startMove(pin),
  onDeleted: (id) => store.remove(id),
  // Filtering the logbook also filters the globe: only the listed JIDs keep their pins.
  onFilter(shownJids, totalJids) {
    globe.showOnlyJids(shownJids);
    filterNote.hidden = shownJids === null;
    if (shownJids) filterNoteText.textContent = `Showing ${shownJids.size} of ${totalJids} JIDs`;
  },
});

// The reminder on the globe that a filter is hiding some pins, with a way to clear it.
const filterNote = byId('pin-filter-note');
const filterNoteText = byId('pin-filter-text');
byId('pin-filter-clear').addEventListener('click', () => logbook.clearFilter());

setupPlaceSearch((place) => {
  globe.flyTo(place.lat, place.lng, place.altitude);
  globe.showMarker(place.lat, place.lng);
  // On a phone the globe may be scrolled out of view, so bring it back.
  globeWrap.scrollIntoView({ block: 'start', behavior: 'smooth' });
});

setupKioskLink();
setupStationLink();
setupAbout();

const statsView = setupStatsView();
setupPanelToggle();

renderLegend();
setupViewSwitch({
  applyView: (view) => globe.setView(view),
  applyBorders: (mode) => globe.setBorders(mode),
});

store.subscribe((pins) => {
  globe.setPins(pins);
  logbook.setPins(pins);
  renderStats(pins);
  statsView.setPins(pins);
  form.refresh();
});

// New entries are announced one at a time (see announce.ts).
const announcer = createAnnouncer({
  showOnGlobe: (pin, durationMs) => globe.showNewPin(pin, durationMs),
  flashLogbookRow: (pin) => logbook.reveal([pin.id], false),
  timesEntered: (jid) => store.pins.filter((pin) => pin.jid === jid).length,
});

startLiveSync((pin) => announcer.announce(pin));
