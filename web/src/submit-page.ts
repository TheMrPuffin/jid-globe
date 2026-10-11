// The submit page at /submit: just the JID form, with no globe. Handy on a phone,
// or for a laptop where people queue up to type their codes in.
import { setupAbout } from './about';
import type { Pin } from './api';
import { countryFor } from './countries';
import { byId, setMessage } from './dom';
import { setupForm } from './form';
import { setupKioskLink } from './kiosk-link';
import { startLiveSync } from './live';
import { currentStation } from './station';
import { setupStationLink } from './station-link';
import { store } from './store';

const savedMessage = byId('saved-message');
const SAVED_MESSAGE_MS = 8000;
let savedTimer: number | undefined;

// Shows which machine this is, so whoever sets the room up can check each one at a glance.
const station = currentStation();
setMessage(byId('station-label'), station ? `This machine: ${station}` : null);

const form = setupForm({
  canPickSpot: false, // that needs a globe to tap on
  // No globe here, so there is nothing to move or fly.
  onDraftChange() {},
  onPickModeChange() {},
  entriesFor: (jid) => store.pins.filter((pin) => pin.jid === jid),
  onSaved(pin) {
    store.add(pin);
    confirmSaved(pin);
  },
  onMoved() {},
});

function confirmSaved(pin: Pin): void {
  const times = store.pins.filter((other) => other.jid === pin.jid).length;
  const country = countryFor(pin.jid.slice(1, 3))?.name ?? '';
  const place = [pin.city, country].filter(Boolean).join(', ');
  const counted = times > 1 ? ` That's ${times} times it has been entered.` : '';
  setMessage(savedMessage, `✓ Saved ${pin.jid} (${place}).${counted}`);

  window.clearTimeout(savedTimer);
  savedTimer = window.setTimeout(() => setMessage(savedMessage, null), SAVED_MESSAGE_MS);
  // Ready for the next code straight away.
  byId<HTMLInputElement>('jid').focus();
}

store.subscribe(() => form.refresh());

// Loads the pins and keeps them up to date, so a JID that is already logged is spotted.
startLiveSync(() => {});

setupKioskLink();
setupStationLink();
setupAbout();
