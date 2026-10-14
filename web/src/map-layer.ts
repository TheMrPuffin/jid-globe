// Draws the built-in ("Basic") world map onto the globe.
//
// Zoomed out: the countries are painted onto one flat image (like a wall map) wrapped
// round the sphere, with the borders as a single set of lines on top. That is far
// lighter than building a 3D shape per country, so it starts instantly.
//
// Zoomed in: one image for the whole world isn't sharp enough, so the part of the world
// being looked at is repainted into a second image at full sharpness, borders included,
// and laid over the top as a "detail patch". Because the colours and borders are painted
// together, they always line up.
import type { GlobeInstance } from 'globe.gl';
import {
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  LinearFilter,
  Mesh,
  MeshPhongMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
} from 'three';
import { feature, mesh } from 'topojson-client';
import worldData from 'world-atlas/countries-50m.json';
import { waitUntilSettled } from './settle';
import { lngStep, unwrapRing, type LngLat, type UnwrappedRing } from './unwrap';

const OCEAN = '#0c1c3a';
const LAND = '#22406a';
const LAND_WITH_PIN = '#2c8a6b';
const BORDER = '#6f93c9';
const BORDER_ON_PHOTO = '#fff3b0'; // pale yellow shows up against both land and sea

// Whole-world image width in pixels (the height is half). 4096 is safe on every phone;
// computers with a mouse get double that.
const PHONE_WIDTH = 4096;
const COMPUTER_WIDTH = 8192;

// The detail patch.
const DETAIL_HEIGHT = 2048; // image size in pixels
const DETAIL_MAX_WIDTH = 4096;
const DETAIL_LIFT = 0.0003; // how far above the whole-world image it sits, so it always wins
// Repainting the patch and sending it to the graphics card is the expensive part, so it
// is painted this many times bigger than the screen and then left alone while you drag
// around inside it. It is only repainted when the view reaches its edge, or when you
// have zoomed in or out by more than REPAINT_ZOOM since it was painted.
const DETAIL_COVERAGE = 2;
const REPAINT_ZOOM = 1.4;
const VIEW_DEGREES_PER_ALTITUDE = 30; // roughly how far up/down the screen reaches

// The border lines float just above the surface so they aren't buried in it. They are built
// at BUILD_ALTITUDE and then lowered as the camera comes closer (see setCamera).
const BUILD_ALTITUDE = 0.001;
const MIN_BORDER_ALTITUDE = 0.00001;
const MAX_STEP = 0.25; // degrees; longer border segments are split so they follow the curve

const RADIANS = Math.PI / 180;

/** 'all' = coastlines and borders (Basic view), 'land' = only borders between countries. */
export type BorderMode = 'all' | 'land' | 'none';

/** An outline with the box it fits in, so shapes outside the picture can be skipped quickly. */
interface Shape extends UnwrappedRing {
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
}

interface Country {
  id: string; // ISO numeric code, e.g. "826"
  rings: Shape[];
  // Boxes that cover all of its rings between them. Nearby rings share a box, but a
  // country made of far-apart pieces (the USA, Russia) gets one box per piece, so that
  // recolouring it doesn't mean repainting the half of the world in between.
  // Worked out the first time the country changes colour (see areasOf).
  areas?: Bounds[];
}

/** The part of the world a picture covers, in degrees. */
interface Bounds {
  west: number;
  east: number;
  south: number;
  north: number;
}

const WHOLE_WORLD: Bounds = { west: -180, east: 180, south: -90, north: 90 };

// The map data is bundled into the app, so the globe needs no internet at runtime.
const world = worldData as any;

function toShape(points: LngLat[]): Shape {
  const ring = unwrapRing(points);
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of ring.points) {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  // A ring round a pole (Antarctica) gets filled all the way to that pole.
  if (ring.aroundPole === 'south') minLat = -90;
  if (ring.aroundPole === 'north') maxLat = 90;
  return { ...ring, minLng, maxLng, minLat, maxLat };
}

