// The Basic / Streets / Satellite switch on the globe.
//
// "Basic" is drawn from data bundled in the app and works with no internet.
// The other two load picture tiles from the internet, straight to each device,
// so they only work where that device is online.
import { byId, setMessage } from './dom';
import type { BorderMode } from './map-layer';

export interface View {
  id: 'map' | 'streets' | 'satellite';
  /** Gives the web address of one map tile, or null for the built-in offline map. */
  tileUrl: ((x: number, y: number, zoom: number) => string) | null;
  /** Who to credit. The map providers require this to be shown. */
  credit: string;
  /** Our own town names. Street maps already have names printed on them. */
  showTownNames: boolean;
  /** 'all' and 'none' are fixed; 'optional' shows the Borders button so people can choose. */
  borders: 'all' | 'none' | 'optional';
}

export const VIEWS: View[] = [
  { id: 'map', tileUrl: null, credit: '', showTownNames: true, borders: 'all' },
  {
    id: 'streets',
    tileUrl: (x, y, zoom) => `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`,
    credit: '© OpenStreetMap contributors',
    showTownNames: false,
    borders: 'none', // already drawn on the street map
  },
  {
    id: 'satellite',
    tileUrl: (x, y, zoom) =>
      `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${y}/${x}`,
    credit: 'Imagery © Esri, Maxar, Earthstar Geographics',
    showTownNames: true,
    borders: 'optional',
  },
];

const VIEW_KEY = 'jid-globe-view';
const BORDERS_KEY = 'jid-globe-borders';
const CHECK_TIMEOUT_MS = 5000;

interface ViewActions {
  applyView(view: View): void;
  applyBorders(mode: BorderMode): void;
}

export function setupViewSwitch({ applyView, applyBorders }: ViewActions): void {
  const buttons = [...byId('view-switch').querySelectorAll<HTMLButtonElement>('button')];
  const credit = byId('map-credit');
  const message = byId('view-message');
  const bordersButton = byId<HTMLButtonElement>('borders-toggle');
  let currentView = VIEWS[0];
  let bordersOn = localStorage.getItem(BORDERS_KEY) !== 'off'; // on unless this device turned them off
  let messageTimer: number | undefined;
  let requestNumber = 0; // lets a slow internet check be ignored if another button was pressed since

  function showBorders(): void {
    const optional = currentView.borders === 'optional';
    bordersButton.hidden = !optional;
    bordersButton.classList.toggle('active', bordersOn);
    bordersButton.setAttribute('aria-pressed', String(bordersOn));
    applyBorders(optional ? (bordersOn ? 'land' : 'none') : currentView.borders === 'all' ? 'all' : 'none');
  }

  bordersButton.addEventListener('click', () => {
    bordersOn = !bordersOn;
    localStorage.setItem(BORDERS_KEY, bordersOn ? 'on' : 'off');
    showBorders();
  });

  function show(view: View): void {
    currentView = view;
    applyView(view);
    showBorders();
    for (const button of buttons) button.classList.toggle('active', button.dataset.view === view.id);
    setMessage(credit, view.credit);
    localStorage.setItem(VIEW_KEY, view.id);
  }

  function say(text: string): void {
    setMessage(message, text);
    window.clearTimeout(messageTimer);
    messageTimer = window.setTimeout(() => setMessage(message, null), 6000);
  }

  async function choose(view: View, quiet = false): Promise<void> {
    const thisRequest = ++requestNumber;
    if (view.tileUrl && !(await canLoad(view.tileUrl(0, 0, 0)))) {
      if (thisRequest === requestNumber && !quiet) {
        say('That view needs the internet, and this device can’t reach it. Staying on the Basic map.');
      }
      return;
    }
    if (thisRequest === requestNumber) show(view);
  }

  for (const button of buttons) {
    const view = VIEWS.find((v) => v.id === button.dataset.view)!;
    button.addEventListener('click', () => choose(view));
  }

  // Start on the offline map, then go back to this device's last choice if it still works.
  const saved = VIEWS.find((v) => v.id === localStorage.getItem(VIEW_KEY));
  show(VIEWS[0]);
  if (saved?.tileUrl) {
    localStorage.setItem(VIEW_KEY, saved.id); // show() just overwrote it; keep it for next time
    choose(saved, true);
  }
}

// Tries to fetch one tile to find out whether the map provider can be reached.
async function canLoad(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
    return response.ok;
  } catch {
    return false;
  }
}
