// The 3D globe: one point per pin and a pulsing ring for the draft pin.
// The map itself is drawn by map-layer.ts and the town names by city-labels.ts.
import Globe, { type GlobeInstance } from 'globe.gl';
import type { Pin } from './api';
import { createCityLabels } from './city-labels';
import { countryFor } from './countries';
import { countDifferentJids, groupByJid } from './entries';
import { createMapLayer, type BorderMode } from './map-layer';
import { regionColor } from './regions';
import { waitUntilSettled } from './settle';
import { stackPins } from './stacks';
import type { View } from './views';

export interface DraftMarker {
  lat: number;
  lng: number;
  region: string;
}

interface Point {
  lat: number;
  lng: number;
  color: string;
  label: string;
  pins: Pin[]; // the entries stacked on this pin; empty for the draft pin and search marker
  jidCount: number; // how many different JIDs those entries are (a repeated JID counts once)
}

/** A pin on the globe plus a summary of what it holds, used to tell whether it has changed. */
interface ShownPoint {
  contents: string;
  point: Point;
}

interface GlobeOptions {
  onClick(lat: number, lng: number): void;
  /** Called with every JID stacked on the pin that was tapped. */
  onPinClick(pins: Pin[]): void;
  /** Called whenever the globe starts or stops spinning by itself. */
  onSpinChange(spinning: boolean): void;
}

// The pin size to use above each zoom level (altitude 1 = one globe radius above the ground).
const PIN_SCALES = [
  { above: 1.2, scale: 1 },
  { above: 0.6, scale: 0.5 },
  { above: 0.3, scale: 0.25 },
  { above: 0.12, scale: 0.12 },
  { above: 0.05, scale: 0.06 },
  // The levels below are only reachable in the Streets and Satellite views.
  { above: 0.02, scale: 0.03 },
  { above: 0.008, scale: 0.012 },
  { above: 0.003, scale: 0.005 },
  { above: 0.0012, scale: 0.002 },
];
const MIN_PIN_SCALE = 0.001;

// How close the camera may get, as a fraction of the globe's radius above the ground.
const SPIN_ALTITUDE = 2.3; // the whole-globe view the page starts on
const PULL_BACK_MS = 1000;
const MIN_ALTITUDE_MAP = 0.02; // about 130 km: any closer and the offline map is just a blur
// How much sharper than the library's default the online pictures should be.
// Each step doubles the detail (and quadruples the number of picture tiles downloaded).
const EXTRA_TILE_DETAIL = 2;
const MIN_ALTITUDE_TILES = 0.0006; // about 4 km: close enough to make out streets and fields
const NEW_PIN_ALTITUDE = 0.8; // how close an idle globe flies in to show it
const MARKER_COLOR = '#ffd166';
const MARKER_MS = 8000;
const RING_RADIUS = 4; // degrees, for the pulsing ring round the draft pin

