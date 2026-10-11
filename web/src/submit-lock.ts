// The optional lock on adding JIDs (switched on with SUBMIT_LOCK on the server).
//
// When it is on, a device has to be unlocked once with the submit passcode before the
// form will work. It behaves like the admin unlock (see admin.ts): the server hands back
// a session cookie that every tab shares and the browser drops when it closes.
// A device that is unlocked for admin can always add JIDs as well.
import { onAdminChange } from './admin';
import { fetchSubmitStatus, lockSubmit, unlockSubmit } from './api';
import { askPasscode } from './passcode-dialog';

const listeners: (() => void)[] = [];
// What we last heard from the server. Until we hear, assume nothing is locked.
let lockInUse = false;
let unlocked = true;

function update(next: { locked: boolean; unlocked: boolean }): void {
  if (next.locked === lockInUse && next.unlocked === unlocked) return;
  lockInUse = next.locked;
  unlocked = next.unlocked;
  for (const listener of listeners) listener();
}

/** Asks the server whether this device may add JIDs. */
export async function refreshSubmitLock(): Promise<void> {
  try {
    update(await fetchSubmitStatus());
  } catch {
    // Can't reach the server: leave things as they are.
  }
}

// Other tabs can't see this tab unlock or lock, so each one tells the rest to check again.
const otherTabs = new BroadcastChannel('jid-globe-submit');
otherTabs.addEventListener('message', refreshSubmitLock);

async function changedHere(): Promise<void> {
  await refreshSubmitLock();
  otherTabs.postMessage('changed');
}

// Check when the page loads, when it comes back into view, and when admin is locked or unlocked.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshSubmitLock();
});
onAdminChange(refreshSubmitLock);
refreshSubmitLock();

/** True if the server has the submit lock switched on at all. */
export function submitLockInUse(): boolean {
  return lockInUse;
}

/** True if this device can't add JIDs until it is unlocked. */
export function isSubmitLocked(): boolean {
  return lockInUse && !unlocked;
}

/** Calls `listener` whenever the answer to either question above changes. */
export function onSubmitLockChange(listener: () => void): void {
  listeners.push(listener);
}

/** Asks for the passcode and sends it to the server. Returns true if the device can now add JIDs. */
export async function unlockSubmitting(): Promise<boolean> {
  if (!(await askPasscode('Passcode for adding JIDs', unlockSubmit))) return false;
  await changedHere();
  return !isSubmitLocked();
}

export async function lockSubmitting(): Promise<void> {
  try {
    await lockSubmit();
  } finally {
    await changedHere();
  }
}
