// Admin mode: needed to move a JID or delete an entry.
//
// Unlocking sends the passcode to the server once. The server answers with a "session
// cookie", which the browser then attaches to every request by itself. That gives exactly
// the behaviour we want:
//  - it is shared by every tab and survives reloads;
//  - the browser throws it away when it is closed, so the device is locked again;
//  - the passcode itself is never stored in the browser.
import { ApiError, fetchAdminStatus, lockAdmin, unlockAdmin } from './api';
import { askPasscode } from './passcode-dialog';

const listeners: (() => void)[] = [];
let unlocked = false; // what we last heard from the server

function setUnlocked(next: boolean): void {
  if (next === unlocked) return;
  unlocked = next;
  for (const listener of listeners) listener();
}

// Other tabs can't see this tab unlock or lock, so each one tells the rest.
const otherTabs = new BroadcastChannel('jid-globe-admin');
otherTabs.addEventListener('message', (event) => setUnlocked(event.data === 'unlocked'));

function changeEverywhere(next: boolean): void {
  setUnlocked(next);
  otherTabs.postMessage(next ? 'unlocked' : 'locked');
}

// Ask the server where we stand when the page loads, and again whenever it comes back
// into view (the cookie may have gone, or another tab may have changed things).
async function refresh(): Promise<void> {
  try {
    setUnlocked((await fetchAdminStatus()).unlocked);
  } catch {
    // Can't reach the server: leave things as they are.
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refresh();
});
refresh();

// Earlier versions kept the passcode in the browser. Clear out any that was left behind.
localStorage.removeItem('jid-globe-admin-passcode');
sessionStorage.removeItem('jid-globe-admin-passcode');

export function isUnlocked(): boolean {
  return unlocked;
}

/** Calls `listener` whenever this device is locked or unlocked. */
export function onAdminChange(listener: () => void): void {
  listeners.push(listener);
}

export async function lock(): Promise<void> {
  try {
    await lockAdmin();
  } finally {
    changeEverywhere(false);
  }
}

/** Asks for the passcode and sends it to the server. Returns true if the device is now unlocked. */
export async function unlock(): Promise<boolean> {
  if (!(await askPasscode('Admin passcode', unlockAdmin))) return false;
  changeEverywhere(true);
  return true;
}

/**
 * Runs an admin action, asking to unlock first if need be. Returns false if the person
 * didn't unlock. If the server says we aren't unlocked after all (the browser was
 * restarted, or the passcode was changed), the page shows as locked and the error is passed on.
 */
export async function asAdmin(action: () => Promise<void>): Promise<boolean> {
  if (!unlocked && !(await unlock())) return false;
  try {
    await action();
    return true;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) changeEverywhere(false);
    throw error;
  }
}