const countries: Country[] = (feature(world, world.objects.countries) as any).features.map((f: any) => {
  const polygons: LngLat[][][] = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const rings = polygons.flat().map(toShape);
  return { id: f.id ?? '', rings };
});

const areasOf = (country: Country) => (country.areas ??= groupBoxes(country.rings));

/** Puts boxes round the rings, merging any that overlap or nearly touch. */
function groupBoxes(rings: Shape[]): Bounds[] {
  const NEAR = 2; // degrees
  const boxes: Bounds[] = rings.map((ring) => ({ west: ring.minLng, east: ring.maxLng, south: ring.minLat, north: ring.maxLat }));
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < boxes.length && !merged; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const near =
          a.west - NEAR <= b.east && b.west - NEAR <= a.east && a.south - NEAR <= b.north && b.south - NEAR <= a.north;
        if (!near) continue;
        boxes[i] = {
          west: Math.min(a.west, b.west),
          east: Math.max(a.east, b.east),
          south: Math.min(a.south, b.south),
          north: Math.max(a.north, b.north),
        };
        boxes.splice(j, 1);
        merged = true;
        break;
      }
    }
  }
  return boxes;
}

// Every coastline and border, each one listed once.
const borderShapes: Shape[] = (mesh(world, world.objects.countries).coordinates as LngLat[][]).map(toShape);

// Shapes are stored with longitudes running on past 180, so each is tried in three
// positions a full turn apart; whichever copies fall inside the picture get drawn.
const TURNS = [-360, 0, 360];

function inside(shape: Shape, turn: number, bounds: Bounds): boolean {
  return (
    shape.maxLng + turn >= bounds.west &&
    shape.minLng + turn <= bounds.east &&
    shape.maxLat >= bounds.south &&
    shape.minLat <= bounds.north
  );
}

