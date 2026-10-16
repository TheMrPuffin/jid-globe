// The "Add a JID" form: live decoding, city autocomplete, picking a spot, saving.
//
// A JID is one station, so it has one place. That gives the form three situations:
//  - a new JID: choose where it goes (country centre, a city, or a picked spot);
//  - a JID that is already logged: the place is fixed, saving just counts it again;
//  - moving a JID (started from the logbook, needs the admin passcode): choose a new place.
//
// The form is used on two pages: the globe page and the submit page (which has no globe).
import { asAdmin, isUnlocked as adminIsUnlocked, onAdminChange } from './admin';
import { ApiError, createPin, moveJid, searchCities, type City, type Pin, type Placement } from './api';
import { byId, el, setMessage } from './dom';
import { parseJid, type JidResult } from './jid';
import { currentStation } from './station';
import {
  isSubmitLocked,
  lockSubmitting,
  onSubmitLockChange,
  refreshSubmitLock,
  submitLockInUse,
  unlockSubmitting,
} from './submit-lock';

/** The pin being prepared, before it is saved. */
export interface Draft {
  jid: string;
  lat: number;
  lng: number;
  placement: Placement;
  cityName: string | null;
}

interface FormOptions {
  /** Whether "Pick exact spot" is offered. Leave it out on a page with no globe to tap on. */
  canPickSpot?: boolean;
  /** Called whenever the draft pin moves or disappears. `flyAltitude` is set when the globe should fly there. */
  onDraftChange(draft: Draft | null, flyAltitude?: number): void;
  onPickModeChange(picking: boolean): void;
  /** Every time this JID has already been entered (empty if it is new). */
  entriesFor(jid: string): Pin[];
  onSaved(pin: Pin): void;
  onMoved(pins: Pin[]): void;
}

const NEEDS_JID = 'Type a JID first'; // shown in boxes that can't be used yet
const COUNTRY_ALTITUDE = 1.7;
const CITY_ALTITUDE = 0.25;
const EXISTING_ALTITUDE = 0.5;

