import {HttpError, parseJSON, readText} from './http.mjs';

const identifier = /^[a-z0-9_|-]{1,192}$/i;
const controls = /[\u0000-\u001f\u007f]/;
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function checkOrigin(request) {
  const origin = request.headers.get('origin');
  const site = request.headers.get('sec-fetch-site');
  if ((origin !== null && origin !== new URL(request.url).origin) ||
      (site && !['same-origin', 'none'].includes(site)) ||
      (request.method === 'POST' && origin === null && !request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))) {
    throw new HttpError(403, 'Same-origin requests only.');
  }
}

export async function readInput(request, action) {
  checkOrigin(request);
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') || '')) {
    throw new HttpError(415, 'Send a JSON request.');
  }
  if (request.headers.has('content-encoding') && request.headers.get('content-encoding') !== 'identity') {
    throw new HttpError(415, 'Compressed request bodies are not supported.');
  }
  let input;
  try { input = parseJSON(await readText(request, 8192)); }
  catch (error) {
    if (error instanceof SyntaxError) throw new HttpError(400, 'Invalid JSON request.');
    throw error;
  }
  if (!record(input) || Object.keys(input).some(key => !['instance', 'q', 'session'].includes(key)) ||
      typeof input.instance !== 'string' || !identifier.test(input.instance)) {
    throw new HttpError(400, 'Select an available category.');
  }
  if (action !== 'prepare' && (typeof input.q !== 'string' || controls.test(input.q) ||
      input.q.trim().length < 2 || input.q.trim().length > 200)) {
    throw new HttpError(400, 'Enter between 2 and 200 characters.');
  }
  if (action === 'prepare' && own(input, 'q')) throw new HttpError(400, 'Unexpected preparation parameter.');
  if (input.session != null) validateSession(input.session);
  return input;
}

function validateSession(session) {
  if (!record(session) || Object.keys(session).some(key => !['id', 'step', 'instance', 'base', 'expires', 'lane', 'proof'].includes(key)) ||
      typeof session.id !== 'string' || !session.id || session.id.length > 512 || controls.test(session.id) ||
      !Number.isSafeInteger(session.step) || session.step < 1 || session.step >= Number.MAX_SAFE_INTEGER ||
      typeof session.instance !== 'string' || !identifier.test(session.instance) ||
      typeof session.base !== 'string' || session.base.length > 2048) {
    throw new HttpError(400, 'Invalid session. Try again to reconnect.');
  }
}

const encoder = new TextEncoder();
const payload = (session, origin) => encoder.encode(JSON.stringify([
  1, origin, session.id, session.step, session.instance, session.base, session.expires, session.lane,
]));
let cachedSecret, cachedKey;
function signingKey(secret) {
  if (typeof secret !== 'string' || !/^[a-f0-9]{64}$/i.test(secret)) {
    throw new HttpError(503, 'The lookup service is unavailable. Try again later.');
  }
  if (secret !== cachedSecret) {
    cachedSecret = secret;
    cachedKey = crypto.subtle.importKey('raw', Uint8Array.from(secret.match(/../g), byte => parseInt(byte, 16)),
      {name: 'HMAC', hash: 'SHA-256'}, false, ['sign', 'verify']);
  }
  return cachedKey;
}

export async function signSession(session, action, origin, secret) {
  const value = {...session, expires: Date.now() + 86400000, lane: action === 'prepare' ? 'ready' : action};
  const proof = await crypto.subtle.sign('HMAC', await signingKey(secret), payload(value, origin));
  value.proof = Array.from(new Uint8Array(proof), byte => byte.toString(16).padStart(2, '0')).join('');
  return value;
}

export async function restoreSession(input, action, origin, secret) {
  const key = await signingKey(secret);
  const session = input.session;
  // Old open tabs carry unsigned sessions. Discard those fields and bootstrap
  // normally, without trusting any client-supplied engine state.
  if (!session || !own(session, 'proof')) return undefined;
  if (typeof session.proof !== 'string' || !/^[a-f0-9]{64}$/.test(session.proof) ||
      !Number.isSafeInteger(session.expires) ||
      !['ready', action].includes(session.lane) || session.instance !== input.instance ||
      !await crypto.subtle.verify('HMAC', key, Uint8Array.from(session.proof.match(/../g), byte => parseInt(byte, 16)), payload(session, origin))) {
    throw new HttpError(400, 'Invalid session. Try again to reconnect.');
  }
  if (session.expires <= Date.now()) return undefined;
  const {id, step, instance, base} = session;
  return {id, step, instance, base};
}

// Fast local overload protection, deliberately not described as a globally
// coordinated quota. Entries expire, active leases cannot be evicted, and no
// requests or personal data are persisted. Forwarded-for is never trusted.
export class TrafficGuard {
  constructor({now = () => Date.now(), capacity = 120, refill = 20, concurrent = 24, maxClients = 2048} = {}) {
    Object.assign(this, {now, capacity, refill, concurrent, maxClients});
    this.clients = new Map();
    this.active = 0;
    this.total = {tokens: capacity * 4, time: now()};
  }
  take(key, cost = 1) {
    const now = this.now();
    for (const [key, value] of this.clients) {
      if (!value.active && now - value.time > 60000) this.clients.delete(key);
    }
    let client = this.clients.get(key);
    if (!client) {
      if (this.clients.size >= this.maxClients) throw new HttpError(503, 'The lookup is busy. Try again shortly.', 2);
      client = {tokens: this.capacity, time: now, active: 0};
      this.clients.set(key, client);
    }
    const replenish = (bucket, max, rate) => {
      bucket.tokens = Math.min(max, bucket.tokens + Math.max(0, now - bucket.time) * rate / 1000);
      bucket.time = now;
    };
    replenish(client, this.capacity, this.refill);
    replenish(this.total, this.capacity * 4, this.refill * 4);
    if (client.tokens < cost || this.total.tokens < cost) throw new HttpError(429, 'Too many requests. Try again shortly.', 1);
    if (this.active >= this.concurrent || client.active >= 16) throw new HttpError(503, 'The lookup is busy. Try again shortly.', 1);
    client.tokens -= cost; this.total.tokens -= cost;
    client.active++; this.active++;
    let released = false;
    return () => {
      if (!released) { released = true; client.active--; this.active--; }
    };
  }
}