/** Paints the countries (and optionally the borders) for one part of the world. */
function paintMap(
  ctx: CanvasRenderingContext2D,
  bounds: Bounds,
  highlighted: Set<string>,
  withBorders: boolean,
): void {
  const { width, height } = ctx.canvas;
  const toX = (lng: number) => ((lng - bounds.west) / (bounds.east - bounds.west)) * width;
  const toY = (lat: number) => ((bounds.north - lat) / (bounds.north - bounds.south)) * height;

  ctx.fillStyle = OCEAN;
  ctx.fillRect(0, 0, width, height);

  for (const country of countries) {
    let drewSomething = false;
    ctx.beginPath();
    for (const ring of country.rings) {
      for (const turn of TURNS) {
        if (!inside(ring, turn, bounds)) continue;
        drewSomething = true;
        ring.points.forEach(([lng, lat], i) => {
          if (i === 0) ctx.moveTo(toX(lng + turn), toY(lat));
          else ctx.lineTo(toX(lng + turn), toY(lat));
        });
        // Antarctica circles the pole, so its outline has to be closed off via the pole itself.
        if (ring.aroundPole) {
          const poleY = toY(ring.aroundPole === 'south' ? -90 : 90);
          ctx.lineTo(toX(ring.points[ring.points.length - 1][0] + turn), poleY);
          ctx.lineTo(toX(ring.points[0][0] + turn), poleY);
        }
        ctx.closePath();
      }
    }
    if (!drewSomething) continue;
    ctx.fillStyle = highlighted.has(country.id) ? LAND_WITH_PIN : LAND;
    ctx.fill('evenodd'); // "evenodd" leaves holes (lakes, enclaves) unfilled
  }

  if (!withBorders) return;
  ctx.beginPath();
  for (const line of borderShapes) {
    for (const turn of TURNS) {
      if (!inside(line, turn, bounds)) continue;
      line.points.forEach(([lng, lat], i) => {
        // The data closes Antarctica with a tiny loop at the South Pole, which isn't a real border.
        const atPole = lat < -89.9;
        if (i === 0 || atPole) ctx.moveTo(toX(lng + turn), toY(lat));
        else ctx.lineTo(toX(lng + turn), toY(lat));
      });
    }
  }
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

export function createMapLayer(globe: GlobeInstance, element: HTMLElement) {
  const renderer = globe.renderer();
  const radius = globe.getGlobeRadius();
  const isComputer = window.matchMedia('(pointer: fine)').matches;
  const anisotropy = renderer.capabilities.getMaxAnisotropy(); // keeps images sharp at a slant

  const newImage = (width: number, height: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = anisotropy;
    return { ctx: canvas.getContext('2d')!, texture };
  };

  // ---- The whole-world image -------------------------------------------------

  const worldWidth = isComputer && renderer.capabilities.maxTextureSize >= COMPUTER_WIDTH ? COMPUTER_WIDTH : PHONE_WIDTH;
  const worldImage = newImage(worldWidth, worldWidth / 2);
  const globeMaterial = globe.globeMaterial() as MeshPhongMaterial;
  globeMaterial.map = worldImage.texture;
  globeMaterial.color.set('#ffffff');
  globeMaterial.needsUpdate = true;

  // ---- Border lines (used when zoomed out, and over satellite photos) --------

  // Coastlines are already visible in a satellite photo (and ours are only accurate to a
  // kilometre or so), so over photos we draw just the borders between countries.
  const allBorders = borderLines(globe, () => true, BORDER);
  const landBorders = borderLines(globe, (a, b) => a !== b, BORDER_ON_PHOTO);
  landBorders.visible = false;
  globe.scene().add(allBorders, landBorders);

  // ---- The detail patch ------------------------------------------------------

  const detailImage = newImage(isComputer ? DETAIL_MAX_WIDTH : DETAIL_HEIGHT, DETAIL_HEIGHT);
  // The patch is always seen at about its own size, so the smaller copies ("mipmaps") the
  // graphics card would normally build on every repaint are wasted work.
  detailImage.texture.generateMipmaps = false;
  detailImage.texture.minFilter = LinearFilter;
  const detail = new Mesh(new BufferGeometry(), new MeshPhongMaterial({ map: detailImage.texture }));
  detail.visible = false;
  detail.raycast = () => {}; // let taps go straight through to the globe underneath
  globe.scene().add(detail);

  let mode: BorderMode = 'all';
  let highlighted = new Set<string>();
  let camera = { lat: 0, lng: 0, altitude: 2.3 };

  // What the patch currently shows, or null if it has never been painted (or is out of date).
  let painted: { bounds: Bounds; centreLng: number; altitude: number } | null = null;

  // The area the camera can see, times `scale`. Longitudes are measured from `centreLng`
  // so that two areas either side of the date line can be compared directly.
  function boundsAround(scale: number, centreLng: number): Bounds {
    const halfHeight = Math.min(89, Math.max(0.3, camera.altitude * VIEW_DEGREES_PER_ALTITUDE * scale));
    const south = Math.max(-90, camera.lat - halfHeight);
    const north = Math.min(90, camera.lat + halfHeight);
    // Lines of longitude bunch together towards the poles, so the same width on screen
    // covers more degrees there.
    const aspect = Math.max(1, element.clientWidth / Math.max(1, element.clientHeight));
    const nearestPole = Math.min(89, Math.abs(camera.lat) + camera.altitude * VIEW_DEGREES_PER_ALTITUDE);
    const halfWidth = Math.min(180, (halfHeight * aspect) / Math.cos(nearestPole * RADIANS));
    const lng = centreLng + lngStep(centreLng, camera.lng);
    return { west: lng - halfWidth, east: lng + halfWidth, south, north };
  }

  // The patch is only worth using once it would be sharper than the whole-world image.
  function wantsDetail(): boolean {
    if (mode !== 'all') return false;
    const patchHalfHeight = Math.min(89, camera.altitude * VIEW_DEGREES_PER_ALTITUDE * DETAIL_COVERAGE);
    const patchPixelsPerDegree = DETAIL_HEIGHT / (2 * patchHalfHeight);
    const worldPixelsPerDegree = worldWidth / 360;
    return patchPixelsPerDegree > worldPixelsPerDegree * 1.2;
  }

  function needsRepaint(): boolean {
    if (!painted) return true;
    const zoom = camera.altitude / painted.altitude;
    if (zoom > REPAINT_ZOOM || zoom < 1 / REPAINT_ZOOM) return true;
    const view = boundsAround(1, painted.centreLng);
    const { bounds } = painted;
    const coversAllLongitudes = bounds.east - bounds.west >= 360;
    return (
      view.south < bounds.south ||
      view.north > bounds.north ||
      (!coversAllLongitudes && (view.west < bounds.west || view.east > bounds.east))
    );
  }

  function drawDetail(): void {
    if (!wantsDetail()) return;
    const bounds = boundsAround(DETAIL_COVERAGE, camera.lng);
    paintMap(detailImage.ctx, bounds, highlighted, true);
    detailImage.texture.needsUpdate = true;
    painted = { bounds, centreLng: camera.lng, altitude: camera.altitude };

    // A piece of sphere exactly covering `bounds`. (Angles are measured the way three.js
    // spheres expect: round from longitude -90, and down from the North Pole.)
    const widthDegrees = bounds.east - bounds.west;
    const heightDegrees = bounds.north - bounds.south;
    detail.geometry.dispose();
    detail.geometry = new SphereGeometry(
      radius * (1 + DETAIL_LIFT),
      Math.min(240, Math.max(32, Math.ceil(widthDegrees / 1.5))),
      Math.min(120, Math.max(32, Math.ceil(heightDegrees / 1.5))),
      (90 + bounds.west) * RADIANS,
      widthDegrees * RADIANS,
      (90 - bounds.north) * RADIANS,
      heightDegrees * RADIANS,
    );
    detail.visible = true;
    allBorders.visible = false; // the patch has the borders painted on
  }

  const drawDetailSoon = waitUntilSettled(drawDetail, 80, 300);

  function refresh(): void {
    landBorders.visible = mode === 'land';
    if (!wantsDetail()) {
      detail.visible = false;
      allBorders.visible = mode === 'all';
    } else if (needsRepaint()) {
      drawDetailSoon();
    } else {
      detail.visible = true;
      allBorders.visible = false;
    }
  }

  // ---- Changing a country's colour --------------------------------------------
  //
  // Repainting the whole-world image and sending all of it to the graphics card stops
  // the page for about half a second, which shows as a jerk when a pin arrives from a
  // new country. So when only a few countries change, just the boxes round them are
  // repainted and sent.

  const scratch = document.createElement('canvas');

  /** Repaints the part of `image` (which shows `bounds`) that covers `area`. */
  function repaintPart(image: ReturnType<typeof newImage>, bounds: Bounds, area: Bounds, withBorders: boolean): void {
    const { width, height } = image.ctx.canvas;
    const xPerDegree = width / (bounds.east - bounds.west);
    const yPerDegree = height / (bounds.north - bounds.south);
    const margin = 2; // pixels, for the soft edges drawn round each shape
    const x0 = Math.max(0, Math.floor((area.west - bounds.west) * xPerDegree) - margin);
    const x1 = Math.min(width, Math.ceil((area.east - bounds.west) * xPerDegree) + margin);
    const y0 = Math.max(0, Math.floor((bounds.north - area.north) * yPerDegree) - margin);
    const y1 = Math.min(height, Math.ceil((bounds.north - area.south) * yPerDegree) + margin);
    if (x1 <= x0 || y1 <= y0) return; // that area isn't in this image

    // Paint the box exactly as the full repaint would have painted those pixels.
    scratch.width = x1 - x0;
    scratch.height = y1 - y0;
    const box: Bounds = {
      west: bounds.west + x0 / xPerDegree,
      east: bounds.west + x1 / xPerDegree,
      north: bounds.north - y0 / yPerDegree,
      south: bounds.north - y1 / yPerDegree,
    };
    paintMap(scratch.getContext('2d')!, box, highlighted, withBorders);
    image.ctx.drawImage(scratch, x0, y0); // keeps the full image in step, in case it is ever resent

    const part = new CanvasTexture(scratch);
    part.colorSpace = SRGBColorSpace;
    // The graphics card counts rows from the bottom of the image, not the top.
    renderer.copyTextureToTexture(part, image.texture, null, new Vector2(x0, height - y1));
    part.dispose();
  }

  // Above this many countries changing at once (such as when the pins first load), one
  // full repaint is quicker than many small ones.
  const MOST_COUNTRIES_TO_PATCH = 6;
  let firstPaint = true;

  /** Repaints the map, colouring in the countries whose ISO numeric code is in `ids`. */
  function paint(ids: Set<string>): void {
    const changed = [...ids].filter((id) => !highlighted.has(id));
    changed.push(...[...highlighted].filter((id) => !ids.has(id)));
    highlighted = ids;

    if (firstPaint || changed.length > MOST_COUNTRIES_TO_PATCH) {
      firstPaint = false;
      paintMap(worldImage.ctx, WHOLE_WORLD, highlighted, false);
      worldImage.texture.needsUpdate = true;
      painted = null; // the patch still shows the old colours
      drawDetail();
      return;
    }

    for (const country of countries) {
      if (!changed.includes(country.id)) continue;
      // Shapes may run on past 180 degrees, so try each one a turn either way as well.
      for (const box of areasOf(country)) {
        for (const turn of TURNS) {
          const area = { ...box, west: box.west + turn, east: box.east + turn };
          repaintPart(worldImage, WHOLE_WORLD, area, false);
          if (painted) repaintPart(detailImage, painted.bounds, area, true);
        }
      }
    }
  }

  paint(highlighted);

  return {
    paint,

    setBorders(next: BorderMode): void {
      mode = next;
      refresh();
    },

    /** Call whenever the camera moves. */
    setCamera(lat: number, lng: number, altitude: number): void {
      camera = { lat, lng, altitude };
      // Keep the lines at a small fraction of the camera's height. Any higher and, zoomed
      // right in, they would appear to slide away from the ground they are meant to mark.
      const lineAltitude = Math.min(BUILD_ALTITUDE, Math.max(MIN_BORDER_ALTITUDE, altitude * 0.02));
      const scale = (1 + lineAltitude) / (1 + BUILD_ALTITUDE);
      allBorders.scale.setScalar(scale);
      landBorders.scale.setScalar(scale);
      refresh();
    },
  };
}

// A set of border lines as a single object, so it costs one draw call. `include` is asked
// about the two countries either side of each line (they are the same along a coastline).
function borderLines(globe: GlobeInstance, include: (a: unknown, b: unknown) => boolean, color: string): LineSegments {
  const lines = (mesh(world, world.objects.countries, include).coordinates as LngLat[][]).map(
    (line) => unwrapRing(line).points,
  );
  const positions: number[] = [];

  const addPoint = (lng: number, lat: number) => {
    const { x, y, z } = globe.getCoords(lat, lng, BUILD_ALTITUDE);
    positions.push(x, y, z);
  };

  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const [lng1, lat1] = line[i - 1];
      const [lng2, lat2] = line[i];
      // The data closes Antarctica with a tiny loop at the South Pole, which isn't a real border.
      if (lat1 < -89.9 && lat2 < -89.9) continue;
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(lng2 - lng1), Math.abs(lat2 - lat1)) / MAX_STEP));
      for (let s = 0; s < steps; s++) {
        addPoint(lng1 + ((lng2 - lng1) * s) / steps, lat1 + ((lat2 - lat1) * s) / steps);
        addPoint(lng1 + ((lng2 - lng1) * (s + 1)) / steps, lat1 + ((lat2 - lat1) * (s + 1)) / steps);
      }
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  const object = new LineSegments(geometry, new LineBasicMaterial({ color }));
  object.raycast = () => {}; // lines should never swallow a tap meant for the globe
  return object;
}
