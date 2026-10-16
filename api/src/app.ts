// Builds the Fastify app: all /api routes plus the static frontend.
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import type Database from 'better-sqlite3';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { createHash, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { citiesNear, searchCities } from './cities.js';
import { pinsToCsv } from './csv.js';
import { createEventHub } from './events.js';
import { normalizeJid } from './jid.js';
import { deletePin, insertPin, listPins, moveJid, validateNewPin, validatePlace } from './pins.js';

// A safety limit so a stuck button or a runaway script can't flood the map.
// It is counted per network address, but when the app runs in Docker every machine in the
// room looks like the same address, so in practice this is the limit for the whole room
// combined. 600 a minute (10 a second) is far more than a room of people can type.
export const MAX_NEW_ENTRIES_PER_MINUTE = 600;

/** Shown greyed out in the empty JID box when JID_PLACEHOLDER isn't set. */
export const DEFAULT_JID_PLACEHOLDER = '5GB123TXA';

export interface AppOptions {
  pinsDb: Database.Database;
  /** null when cities.db hasn't been built; city search then returns nothing. */
  citiesDb: Database.Database | null;
  adminPasscode: string;
  /** When true, a device must be unlocked (with `submitPasscode`) before it can add JIDs. */
  submitLock?: boolean;
  submitPasscode?: string;
  /** The example JID in the empty JID box. Blank or missing means DEFAULT_JID_PLACEHOLDER. */
  jidPlaceholder?: string;
  webDist?: string;
  logger?: boolean;
  /** Reported by /api/health. */
  version?: string;
  build?: string;
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const { pinsDb, citiesDb, adminPasscode } = options;
  const submitLock = options.submitLock ?? false;
  const submitPasscode = options.submitPasscode ?? '';
  const app = Fastify({ logger: options.logger ?? false });
  const events = createEventHub();

  // Open event streams never finish on their own, so end them when shutting down.
  app.addHook('preClose', async () => events.close());

  await app.register(rateLimit, { global: false });

  // Also says which version and build is running (shown in the About pop-up).
  const about = { version: options.version ?? 'unknown', build: options.build ?? 'dev' };
  app.get('/api/health', async () => ({ ok: true, ...about }));

  // Settings the pages need from the server's environment.
  const settings = { jidPlaceholder: options.jidPlaceholder?.trim() || DEFAULT_JID_PLACEHOLDER };
  app.get('/api/settings', async () => settings);

  app.get('/api/pins', async () => listPins(pinsDb));

  // ---- Admin access ----------------------------------------------------------
  // A device unlocks by sending the passcode once. It gets back a "session cookie": the
  // browser attaches it to every later request, shares it between tabs, and throws it away
  // when the browser is closed. The cookie holds a scrambled form of the passcode, never
  // the passcode itself, and stops working if the passcode is changed.
  const adminToken = adminPasscode ? createHash('sha256').update(`jid-globe-admin:${adminPasscode}`).digest('hex') : '';
  // HttpOnly: scripts on the page can't read it. SameSite=Strict: other websites can't use it.
  const cookieSettings = 'Path=/api; HttpOnly; SameSite=Strict';

  const hasAdminCookie = (request: FastifyRequest) =>
    adminToken !== '' && sameText(cookieValue(request.headers.cookie, ADMIN_COOKIE), adminToken);

  // Sends the refusal itself and returns false unless the request comes from an unlocked
  // device (or carries the passcode in a header, which is handy for scripts).
  function isAdmin(request: FastifyRequest, reply: FastifyReply): boolean {
    if (!adminPasscode) {
      reply.code(403).send({ error: 'Deleting and moving are switched off: ADMIN_PASSCODE is not set.' });
      return false;
    }
    if (hasAdminCookie(request) || sameText(request.headers['x-admin-passcode'], adminPasscode)) return true;
    reply.code(401).send({ error: 'This device is not unlocked for admin.' });
    return false;
  }

  app.get('/api/admin/status', async (request) => ({ unlocked: hasAdminCookie(request) }));

  // The limit on tries stops someone guessing the passcode by brute force.
  app.post<{ Body: { passcode?: unknown } }>(
    '/api/admin/unlock',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (!adminPasscode) {
        return reply.code(403).send({ error: 'Admin is switched off: ADMIN_PASSCODE is not set.' });
      }
      if (!sameText(request.body?.passcode, adminPasscode)) {
        return reply.code(401).send({ error: 'Wrong admin passcode.' });
      }
      // No expiry date on the cookie is what makes the browser drop it when it closes.
      return reply.header('Set-Cookie', `${ADMIN_COOKIE}=${adminToken}; ${cookieSettings}`).code(204).send();
    },
  );

  app.post('/api/admin/lock', async (_request, reply) => {
    return reply.header('Set-Cookie', `${ADMIN_COOKIE}=; ${cookieSettings}; Max-Age=0`).code(204).send();
  });

  // ---- Submit lock (optional) ---------------------------------------------------
  // With SUBMIT_LOCK on, a device has to be unlocked with SUBMIT_PASSCODE before it can
  // add JIDs, so someone else on the network can't just open the page and start adding.
  // It works like the admin unlock: one passcode entry, then a session cookie.
  // A device unlocked for admin can always add JIDs too.
  const submitToken = submitPasscode
    ? createHash('sha256').update(`jid-globe-submit:${submitPasscode}`).digest('hex')
    : '';

  const hasSubmitCookie = (request: FastifyRequest) =>
    submitToken !== '' && sameText(cookieValue(request.headers.cookie, SUBMIT_COOKIE), submitToken);

  function maySubmit(request: FastifyRequest): boolean {
    if (!submitLock) return true;
    if (hasSubmitCookie(request) || hasAdminCookie(request)) return true;
    // Passcodes in a header are handy for scripts.
    if (submitPasscode && sameText(request.headers['x-submit-passcode'], submitPasscode)) return true;
    return adminPasscode !== '' && sameText(request.headers['x-admin-passcode'], adminPasscode);
  }

  // `locked` says whether the feature is on at all; `unlocked` whether this device may add JIDs.
  app.get('/api/submit/status', async (request) => ({ locked: submitLock, unlocked: maySubmit(request) }));

  app.post<{ Body: { passcode?: unknown } }>(
    '/api/submit/unlock',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (!submitLock) return reply.code(204).send(); // nothing to unlock
      if (!submitPasscode) {
        return reply.code(403).send({ error: 'SUBMIT_PASSCODE is not set, so only an admin can add JIDs.' });
      }
      if (!sameText(request.body?.passcode, submitPasscode)) {
        return reply.code(401).send({ error: 'Wrong passcode.' });
      }
      return reply.header('Set-Cookie', `${SUBMIT_COOKIE}=${submitToken}; ${cookieSettings}`).code(204).send();
    },
  );

  app.post('/api/submit/lock', async (_request, reply) => {
    return reply.header('Set-Cookie', `${SUBMIT_COOKIE}=; ${cookieSettings}; Max-Age=0`).code(204).send();
  });

  // Adds an entry.
  app.post(
    '/api/pins',
    { config: { rateLimit: { max: MAX_NEW_ENTRIES_PER_MINUTE, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (!maySubmit(request)) {
        return reply.code(401).send({ error: 'Adding JIDs is locked on this device.' });
      }
      const result = validateNewPin(request.body);
      if (!result.ok) return reply.code(400).send({ error: result.error });
      const pin = insertPin(pinsDb, result.pin);
      events.broadcast('pin-added', pin);
      return reply.code(201).send(pin);
    },
  );

  // Moves a JID (every entry of it) to a new place.
  app.put<{ Params: { jid: string } }>('/api/jids/:jid/place', async (request, reply) => {
    if (!isAdmin(request, reply)) return reply;
    const jid = normalizeJid(request.params.jid);
    if (!jid) return reply.code(400).send({ error: 'That is not a valid JID.' });
    const result = validatePlace(request.body);
    if (!result.ok) return reply.code(400).send({ error: result.error });

    const moved = moveJid(pinsDb, jid, result.place);
    if (moved.length === 0) return reply.code(404).send({ error: 'That JID is not in the logbook.' });
    events.broadcast('pins-moved', moved);
    return moved;
  });

  app.delete<{ Params: { id: string } }>('/api/pins/:id', async (request, reply) => {
    if (!isAdmin(request, reply)) return reply;
    if (!deletePin(pinsDb, request.params.id)) {
      return reply.code(404).send({ error: 'That pin no longer exists.' });
    }
    events.broadcast('pin-deleted', { id: request.params.id });
    return reply.code(204).send();
  });

  app.get<{ Querystring: { country?: string; q?: string } }>('/api/cities', async (request, reply) => {
    // With a country: cities in that country (the JID form). Without: the whole world
    // (the "Find a place" box), which needs at least two letters to be worth searching.
    const { country, q = '' } = request.query;
    if (country !== undefined && !/^[A-Za-z]{2}$/.test(country)) {
      return reply.code(400).send({ error: 'country must be a two-letter code.' });
    }
    if (!citiesDb) return [];
    if (country === undefined && q.trim().length < 2) return [];
    return searchCities(citiesDb, country ?? null, q.slice(0, 50));
  });

  app.get<{ Querystring: { lat?: string; lng?: string; radius?: string } }>(
    '/api/cities/nearby',
    async (request, reply) => {
      const lat = Number(request.query.lat);
      const lng = Number(request.query.lng);
      const radius = Number(request.query.radius);
      if (![lat, lng, radius].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        return reply.code(400).send({ error: 'lat, lng and radius must be numbers.' });
      }
      if (!citiesDb) return [];
      return citiesNear(citiesDb, lat, lng, Math.min(Math.max(radius, 0.1), 40));
    },
  );

  app.get('/api/events', (request, reply) => {
    // Take over the raw response so the connection stays open for the stream.
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    reply.raw.write('retry: 2000\n\n');
    events.add(reply.raw);
  });

  app.get('/api/export.csv', async (_request, reply) => {
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="jid-globe.csv"')
      .send(pinsToCsv(listPins(pinsDb)));
  });

  const { webDist } = options;
  if (webDist && existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist });

    // Each page of the app is a file such as stats.html. This lets people type the
    // shorter /stats. Addresses with a dot in them (files) are left to the lines above.
    app.get<{ Params: { page: string } }>('/:page(^[a-z0-9-]+$)', (request, reply) => {
      const file = `${request.params.page}.html`;
      if (!existsSync(path.join(webDist, file))) return reply.callNotFound();
      return reply.sendFile(file);
    });
  }

  return app;
}

const ADMIN_COOKIE = 'jid_admin';
const SUBMIT_COOKIE = 'jid_submit';

// Compares two pieces of text without giving away, through timing, how much of a guess was right.
// (Hashing first gives both buffers the same length, which timingSafeEqual needs.)
function sameText(given: unknown, expected: string): boolean {
  if (typeof given !== 'string') return false;
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

// Picks one cookie out of a request's Cookie header ("a=1; b=2").
function cookieValue(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=');
  }
  return undefined;
}
