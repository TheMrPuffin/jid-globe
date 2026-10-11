import type { FastifyInstance } from 'fastify';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp, MAX_NEW_ENTRIES_PER_MINUTE } from '../src/app.js';
import { openPinsDb } from '../src/db.js';

const validPin = { jid: '5gb12a', lat: 54, lng: -2, placement: 'country', note: 'Hello from Leeds' };
let app: FastifyInstance;

beforeEach(async () => {
  app = await buildApp({ pinsDb: openPinsDb(':memory:'), citiesDb: null, adminPasscode: 'secret' });
});

afterEach(() => app.close());

function addPin(body: object) {
  return app.inject({ method: 'POST', url: '/api/pins', payload: body });
}

describe('health', () => {
  it('says which version and build is running', async () => {
    const site = await buildApp({
      pinsDb: openPinsDb(':memory:'),
      citiesDb: null,
      adminPasscode: 'secret',
      version: '1.2.3',
      build: 'abc1234',
    });
    try {
      expect((await site.inject('/api/health')).json()).toEqual({ ok: true, version: '1.2.3', build: 'abc1234' });
    } finally {
      await site.close();
    }
  });
});

describe('pins API', () => {
  it('creates a pin and lists it', async () => {
    const created = await addPin(validPin);
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ jid: '5GB12A', placement: 'country', city: null });

    const list = await app.inject('/api/pins');
    expect(list.json()).toHaveLength(1);
  });

  it('rejects bad input', async () => {
    expect((await addPin({ ...validPin, jid: 'G4ABC' })).statusCode).toBe(400);
    expect((await addPin({ ...validPin, jid: '1GB12A' })).statusCode).toBe(400); // UK is region 5
    expect((await addPin({ ...validPin, lat: 91 })).statusCode).toBe(400);
    expect((await addPin({ ...validPin, placement: 'moon' })).statusCode).toBe(400);
    expect((await addPin({ ...validPin, note: 'x'.repeat(121) })).statusCode).toBe(400);
  });

  it('only deletes with the right passcode', async () => {
    const { id } = (await addPin(validPin)).json();
    const url = `/api/pins/${id}`;

    expect((await app.inject({ method: 'DELETE', url })).statusCode).toBe(401);
    const wrong = await app.inject({ method: 'DELETE', url, headers: { 'x-admin-passcode': 'nope' } });
    expect(wrong.statusCode).toBe(401);
    expect((await app.inject('/api/pins')).json()).toHaveLength(1);

    const right = await app.inject({ method: 'DELETE', url, headers: { 'x-admin-passcode': 'secret' } });
    expect(right.statusCode).toBe(204);
    expect((await app.inject('/api/pins')).json()).toHaveLength(0);
  });

  it('unlocks a device with a session cookie, and locks it again', async () => {
    const unlock = (passcode: string) => app.inject({ method: 'POST', url: '/api/admin/unlock', payload: { passcode } });
    const status = async (cookie?: string) =>
      (await app.inject({ url: '/api/admin/status', headers: cookie ? { cookie } : {} })).json();

    expect((await unlock('nope')).statusCode).toBe(401);
    expect(await status()).toEqual({ unlocked: false });

    const unlocked = await unlock('secret');
    expect(unlocked.statusCode).toBe(204);
    const setCookie = String(unlocked.headers['set-cookie']);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).not.toMatch(/Max-Age|Expires/i); // so the browser drops it when it closes
    expect(setCookie).not.toContain('secret'); // the passcode itself is never handed back
    const cookie = setCookie.split(';')[0];
    expect(await status(cookie)).toEqual({ unlocked: true });
    expect(await status('jid_admin=made-up')).toEqual({ unlocked: false });

    // The cookie alone is enough to delete.
    const { id } = (await addPin(validPin)).json();
    const deleted = await app.inject({ method: 'DELETE', url: `/api/pins/${id}`, headers: { cookie } });
    expect(deleted.statusCode).toBe(204);

    const locked = await app.inject({ method: 'POST', url: '/api/admin/lock', headers: { cookie } });
    expect(String(locked.headers['set-cookie'])).toContain('Max-Age=0');
  });

  it('gives a repeat entry the place the JID already has', async () => {
    await addPin({ ...validPin, lat: 52.04, lng: -0.76, placement: 'city', city: 'Milton Keynes' });
    const repeat = await addPin({ ...validPin, lat: 53.8, lng: -1.55, placement: 'city', city: 'Leeds' });
    expect(repeat.statusCode).toBe(201);
    expect(repeat.json()).toMatchObject({ lat: 52.04, lng: -0.76, city: 'Milton Keynes' });
    expect((await app.inject('/api/pins')).json()).toHaveLength(2);
  });

  it('moves every entry of a JID, but only with the passcode', async () => {
    await addPin(validPin);
    await addPin(validPin);
    await addPin({ ...validPin, jid: '6BR44C' });
    const move = (headers: Record<string, string>) =>
      app.inject({
        method: 'PUT',
        url: '/api/jids/5gb12a/place',
        headers,
        payload: { lat: 53.8, lng: -1.55, placement: 'city', city: 'Leeds' },
      });

    expect((await move({})).statusCode).toBe(401);
    const moved = await move({ 'x-admin-passcode': 'secret' });
    expect(moved.statusCode).toBe(200);
    expect(moved.json()).toHaveLength(2);

    const pins = (await app.inject('/api/pins')).json() as { jid: string; city: string | null }[];
    expect(pins.filter((p) => p.jid === '5GB12A').map((p) => p.city)).toEqual(['Leeds', 'Leeds']);
    expect(pins.find((p) => p.jid === '6BR44C')?.city).toBeNull();
  });

  it('refuses to move a JID that is not in the logbook', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/jids/5GB12A/place',
      headers: { 'x-admin-passcode': 'secret' },
      payload: { lat: 1, lng: 1, placement: 'manual' },
    });
    expect(response.statusCode).toBe(404);
  });

  it('exports CSV', async () => {
    await addPin({ ...validPin, note: '=SUM(1,2) "quoted"' });
    const csv = (await app.inject('/api/export.csv')).body;
    expect(csv).toContain('id,jid,lat,lng,placement,city,note,added_by,created_at');
    expect(csv).toContain(`"'=SUM(1,2) ""quoted"""`);
    expect(csv).toContain('"Unknown"'); // no station label was given

    await addPin({ ...validPin, added_by: 'PC01' });
    expect((await app.inject('/api/export.csv')).body).toContain('"PC01"');
  });

  it('limits how fast pins can be added', async () => {
    for (let i = 0; i < MAX_NEW_ENTRIES_PER_MINUTE; i++) expect((await addPin(validPin)).statusCode).toBe(201);
    expect((await addPin(validPin)).statusCode).toBe(429);
  });
});

