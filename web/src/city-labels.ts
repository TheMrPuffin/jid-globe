// The small pieces of text drawn on top of the globe:
//  - town and city names, once you zoom in. The closer you get, the smaller the area
//    we ask about, so smaller towns start to appear.
//  - a number badge on any pin that holds more than one JID.
//  - a "NEW" label that pops up for a few seconds on a pin that has just been added.
import type { GlobeInstance } from 'globe.gl';
import { fetchNearbyCities, type City } from './api';
import { el } from './dom';

const SHOW_BELOW_ALTITUDE = 1; // further out than this there is no room for names
const DEGREES_PER_ALTITUDE = 20; // roughly how far the view reaches for each unit of altitude
const WAIT_MS = 250; // wait for the globe to stop moving before asking the server

/** A number to show on a pin that holds several JIDs. */
export interface Badge {
  lat: number;
  lng: number;
  count: number;
}

/** A label announcing a JID that has just been added. */
export interface NewLabel {
  lat: number;
  lng: number;
  newJid: string;
}

const badgeKey = (badge: Badge) => `${badge.lat},${badge.lng},${badge.count}`;

export function createCityLabels(globe: GlobeInstance) {
  // Reusing the same object for a city we already show stops its label flickering.
  let shown = new Map<number, City>();
  let timer: number | undefined;
  let requestNumber = 0;
  let lastView = '';
  let enabled = true;
  let badges: Badge[] = [];
  let newLabels: NewLabel[] = [];

  globe
    .htmlLat('lat')
    .htmlLng('lng')
    .htmlAltitude(0)
    .htmlTransitionDuration(0)
    .htmlElement((d) => {
      if ('newJid' in d) {
        const label = el('div', 'pin-new');
        label.append(el('b', '', `NEW  ${(d as NewLabel).newJid}`));
        return label;
      }
      if ('count' in d) {
        const badge = el('div', 'pin-badge');
        badge.append(el('b', '', String((d as Badge).count)));
        return badge;
      }
      const label = el('div', 'city-label');
      label.append(el('i'), el('span', '', (d as City).name));
      return label;
    });

  function show(cities: City[]): void {
    shown = new Map(cities.map((city) => [city.geonameid, shown.get(city.geonameid) ?? city]));
    render();
  }

  function render(): void {
    globe.htmlElementsData([...shown.values(), ...badges, ...newLabels]);
  }

  async function load(lat: number, lng: number, altitude: number): Promise<void> {
    const thisRequest = ++requestNumber;
    try {
      const cities = await fetchNearbyCities(lat, lng, altitude * DEGREES_PER_ALTITUDE);
      if (thisRequest === requestNumber) show(cities);
    } catch {
      // Labels are a nice extra; if the server can't be reached just keep the old ones.
    }
  }

  return {
    /** Badges are always shown, whatever the zoom level and whether names are on or off. */
    setBadges(next: Badge[]): void {
      // As with town names, reuse the object for a badge that hasn't changed so that
      // its label on the globe is left alone instead of being rebuilt.
      const before = new Map(badges.map((badge) => [badgeKey(badge), badge]));
      badges = next.map((badge) => before.get(badgeKey(badge)) ?? badge);
      render();
    },

    /** Shows a "NEW" label, which the caller removes again after a few seconds. */
    addNewLabel(label: NewLabel): void {
      newLabels = [...newLabels, label];
      render();
    },
    removeNewLabel(label: NewLabel): void {
      newLabels = newLabels.filter((other) => other !== label);
      render();
    },

    /** Turns the names on or off. They come back the next time the globe moves. */
    setEnabled(on: boolean): void {
      enabled = on;
      lastView = '';
      if (!on) {
        window.clearTimeout(timer);
        requestNumber++;
        show([]);
      } else {
        const { lat, lng, altitude } = globe.pointOfView();
        this.update(lat, lng, altitude);
      }
    },

    /** Call whenever the camera moves. */
    update(lat: number, lng: number, altitude: number): void {
      window.clearTimeout(timer);
      if (!enabled || altitude > SHOW_BELOW_ALTITUDE) {
        requestNumber++;
        lastView = '';
        if (shown.size > 0) show([]);
        return;
      }
      // The globe keeps drifting very slightly after a move; don't ask again for the same view.
      const view = `${lat.toFixed(2)},${lng.toFixed(2)},${altitude.toFixed(3)}`;
      if (view === lastView) return;
      timer = window.setTimeout(() => {
        lastView = view;
        load(lat, lng, altitude);
      }, WAIT_MS);
    },
  };
}
