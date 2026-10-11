// The stats pop-up on the globe page: the numbers that don't fit in the sidebar.
// It is redrawn whenever the pins change, so it stays up to date while open.
// (The same stats are also available as a page of their own: see stats-page.ts.)
import type { Pin } from './api';
import { byId, el } from './dom';
import { countriesSection, headlines, mostSeenSection, present, regionsSection, stationsSection } from './stats-render';
import { summarise } from './summary';

export function setupStatsView() {
  const dialog = byId<HTMLDialogElement>('stats-dialog');
  const body = byId('stats-body');
  let pins: Pin[] = [];
  let showAllCountries = false; // the pop-up starts with just the top countries each time it opens

  byId('stats-open').addEventListener('click', () => {
    showAllCountries = false;
    draw();
    dialog.showModal();
  });
  byId('stats-close').addEventListener('click', () => dialog.close());
  // Clicking the dark area outside the panel closes it too.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  function draw(): void {
    const summary = summarise(pins);
    // Two columns on a wide screen: regions and most-seen on the left, countries on the right.
    const left = el('div');
    left.append(regionsSection(summary), mostSeenSection(summary), ...present(stationsSection(summary)));
    const countries = countriesSection(summary, {
      showAll: showAllCountries,
      onToggle() {
        showAllCountries = !showAllCountries;
        draw();
      },
    });
    body.replaceChildren(headlines(summary), left, countries);
  }

  return {
    setPins(next: Pin[]): void {
      pins = next;
      if (dialog.open) draw();
    },
  };
}
