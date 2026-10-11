// Announces new entries to everyone with the page open: rings and a "NEW" label on the
// globe, a banner across the top, and a flash on the logbook row.
//
// Announcements are queued and shown one at a time, so when several Scouts save within
// a few seconds each JID still gets its turn. When others are waiting, each turn is
// shorter so the screen doesn't fall far behind.
import type { Pin } from './api';
import { countryFor } from './countries';
import { byId, el } from './dom';
import { regionColor } from './regions';

interface AnnouncerOptions {
  /** Show the pin on the globe for this long (rings, label and, if following, flying there). */
  showOnGlobe(pin: Pin, durationMs: number): void;
  flashLogbookRow(pin: Pin): void;
  /** How many times this JID has been entered so far, including this entry. */
  timesEntered(jid: string): number;
}

const UNHURRIED_MS = 7000; // nothing else waiting
const BUSY_MS = 4000; // one or two more waiting
const RUSHED_MS = 2500; // a real pile-up

/** How long the next announcement gets, given how many are waiting behind it. */
export function turnLength(waiting: number): number {
  if (waiting === 0) return UNHURRIED_MS;
  return waiting <= 2 ? BUSY_MS : RUSHED_MS;
}

export function createAnnouncer(options: AnnouncerOptions) {
  const banner = byId('new-pin-banner');
  const queue: Pin[] = [];
  const seen = new Set<string>(); // our own saves arrive twice (the reply and the live event)
  let showing = false;

  function showNext(): void {
    const pin = queue.shift();
    if (!pin) {
      showing = false;
      banner.hidden = true;
      return;
    }
    showing = true;
    const duration = turnLength(queue.length);

    options.showOnGlobe(pin, duration);
    options.flashLogbookRow(pin);
    showBanner(pin, queue.length);
    window.setTimeout(showNext, duration);
  }

  function showBanner(pin: Pin, waiting: number): void {
    const times = options.timesEntered(pin.jid);
    const country = countryFor(pin.jid.slice(1, 3))?.name ?? '';
    const place = [pin.city, country].filter(Boolean).join(', ');

    const dot = el('span', 'dot');
    dot.style.background = regionColor(pin.jid[0]);
    const heading = el('b', '', times > 1 ? `${pin.jid} again (×${times})` : `New JID: ${pin.jid}`);
    banner.replaceChildren(dot, heading, el('span', 'place', place));
    if (pin.added_by) banner.append(el('span', 'from', `from ${pin.added_by}`));
    if (waiting > 0) banner.append(el('span', 'waiting', `+${waiting} more`));

    banner.hidden = false;
    // Restart the slide-in animation for each new banner.
    banner.classList.remove('show');
    void banner.offsetWidth;
    banner.classList.add('show');
  }

  return {
    /** Adds an entry to the queue (unless it has been announced already). */
    announce(pin: Pin): void {
      if (seen.has(pin.id)) return;
      seen.add(pin.id);
      queue.push(pin);
      if (!showing) showNext();
    },
  };
}
