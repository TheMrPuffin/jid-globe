// The stats strip and the colour legend.
import type { Pin } from './api';
import { byId, el } from './dom';
import { countDifferentJids } from './entries';
import { REGIONS } from './regions';

export function renderStats(pins: Pin[]): void {
  const countries = new Set(pins.map((pin) => pin.jid.slice(1, 3)));
  const regions = new Set(pins.map((pin) => pin.jid[0]));
  byId('stat-total').textContent = String(countDifferentJids(pins)); // repeats count once
  byId('stat-countries').textContent = String(countries.size);
  byId('stat-regions').textContent = `${regions.size}/${REGIONS.length}`;
}

export function renderLegend(): void {
  byId('legend').replaceChildren(
    ...REGIONS.map((region) => {
      const item = el('li');
      const dot = el('span', 'dot');
      dot.style.background = region.color;
      item.append(dot, `${region.digit} ${region.name}`);
      return item;
    }),
  );
}
