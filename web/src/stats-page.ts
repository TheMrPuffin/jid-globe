// The stats dashboard: a page of its own at /stats, with no globe or sidebar.
// Good for a second screen. It updates live, like the globe page.
import { setupAbout } from './about';
import { byId, el } from './dom';
import { setupKioskLink } from './kiosk-link';
import { startLiveSync } from './live';
import {
  countriesSection,
  headlines,
  latestSection,
  mostSeenSection,
  present,
  regionsSection,
  stationsSection,
} from './stats-render';
import { store } from './store';
import { summarise } from './summary';

const dashboard = byId('dashboard');

store.subscribe((pins) => {
  const summary = summarise(pins);
  // Columns on a wide screen: regions, countries, stations (when station labels are in
  // use), and last a column with most-seen above latest. Countries stop at the top few,
  // because nobody can scroll a screen on the wall.
  const last = el('div');
  last.append(mostSeenSection(summary), latestSection(pins));
  dashboard.replaceChildren(
    headlines(summary),
    regionsSection(summary),
    countriesSection(summary),
    ...present(stationsSection(summary)),
    last,
  );
});

// Loads the pins and keeps them up to date. (This page doesn't announce new pins.)
startLiveSync(() => {});

setupKioskLink();
setupAbout();
