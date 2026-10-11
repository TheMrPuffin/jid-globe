// The links found on every page that have to take the current address into account.
import { byId } from './dom';
import { currentStation } from './station';

/**
 * Call once on each page. Sets up:
 *  - the "Kiosk mode" link, which reopens the page with ?kiosk added (hiding the links to
 *    other pages) while keeping anything else on the address. To leave kiosk mode, remove
 *    "kiosk" from the address.
 *  - the buttons to the other pages, which carry the station along, so that setting a
 *    station on one page isn't lost by moving to another.
 */
export function setupKioskLink(): void {
  refreshKioskLink();

  const station = currentStation();
  if (!station) return;
  for (const link of document.querySelectorAll<HTMLAnchorElement>('nav a, a.stats-page-link')) {
    const target = new URL(link.href);
    target.searchParams.set('station', station);
    link.href = target.pathname + target.search;
  }
}

/** Points the "Kiosk mode" link at the current address plus ?kiosk. Call again if the address changes. */
export function refreshKioskLink(): void {
  const address = new URLSearchParams(window.location.search);
  address.set('kiosk', '1');
  byId<HTMLAnchorElement>('kiosk-link').href = `${window.location.pathname}?${address}`;
}
