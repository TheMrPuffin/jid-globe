// Small wrappers around the /api routes.
export type Placement = 'country' | 'city' | 'manual';

export interface Pin {
  id: string;
  jid: string;
  lat: number;
  lng: number;
  placement: Placement;
  city: string | null;
  note: string | null;
  added_by: string | null;
  created_at: string;
}

export type NewPin = Omit<Pin, 'id' | 'created_at'>;

/** Where a JID is: the part of a pin that every entry of the same JID shares. */
export type Place = Pick<Pin, 'lat' | 'lng' | 'placement' | 'city'>;

export interface City {
  geonameid: number;
  name: string;
  country_code: string;
  lat: number;
  lng: number;
  population: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      response.status === 429
        ? 'Too many pins at once. Wait a minute and try again.'
        : (body?.error ?? `Something went wrong (${response.status}).`);
    throw new ApiError(message, response.status);
  }
  return (response.status === 204 ? undefined : await response.json()) as T;
}

export function fetchPins(): Promise<Pin[]> {
  return request('/api/pins');
}

export function createPin(pin: NewPin): Promise<Pin> {
  return request('/api/pins', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pin),
  });
}

// ---- Admin ----
// Once a device is unlocked the browser sends its admin cookie with every request by
// itself, so the functions below don't need to be given the passcode.

export function fetchAdminStatus(): Promise<{ unlocked: boolean }> {
  return request('/api/admin/status');
}

/** Unlocks this device. Fails with a message if the passcode is wrong. */
export function unlockAdmin(passcode: string): Promise<void> {
  return request('/api/admin/unlock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passcode }),
  });
}

export function lockAdmin(): Promise<void> {
  return request('/api/admin/lock', { method: 'POST' });
}

// ---- Submit lock (only matters when the server has SUBMIT_LOCK on) ----

/** `locked`: whether the lock is switched on at all. `unlocked`: whether this device may add JIDs. */
export function fetchSubmitStatus(): Promise<{ locked: boolean; unlocked: boolean }> {
  return request('/api/submit/status');
}

/** Unlocks adding JIDs on this device. Fails with a message if the passcode is wrong. */
export function unlockSubmit(passcode: string): Promise<void> {
  return request('/api/submit/unlock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passcode }),
  });
}

export function lockSubmit(): Promise<void> {
  return request('/api/submit/lock', { method: 'POST' });
}

/** Moves every entry of a JID to a new place. Returns the entries that were moved. */
export function moveJid(jid: string, place: Place): Promise<Pin[]> {
  return request(`/api/jids/${encodeURIComponent(jid)}/place`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(place),
  });
}

export function deletePin(id: string): Promise<void> {
  return request(`/api/pins/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** Pass a country code to search one country, or null to search the whole world. */
export function searchCities(country: string | null, query: string): Promise<City[]> {
  const params = new URLSearchParams(country ? { country, q: query } : { q: query });
  return request(`/api/cities?${params}`);
}

export function fetchNearbyCities(lat: number, lng: number, radius: number): Promise<City[]> {
  const params = new URLSearchParams({ lat: lat.toFixed(3), lng: lng.toFixed(3), radius: radius.toFixed(2) });
  return request(`/api/cities/nearby?${params}`);
}
