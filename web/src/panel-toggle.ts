// The small tab on the edge of the globe that hides or shows the side panel
// (the form and logbook), giving the globe the whole screen. Remembered per device.
import { byId } from './dom';

const PANEL_KEY = 'jid-globe-panel';

export function setupPanelToggle(): void {
  const app = byId('app');
  const button = byId<HTMLButtonElement>('panel-toggle');
  // On a phone the panel is underneath the globe instead of beside it, so the arrows point up and down.
  const stacked = window.matchMedia('(max-width: 800px)');
  let hidden = localStorage.getItem(PANEL_KEY) === 'hidden';

  function show(): void {
    app.classList.toggle('panel-hidden', hidden);
    const arrows = stacked.matches ? { hide: '▾', show: '▴' } : { hide: '›', show: '‹' };
    button.textContent = hidden ? arrows.show : arrows.hide;
    const label = hidden ? 'Show the side panel' : 'Hide the side panel';
    button.setAttribute('aria-label', label);
    button.title = label;
    button.setAttribute('aria-expanded', String(!hidden));
  }

  button.addEventListener('click', () => {
    hidden = !hidden;
    localStorage.setItem(PANEL_KEY, hidden ? 'hidden' : 'shown');
    show();
  });
  stacked.addEventListener('change', show);
  show();
}
