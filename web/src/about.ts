// The "About" link at the bottom of every page. It opens a pop-up saying who made the
// app and whose data it uses. It is built here in code so every page gets the same one.
import { version } from '../package.json';
import { byId, el } from './dom';

const SOURCE_URL = 'https://github.com/TheMrPuffin/jid-globe';

/** One credit line: what the data is used for, then who it comes from (as a link). */
const DATA_CREDITS: { what: string; who: string; href: string; terms: string }[] = [
  { what: 'Town names', who: 'GeoNames', href: 'https://www.geonames.org/', terms: 'CC BY 4.0' },
  { what: 'Country names', who: 'world-countries', href: 'https://github.com/mledoze/countries', terms: 'ODbL 1.0' },
  { what: 'Country shapes', who: 'Natural Earth', href: 'https://www.naturalearthdata.com/', terms: 'public domain' },
  { what: 'Streets view', who: '© OpenStreetMap contributors', href: 'https://www.openstreetmap.org/copyright', terms: 'ODbL 1.0' },
  { what: 'Satellite view', who: '© Esri, Maxar, Earthstar Geographics', href: 'https://www.esri.com/', terms: 'Esri terms of use' },
];

function link(text: string, href: string): HTMLAnchorElement {
  const a = el('a', '', text);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener';
  return a;
}

/** Call once on each page. */
export function setupAbout(): void {
  byId('about-link').addEventListener('click', () => {
    const dialog = el('dialog', 'passcode-dialog about-dialog');

    const madeBy = el('p', '', 'Made by Alexander Garner (');
    madeBy.append(link('@TheMrPuffin', 'https://github.com/TheMrPuffin'), ').');

    const licence = el('p', '', 'Free to use, change and share under the MIT licence. ');
    licence.append(link('Source code on GitHub', SOURCE_URL), '.');

    const credits = el('ul');
    for (const credit of DATA_CREDITS) {
      const line = el('li', '', `${credit.what}: `);
      line.append(link(credit.who, credit.href), ` (${credit.terms})`);
      credits.append(line);
    }

    // The version built into these pages is shown straight away. The server then says
    // exactly what is running, including which build.
    const running = el('p', 'message hint', `Version ${version}`);
    fetch('/api/health')
      .then((response) => response.json())
      .then((health: { version?: string; build?: string }) => {
        if (!health.version) return;
        const build = !health.build || health.build === 'dev' ? 'dev build' : `build ${health.build}`;
        running.textContent = `Version ${health.version} (${build})`;
      })
      .catch(() => {}); // offline: the version above is still right

    const close = el('button', 'secondary', 'Close');
    close.type = 'button';
    close.addEventListener('click', () => dialog.close());

    dialog.append(
      el('h2', '', 'About JID Globe'),
      el('p', '', 'JOTA-JOTI JID codes as pins on a shared globe.'),
      madeBy,
      licence,
      el('h3', '', 'Data and maps'),
      credits,
      el('p', 'message hint', 'An independent project, not affiliated with World Scouting or JOTA-JOTI.'),
      running,
      close,
    );

    // The pop-up is made fresh each time and thrown away when it closes.
    dialog.addEventListener('close', () => dialog.remove());
    document.body.append(dialog);
    dialog.showModal();
  });
}