export function createGlobe(element: HTMLElement, options: GlobeOptions) {
  let allPins: Pin[] = []; // every entry, whether or not it is being shown
  let onlyJids: Set<string> | null = null; // the logbook filter's JIDs, or null for no filter
  let pinPoints: Point[] = [];
  let shownPoints = new Map<string, ShownPoint>(); // the pins on the globe now, by place
  let draftPoint: Point | null = null;
  let searchMarker: Point | null = null; // a pulsing ring where "Find a place" landed
  let markerTimer: number | undefined;
  let newPinRings: Point[] = []; // rings pulsing on pins that were just added
  let highlightKey = '';
  let pinScale = 1;
  let tilesSharpened = false;
  let currentView: View | null = null;

  const globe = new Globe(element)
    .backgroundColor('#070d1c')
    .atmosphereColor('#5aa9ff')
    .atmosphereAltitude(0.16)
    .pointLat('lat')
    .pointLng('lng')
    .pointColor('color')
    .pointLabel('label')
    .pointAltitude(pointHeight)
    .pointRadius(pointRadius)
    .pointsTransitionDuration(0)
    .ringLat('lat')
    .ringLng('lng')
    .ringColor((d: object) => (d as Point).color)
    .ringMaxRadius(() => RING_RADIUS * pinScale)
    .ringAltitude(() => Math.min(0.0015, 0.02 * pinScale))
    .ringPropagationSpeed(3)
    .ringRepeatPeriod(900)
    .onGlobeClick(({ lat, lng }) => options.onClick(lat, lng))
    .onPointClick((d, _event, { lat, lng }) => {
      const point = d as Point;
      if (point.pins.length > 0) options.onPinClick(point.pins);
      else options.onClick(lat, lng);
    });

  const mapLayer = createMapLayer(globe, element);
  globe.pointOfView({ lat: 25, lng: 10, altitude: SPIN_ALTITUDE });

  // Spin slowly until someone touches the globe.
  const controls = globe.controls();
  controls.autoRotateSpeed = 0.5;
  let spinTimer: number | undefined;
  let resumeTimer: number | undefined;
  let spinning = false; // "spinning mode": stays on while the globe pauses to show off a new pin
  let following = true; // whether a spinning globe flies to each new pin

  // Sets the globe turning, pulling back to the whole-globe view first if it is zoomed in
  // (spinning only looks right from a distance).
  function startTurning(): void {
    const { lat, lng, altitude } = globe.pointOfView();
    if (altitude < SPIN_ALTITUDE - 0.1) {
      globe.pointOfView({ lat, lng, altitude: SPIN_ALTITUDE }, PULL_BACK_MS);
      spinTimer = window.setTimeout(() => (controls.autoRotate = true), PULL_BACK_MS + 50);
    } else {
      controls.autoRotate = true;
    }
  }

  function setSpinning(on: boolean): void {
    window.clearTimeout(spinTimer);
    window.clearTimeout(resumeTimer);
    spinning = on;
    controls.autoRotate = false;
    options.onSpinChange(on);
    if (on) startTurning();
  }

  // Spin from the start, and stop as soon as someone touches the globe.
  setSpinning(true);
  controls.addEventListener('start', () => setSpinning(false));

  const setMinAltitude = (altitude: number) => (controls.minDistance = globe.getGlobeRadius() * (1 + altitude));
  setMinAltitude(MIN_ALTITUDE_MAP);

  // Pins are sized in degrees, so without this they would look enormous when zoomed in.
  // A pin holding several JIDs is drawn a little wider and a lot taller, like a stack of counters.
  function pointRadius(d: object): number {
    const count = (d as Point).jidCount;
    const base = count === 0 ? 0.4 : 0.3 * (1 + 0.12 * Math.min(count - 1, 5));
    return base * pinScale;
  }
  function pointHeight(d: object): number {
    // Tall pins stand out on the whole globe, but up close they would loom over the
    // streets like tower blocks, so they become flat discs instead.
    const flatten = pinScale < 0.06 ? 0.05 : 1;
    const count = (d as Point).jidCount;
    const base = count === 0 ? 0.07 : 0.03 * (1 + 0.5 * Math.min(count - 1, 8));
    return base * pinScale * flatten;
  }
  function rescalePins(altitude: number): void {
    const scale = PIN_SCALES.find((step) => altitude >= step.above)?.scale ?? MIN_PIN_SCALE;
    if (scale === pinScale) return;
    pinScale = scale;
    globe.pointRadius(pointRadius).pointAltitude(pointHeight);
    globe.ringMaxRadius(() => RING_RADIUS * pinScale).ringAltitude(() => Math.min(0.0015, 0.02 * pinScale));
  }

  const cityLabels = createCityLabels(globe);
  globe.onZoom(({ lat, lng, altitude }) => {
    rescalePins(altitude);
    mapLayer.setCamera(lat, lng, altitude);
    cityLabels.update(lat, lng, altitude);
  });

  // Keep the canvas the same size as its container (window resize, phone rotation).
  new ResizeObserver(() => {
    globe.width(element.clientWidth).height(element.clientHeight);
  }).observe(element);

  function refreshPoints(): void {
    globe.pointsData(draftPoint ? [...pinPoints, draftPoint] : pinPoints);
    globe.ringsData([draftPoint, searchMarker, ...newPinRings].filter((point) => point !== null));
  }

  // Puts the pins on the globe: all of them, or just the ones the logbook filter leaves.
  function drawPins(): void {
    const filter = onlyJids;
    const pins = filter ? allPins.filter((pin) => filter.has(pin.jid)) : allPins;

    // The globe library rebuilds the 3D shape for any pin whose object is new, and leaves
    // alone any pin whose object it has seen before. So a pin that hasn't changed must be
    // handed back as the very same object, or every new entry would rebuild every pin.
    const stillShown = new Map<string, ShownPoint>();
    pinPoints = stackPins(pins).map((stack) => {
      const contents = stack.pins.map((pin) => `${pin.id}:${pin.city ?? ''}`).join('|');
      const before = shownPoints.get(stack.key);
      const shown: ShownPoint =
        before?.contents === contents
          ? before
          : {
              contents,
              point: {
                lat: stack.lat,
                lng: stack.lng,
                color: regionColor(stack.pins[0].jid[0]),
                label: stackLabel(stack.pins),
                pins: stack.pins,
                jidCount: countDifferentJids(stack.pins),
              },
            };
      stillShown.set(stack.key, shown);
      return shown.point;
    });
    shownPoints = stillShown;
    refreshPoints();
    // A number badge on every pin that holds more than one JID.
    cityLabels.setBadges(
      pinPoints
        .filter((point) => point.jidCount > 1)
        .map((point) => ({ lat: point.lat, lng: point.lng, count: point.jidCount })),
    );
  }

  // Colours in the countries that have at least one pin.
  function refreshHighlights(pins: Pin[]): void {
    const ids = new Set<string>();
    for (const pin of pins) {
      const country = countryFor(pin.jid.slice(1, 3));
      if (country) ids.add(country.numericCode);
    }
    const key = [...ids].sort().join(',');
    if (key === highlightKey) return;
    highlightKey = key;
    mapLayer.paint(ids);
  }

  return {
    /** Switches between the offline map and the online street / satellite pictures. */
    setView(view: View): void {
      currentView = view;
      if (view.tileUrl && !tilesSharpened) {
        tilesSharpened = sharpenTiles(globe);
        if (!tilesSharpened) {
          // The library sets up its tile layer a moment after the page loads. Try again shortly.
          window.setTimeout(() => currentView === view && this.setView(view), 100);
          return;
        }
      }
      globe.globeTileEngineClearCache(); // throw away the previous view's pictures first
      // The library's types don't mention it, but passing null turns the tiles back off.
      globe.globeTileEngineUrl(view.tileUrl as (x: number, y: number, level: number) => string);
      setMinAltitude(view.tileUrl ? MIN_ALTITUDE_TILES : MIN_ALTITUDE_MAP);
      cityLabels.setEnabled(view.showTownNames);
    },

    setBorders(mode: BorderMode): void {
      mapLayer.setBorders(mode);
    },

    setPins(pins: Pin[]): void {
      allPins = pins;
      drawPins();
      refreshHighlights(pins);
    },

    /**
     * Shows only the pins for these JIDs (used when the logbook is filtered), or every pin
     * when given null. The countries coloured in on the map are not affected.
     */
    showOnlyJids(jids: Set<string> | null): void {
      if (jids === null && onlyJids === null) return;
      onlyJids = jids;
      drawPins();
    },

    setDraft(draft: DraftMarker | null): void {
      draftPoint = draft && { lat: draft.lat, lng: draft.lng, color: '#ffffff', label: '', pins: [], jidCount: 0 };
      refreshPoints();
    },

    flyTo(lat: number, lng: number, altitude: number): void {
      setSpinning(false);
      globe.pointOfView({ lat, lng, altitude }, 1000);
    },

    setSpinning,

    /**
     * Draws attention to a pin that has just been added: rings pulse out from it and a
     * "NEW" label pops up. If this globe is in spinning mode with "follow" on, it also
     * flies there, holds until the time is up, then goes back to turning (unless the next
     * new pin arrives first, in which case it flies straight on to that one).
     */
    showNewPin(pin: Pin, durationMs: number): void {
      const ring: Point = { lat: pin.lat, lng: pin.lng, color: regionColor(pin.jid[0]), label: '', pins: [], jidCount: 0 };
      const label = { lat: pin.lat, lng: pin.lng, newJid: pin.jid };
      newPinRings = [...newPinRings, ring];
      refreshPoints();
      cityLabels.addNewLabel(label);
      window.setTimeout(() => {
        newPinRings = newPinRings.filter((other) => other !== ring);
        refreshPoints();
        cityLabels.removeNewLabel(label);
      }, durationMs);

      if (spinning && following) {
        // Pause the turning (spinning mode itself stays on), fly in, then carry on.
        window.clearTimeout(spinTimer);
        window.clearTimeout(resumeTimer);
        controls.autoRotate = false;
        globe.pointOfView({ lat: pin.lat, lng: pin.lng, altitude: NEW_PIN_ALTITUDE }, 1000);
        resumeTimer = window.setTimeout(startTurning, durationMs);
      }
    },

    /** Chooses whether a spinning globe flies to each new pin, or just keeps turning. */
    setFollowing(on: boolean): void {
      following = on;
      // If it was switched off part-way through showing a pin, go straight back to turning.
      if (!on && spinning && !controls.autoRotate) {
        window.clearTimeout(resumeTimer);
        window.clearTimeout(spinTimer);
        startTurning();
      }
    },

    /** Pulses a ring at a place for a few seconds, to show where a search landed. */
    showMarker(lat: number, lng: number): void {
      window.clearTimeout(markerTimer);
      searchMarker = { lat, lng, color: MARKER_COLOR, label: '', pins: [], jidCount: 0 };
      refreshPoints();
      markerTimer = window.setTimeout(() => {
        searchMarker = null;
        refreshPoints();
      }, MARKER_MS);
    },
  };
}

