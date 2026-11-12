import { randomBytes, createHash, createHmac, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import catalog from '../src/data/catalog.json' with { type: 'json' };
import { privateStore } from './storage.js';

const scrypt = promisify(scryptCallback);
const cookieName = '__Host-proanalyst_staff';
const sessionSeconds = 8 * 60 * 60;
const digest = (text) => createHash('sha256').update(text).digest('hex');
const failure = (status, message) => Object.assign(new Error(message), { status });

export async function passwordHash(password, salt = randomBytes(16).toString('hex')) {
  const hash = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `${salt}:${hash.toString('hex')}`;
}

async function checkPassword(password, encoded) {
  if (!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(encoded || '')) return false;
  const actual = await passwordHash(password, encoded.split(':')[0]);
  return timingSafeEqual(Buffer.from(actual), Buffer.from(encoded));
}

// Atomic create-only slots enforce limits across independent Function instances.
async function rateLimit(store, scope, limit, windowMs, now) {
  const prefix = `limits/${scope}/${Math.floor(now / windowMs)}`;
  for (let slot = 0; slot < limit; slot++) {
    const path = `${prefix}/${slot}.json`;
    if (await store.read(path)) continue;
    try { await store.create(path, { used: true }, 1); return; }
    catch (error) { if (!await store.read(path)) throw error; }
  }
  throw failure(429, 'Too many requests. Please try again later.');
}

export function createHandler({ getStore = privateStore, env = process.env, now = () => Date.now() } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, body) => res.status(status).json(body);
    const action = new URL(req.url, 'https://localhost').pathname.split('/').pop();
    const allowed = { login: 'POST', logout: 'POST', session: 'GET', feedback: 'POST', 'scenario-requests': 'POST', insights: 'GET' };
    if (!allowed[action]) return send(404, { error: 'Not found' });
    if (req.method !== allowed[action]) {
      res.setHeader('Allow', allowed[action]);
      return send(405, { error: 'Method not allowed' });
    }
    try {
      if (req.method === 'POST') {
        const origin = req.headers.origin;
        if (!origin || new URL(origin).host !== req.headers.host) throw failure(403, 'Invalid request origin');
        if (!req.headers['content-type']?.startsWith('application/json')) throw failure(415, 'JSON required');
        if (Number(req.headers['content-length'] || 0) > 8192) throw failure(413, 'Request too large');
      }
      const store = getStore();
      const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
      if (raw.length > 8192) throw failure(413, 'Request too large');
      let body;
      try { body = JSON.parse(raw); } catch { throw failure(400, 'Invalid JSON'); }
      if (!body || Array.isArray(body) || typeof body !== 'object') throw failure(400, 'Invalid request');
      const cookie = (req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
      const sessionPath = cookie && /^[a-f0-9]{64}$/.test(cookie) ? `sessions/${digest(cookie)}.json` : null;
      const session = sessionPath ? await store.read(sessionPath) : null;
      const staff = session?.role === 'staff' && session.expires > now();
      const ip = req.headers['x-vercel-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
      const subject = createHmac('sha256', env.STAFF_PASSWORD_HASH || 'unconfigured').update(String(ip)).digest('hex');

      if (action === 'session') return send(200, { staff: Boolean(staff) });
      if (action === 'logout') {
        if (sessionPath) await store.remove(sessionPath);
        res.setHeader('Set-Cookie', `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
        return send(200, { ok: true });
      }
      if (action === 'login') {
        if (!env.STAFF_USER || !env.STAFF_PASSWORD_HASH) throw failure(503, 'Staff login is not configured');
        if (typeof body.username !== 'string' || typeof body.password !== 'string' || body.username.length > 100 || body.password.length > 256) throw failure(400, 'Invalid credentials format');
        await rateLimit(store, `login/${subject}`, 8, 15 * 60 * 1000, now());
        const valid = await checkPassword(body.password, env.STAFF_PASSWORD_HASH);
        if (!valid || body.username !== env.STAFF_USER) throw failure(401, 'Invalid credentials');
        const token = randomBytes(32).toString('hex');
        await store.create(`sessions/${digest(token)}.json`, { role: 'staff', expires: now() + sessionSeconds * 1000 }, 1);
        if (sessionPath) await store.remove(sessionPath);
        res.setHeader('Set-Cookie', `${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${sessionSeconds}`);
        return send(200, { staff: true });
      }
      if (action === 'insights') {
        if (!staff) throw failure(401, 'Staff access required');
        const events = await store.scan('events/');
        const feedback = events.filter((e) => e.type === 'feedback');
        const requests = events.filter((e) => e.type === 'scenario_request');
        const counts = new Map();
        for (const e of requests) {
          const key = `${e.phase}|${e.own}|${e.opp}`;
          counts.set(key, (counts.get(key) || 0) + 1);
        }
        return send(200, { feedback_count: feedback.length, positive_feedback: feedback.filter((e) => e.useful).length,
          scenario_requests: requests.length, top_requested_scenarios: [...counts].sort((a, b) => b[1] - a[1]).slice(0, 10) });
      }
      const id = req.headers['idempotency-key'];
      if (!/^[a-f0-9-]{36}$/.test(id || '')) throw failure(400, 'A valid idempotency key is required');
      const note = body.note ?? '';
      if (typeof note !== 'string' || note.length > (action === 'feedback' ? 1200 : 800)) throw failure(400, 'Invalid note');
      let event;
      if (action === 'feedback') {
        if (typeof body.useful !== 'boolean' || !catalog.combos.some((s) => s.scenario_id === body.scenario_id)) throw failure(400, 'Invalid scenario or rating');
        event = { type: 'feedback', scenario_id: body.scenario_id, useful: body.useful, note };
      } else {
        if (!catalog.phases.includes(body.phase) || !catalog.formations.includes(body.own) || !catalog.formations.includes(body.opp)) throw failure(400, 'Invalid phase or formation');
        event = { type: 'scenario_request', phase: body.phase, own: body.own, opp: body.opp, note };
      }
      const path = `events/${action}/${id}.json`;
      const fingerprint = digest(JSON.stringify(event));
      const previous = await store.read(path);
      if (previous) {
        if (previous.fingerprint !== fingerprint) throw failure(409, 'Idempotency key already used');
        return send(200, { status: 'recorded', id });
      }
      await rateLimit(store, `writes/${subject}`, 10, 60 * 1000, now());
      await store.create(path, { ...event, fingerprint, id, created_at: new Date(now()).toISOString() });
      return send(201, { status: 'recorded', id });
    } catch (error) {
      const status = error.status || 503;
      return send(status, { error: status === 503 ? 'Service temporarily unavailable. No success has been confirmed.' : error.message });
    }
  };
}

export default createHandler();