export function setupForm(options: FormOptions) {
  const form = byId<HTMLFormElement>('add-form');
  const title = byId('form-title');
  const jidInput = byId<HTMLInputElement>('jid');
  const decodeBox = byId('decode');
  const jidError = byId('jid-error');
  const jidDuplicate = byId('jid-duplicate');
  const cityInput = byId<HTMLInputElement>('city');
  const cityList = byId('city-list');
  const cityNone = byId('city-none');
  const pickButton = byId<HTMLButtonElement>('pick');
  const placeSummary = byId('place-summary');
  const noteInput = byId<HTMLInputElement>('note');
  const saveButton = byId<HTMLButtonElement>('save');
  const cancelMoveButton = byId<HTMLButtonElement>('cancel-move');
  const saveError = byId('save-error');
  const lockBox = byId('submit-lock');
  const unlockButton = byId<HTMLButtonElement>('submit-unlock');
  const relockButton = byId<HTMLButtonElement>('submit-relock');

  const canPickSpot = options.canPickSpot ?? true;

  let parsed: JidResult = parseJid('');
  let draft: Draft | null = null;
  let moving = false; // true while choosing a new place for a JID that is already logged
  let picking = false;
  let saving = false;
  let searchTimer: number | undefined;
  let searchNumber = 0; // lets us ignore replies to out-of-date searches

  /** The place this JID already has, if it has been entered before. */
  const existingEntry = (jid: string): Pin | undefined => options.entriesFor(jid)[0];

  /** True when the place can't be changed: the JID is already logged and we aren't moving it. */
  const placeIsFixed = () => draft !== null && !moving && existingEntry(draft.jid) !== undefined;

  // ---- Submit lock ---------------------------------------------------------
  // If the server has SUBMIT_LOCK on, the form is replaced by an "unlock" box until this
  // device has been unlocked with the submit passcode (see submit-lock.ts).

  function showLockState(): void {
    const locked = isSubmitLocked();
    form.classList.toggle('locked', locked);
    lockBox.hidden = !locked;
    // Offer to lock again, except on an admin device (which can always add anyway).
    relockButton.hidden = !submitLockInUse() || locked || adminIsUnlocked();
  }

  unlockButton.addEventListener('click', async () => {
    if (await unlockSubmitting()) jidInput.focus();
  });
  relockButton.addEventListener('click', lockSubmitting);
  onSubmitLockChange(showLockState);
  onAdminChange(showLockState);
  showLockState();

  // Draw the four placeholder chips straight away, before anything has been typed.
  renderDecode();

  // ---- JID input -----------------------------------------------------------

  jidInput.addEventListener('input', () => {
    parsed = parseJid(jidInput.value);
    renderDecode();
    setMessage(jidError, parsed.error);
    setMessage(saveError, null);

    if (!parsed.valid || !parsed.country) {
      clearCity();
      setPicking(false);
      setDraft(null);
    } else if (draft?.jid !== parsed.jid) {
      startDraft(parsed.jid);
    }
    refreshControls();
  });

  // Sets up the draft for a freshly typed JID: at its existing place if it has one,
  // otherwise in the middle of its country.
  function startDraft(jid: string): void {
    setPicking(false);
    clearCity();
    const existing = existingEntry(jid);
    if (existing) {
      cityInput.value = existing.city ?? '';
      setDraft(draftAt(existing), EXISTING_ALTITUDE);
    } else {
      setDraft(countryDraft(), COUNTRY_ALTITUDE);
    }
  }

  // The row of chips under the JID box. There are always four, one for each part of a
  // JID. A part that hasn't been typed yet shows as a faint placeholder saying what goes
  // there, so the row explains the format and nothing jumps about as you type.
  function renderDecode(): void {
    const parts: { code: string | undefined; name: string; waiting: string; flexible?: boolean }[] = [
      { code: parsed.region?.digit, name: parsed.region?.name ?? '', waiting: 'Region' },
      { code: parsed.country?.code, name: parsed.country?.name ?? '', waiting: 'Country', flexible: true },
      { code: parsed.bingo ?? undefined, name: '', waiting: 'Number' },
      { code: parsed.suffix ?? undefined, name: '', waiting: 'Suffix' },
    ];

    decodeBox.replaceChildren(
      ...parts.map((part) => {
        // The country chip is the one allowed to shrink (with "...") if the row gets tight.
        const chip = el('span', part.flexible ? 'chip flexible' : 'chip');
        if (part.code) {
          chip.append(el('b', '', part.code));
          if (part.name) {
            chip.append(el('span', '', part.name));
            chip.title = part.name;
          }
        } else {
          chip.classList.add('waiting');
          chip.textContent = part.waiting;
        }
        return chip;
      }),
    );
  }

  function countryDraft(): Draft {
    const country = parsed.country!;
    return { jid: parsed.jid, lat: country.lat, lng: country.lng, placement: 'country', cityName: null };
  }

  function draftAt(pin: Pin): Draft {
    return { jid: pin.jid, lat: pin.lat, lng: pin.lng, placement: pin.placement, cityName: pin.city };
  }

  // ---- Draft pin -----------------------------------------------------------

  function setDraft(next: Draft | null, flyAltitude?: number): void {
    draft = next;
    options.onDraftChange(draft, flyAltitude);
    refreshControls();
  }

  function refreshControls(): void {
    const ready = draft !== null;
    const fixed = placeIsFixed();

    title.textContent = moving && draft ? `Move ${draft.jid}` : 'Add a JID';
    jidInput.readOnly = moving;
    cityInput.disabled = !ready || fixed;
    cityInput.placeholder = ready ? `City or town in ${parsed.country!.name}` : NEEDS_JID;
    pickButton.hidden = !canPickSpot;
    pickButton.disabled = !ready || fixed;
    // A note belongs to an entry, so it needs a JID, and moving doesn't add an entry.
    noteInput.disabled = !ready || moving;
    noteInput.placeholder = ready ? 'e.g. Met on ScoutLink' : NEEDS_JID;
    cancelMoveButton.hidden = !moving;
    saveButton.disabled = !ready || saving;
    saveButton.textContent = saving ? 'Saving…' : moving ? 'Move pin' : fixed ? 'Save (count it again)' : 'Save pin';

    setMessage(jidDuplicate, draft && !moving ? repeatMessage(draft.jid) : null);
    setMessage(placeSummary, draft ? describePlace(draft, fixed) : null);
  }

  function repeatMessage(jid: string): string | null {
    const times = options.entriesFor(jid).length;
    if (times === 0) return null;
    return `${jid} has already been entered ${times === 1 ? 'once' : `${times} times`}. Saving will count it again.`;
  }

  function describePlace(d: Draft, fixed: boolean): string {
    const where =
      d.placement === 'city'
        ? `on ${d.cityName}`
        : d.placement === 'manual'
          ? `on the picked spot (${d.lat.toFixed(2)}, ${d.lng.toFixed(2)})`
          : `in the middle of ${parsed.country!.name}`;
    if (fixed) return `Its pin is ${where}. A leader can move it from the logbook.`;
    if (moving) return `The pin will move to: ${where.replace(/^(on|in) /, '')}.`;
    if (d.placement === 'country') {
      const how = canPickSpot ? 'Add a city or town, or pick a spot,' : 'Add a city or town';
      return `Pin goes ${where}. ${how} to be more exact.`;
    }
    return `Pin goes ${where}.`;
  }

  // ---- City autocomplete ---------------------------------------------------

  cityInput.addEventListener('input', () => {
    if (!draft) return;
    // Editing the text after choosing a city un-chooses it.
    if (draft.placement === 'city') setDraft(countryDraft());

    window.clearTimeout(searchTimer);
    cityNone.hidden = true;
    const query = cityInput.value.trim();
    if (!query) return hideCityList();
    searchTimer = window.setTimeout(() => runCitySearch(query), 150);
  });

  // Close the list when focus leaves the city field and its suggestions.
  cityInput.parentElement!.addEventListener('focusout', (event) => {
    const next = (event as FocusEvent).relatedTarget as Node | null;
    if (!next || !cityInput.parentElement!.contains(next)) hideCityList();
  });

  async function runCitySearch(query: string): Promise<void> {
    const thisSearch = ++searchNumber;
    const countryCode = parsed.country!.code;
    let cities: City[] = [];
    try {
      cities = await searchCities(countryCode, query);
    } catch {
      // Autocomplete is optional, so a failed search just shows no matches.
    }
    if (thisSearch !== searchNumber || !draft) return;
    showCityList(cities);
  }

  function showCityList(cities: City[]): void {
    // "No city found" is a plain hint below the field, so it never covers the Pick button.
    cityNone.hidden = cities.length > 0;
    cityList.hidden = cities.length === 0;
    cityList.replaceChildren(
      ...cities.map((city) => {
        const button = el('button');
        button.type = 'button';
        button.append(el('span', '', city.name), el('small', '', `pop. ${city.population.toLocaleString()}`));
        button.addEventListener('click', () => chooseCity(city));
        const item = el('li');
        item.append(button);
        return item;
      }),
    );
  }

  function chooseCity(city: City): void {
    if (!draft) return;
    cityInput.value = city.name;
    hideCityList();
    setPicking(false);
    setDraft({ ...draft, lat: city.lat, lng: city.lng, placement: 'city', cityName: city.name }, CITY_ALTITUDE);
  }

  function hideCityList(): void {
    searchNumber++;
    window.clearTimeout(searchTimer);
    cityList.hidden = true;
    cityList.replaceChildren();
  }

  function clearCity(): void {
    cityInput.value = '';
    cityNone.hidden = true;
    hideCityList();
  }

  // ---- Pick exact spot -----------------------------------------------------

  pickButton.addEventListener('click', () => setPicking(!picking));

  function setPicking(on: boolean): void {
    if (picking === on) return;
    picking = on;
    pickButton.classList.toggle('active', on);
    pickButton.textContent = on ? 'Cancel picking' : 'Pick exact spot';
    options.onPickModeChange(on);
  }

  // ---- Saving and moving ---------------------------------------------------

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!draft || saving) return;

    // With a hand-picked spot, keep whatever city name was typed as a label.
    const city = draft.placement === 'manual' ? cityInput.value.trim() || null : draft.cityName;
    const place = { lat: draft.lat, lng: draft.lng, placement: draft.placement, city };
    const jid = draft.jid;

    saving = true;
    setMessage(saveError, null);
    refreshControls();
    try {
      if (moving) {
        const done = await asAdmin(async () => options.onMoved(await moveJid(jid, place)));
        if (done) reset();
      } else {
        // `added_by` records which machine this came from, if the address has ?station=... on it.
        const pin = await createPin({ jid, ...place, note: noteInput.value.trim() || null, added_by: currentStation() });
        options.onSaved(pin);
        reset();
      }
    } catch (error) {
      setMessage(saveError, error instanceof Error ? error.message : 'Could not save.');
      // The server says this device isn't allowed to add (the browser was restarted, or
      // the passcode was changed), so check again and show the unlock box.
      if (error instanceof ApiError && error.status === 401) await refreshSubmitLock();
    } finally {
      saving = false;
      refreshControls();
    }
  });

  cancelMoveButton.addEventListener('click', reset);

  // Empties the form, ready for the next JID.
  function reset(): void {
    moving = false;
    jidInput.value = '';
    noteInput.value = '';
    parsed = parseJid('');
    renderDecode();
    setMessage(jidError, null);
    setMessage(saveError, null);
    clearCity();
    setPicking(false);
    setDraft(null);
  }

  return {
    get picking(): boolean {
      return picking;
    },

    /** Called when the globe is tapped while "Pick exact spot" is on. */
    setManualSpot(lat: number, lng: number): void {
      if (!draft) return;
      setPicking(false);
      setDraft({ ...draft, lat, lng, placement: 'manual' });
    },

    /** Starts choosing a new place for a JID that is already logged (from the logbook's Move button). */
    startMove(pin: Pin): void {
      reset();
      moving = true;
      jidInput.value = pin.jid;
      parsed = parseJid(pin.jid);
      renderDecode();
      cityInput.value = pin.city ?? '';
      setDraft(draftAt(pin), EXISTING_ALTITUDE);
      form.scrollIntoView({ block: 'start', behavior: 'smooth' });
    },

    /** Called when the list of pins changes (maybe from another device). */
    refresh(): void {
      // If someone else has just logged the JID being typed here, snap to the place they gave it.
      const existing = draft && !moving ? existingEntry(draft.jid) : undefined;
      if (draft && existing && (existing.lat !== draft.lat || existing.lng !== draft.lng)) {
        setPicking(false);
        clearCity();
        cityInput.value = existing.city ?? '';
        setDraft(draftAt(existing));
      }
      refreshControls();
    },
  };
}