// By default the library stretches one small picture tile across most of the screen,
// which looks blurry. It decides which detail level to load from a list of camera
// heights called "thresholds"; raising those makes it switch to finer tiles sooner.
// The library has no official setting for this, so we find its tile layer and adjust it
//
// While we are there, we also make it wait for the globe to settle before downloading.
// Otherwise, zooming in downloads every detail level on the way, and the tiles you
// actually want queue up behind hundreds you have already flown past.
// Returns true once the tile layer has been found and adjusted.
function sharpenTiles(globe: GlobeInstance): boolean {
  let found = false;
  globe.scene().traverse((object) => {
    const tileLayer = object as { thresholds?: number[]; updatePov?: (camera: unknown) => void };
    if (Array.isArray(tileLayer.thresholds) && tileLayer.updatePov) {
      tileLayer.thresholds = tileLayer.thresholds.map((height) => height * 2 ** EXTRA_TILE_DETAIL);
      tileLayer.updatePov = waitUntilSettled(tileLayer.updatePov.bind(tileLayer), 150, 1200);
      found = true;
    }
  });
  return found;
}

const MAX_JIDS_IN_LABEL = 8;

// The pop-up shown when a mouse hovers over a pin.
function stackLabel(pins: Pin[]): string {
  const newest = pins[0];
  const country = countryFor(newest.jid.slice(1, 3))?.name ?? '';
  const place = escapeHtml([newest.city, country].filter(Boolean).join(', '));

  // "5GB12A" or, if it was entered more than once, "5GB12A ×3".
  const names = groupByJid(pins).map(({ jid, entries }) =>
    entries.length > 1 ? `${escapeHtml(jid)} ×${entries.length}` : escapeHtml(jid),
  );

  if (names.length === 1) {
    const lines = [`<b>${names[0]}</b>`, place];
    if (newest.note) lines.push(escapeHtml(newest.note));
    return `<div class="globe-tip">${lines.join('<br>')}</div>`;
  }

  const shown = names.slice(0, MAX_JIDS_IN_LABEL);
  if (names.length > MAX_JIDS_IN_LABEL) shown.push(`and ${names.length - MAX_JIDS_IN_LABEL} more`);
  return `<div class="globe-tip"><b>${names.length} JIDs</b><br>${place}<br>${shown.join('<br>')}</div>`;
}

// Notes and nicknames are typed by users, so they must never be treated as HTML.
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}