describe('pages', () => {
  it('serves a page file at its short address', async () => {
    const webDist = mkdtempSync(path.join(tmpdir(), 'jid-web-'));
    writeFileSync(path.join(webDist, 'index.html'), '<h1>globe</h1>');
    writeFileSync(path.join(webDist, 'stats.html'), '<h1>stats</h1>');
    const site = await buildApp({ pinsDb: openPinsDb(':memory:'), citiesDb: null, adminPasscode: 'secret', webDist });
    try {
      expect((await site.inject('/')).body).toContain('globe');
      expect((await site.inject('/stats')).body).toContain('stats');
      expect((await site.inject('/stats.html')).body).toContain('stats');
      expect((await site.inject('/nothing-here')).statusCode).toBe(404);
      expect((await site.inject('/api/health')).json()).toMatchObject({ ok: true });
    } finally {
      await site.close();
      rmSync(webDist, { recursive: true, force: true });
    }
  });
});

describe('submit lock', () => {
  const pin = { jid: '5GB12A', lat: 54, lng: -2, placement: 'country' };

  async function lockedApp() {
    return buildApp({
      pinsDb: openPinsDb(':memory:'),
      citiesDb: null,
      adminPasscode: 'secret',
      submitLock: true,
      submitPasscode: 'scouts',
    });
  }

  it('is off unless asked for', async () => {
    // The app built for the other tests has no lock, and anyone can add.
    expect((await app.inject('/api/submit/status')).json()).toEqual({ locked: false, unlocked: true });
    expect((await app.inject({ method: 'POST', url: '/api/pins', payload: pin })).statusCode).toBe(201);
  });

  it('refuses new entries from a device that has not unlocked', async () => {
    const site = await lockedApp();
    try {
      expect((await site.inject('/api/submit/status')).json()).toEqual({ locked: true, unlocked: false });
      const refused = await site.inject({ method: 'POST', url: '/api/pins', payload: pin });
      expect(refused.statusCode).toBe(401);
      // Looking is still allowed.
      expect((await site.inject('/api/pins')).statusCode).toBe(200);
      expect((await site.inject('/api/pins')).json()).toHaveLength(0);
    } finally {
      await site.close();
    }
  });

  it('lets a device add after unlocking with the submit passcode', async () => {
    const site = await lockedApp();
    try {
      const unlock = (passcode: string) => site.inject({ method: 'POST', url: '/api/submit/unlock', payload: { passcode } });
      expect((await unlock('wrong')).statusCode).toBe(401);
      expect((await unlock('secret')).statusCode).toBe(401); // the admin passcode is not the submit passcode

      const unlocked = await unlock('scouts');
      expect(unlocked.statusCode).toBe(204);
      const setCookie = String(unlocked.headers['set-cookie']);
      expect(setCookie).not.toMatch(/Max-Age|Expires/i);
      expect(setCookie).not.toContain('scouts');
      const cookie = setCookie.split(';')[0];

      expect((await site.inject({ url: '/api/submit/status', headers: { cookie } })).json()).toEqual({ locked: true, unlocked: true });
      const added = await site.inject({ method: 'POST', url: '/api/pins', payload: pin, headers: { cookie } });
      expect(added.statusCode).toBe(201);

      // A submit unlock does not allow deleting.
      const { id } = added.json();
      expect((await site.inject({ method: 'DELETE', url: `/api/pins/${id}`, headers: { cookie } })).statusCode).toBe(401);
    } finally {
      await site.close();
    }
  });

  it('lets an admin-unlocked device add without the submit passcode', async () => {
    const site = await lockedApp();
    try {
      const admin = await site.inject({ method: 'POST', url: '/api/admin/unlock', payload: { passcode: 'secret' } });
      const cookie = String(admin.headers['set-cookie']).split(';')[0];
      expect((await site.inject({ method: 'POST', url: '/api/pins', payload: pin, headers: { cookie } })).statusCode).toBe(201);
    } finally {
      await site.close();
    }
  });
});
