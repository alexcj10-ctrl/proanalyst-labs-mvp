import { randomBytes, createHash, createHmac, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { privateStore } from './storage.js';
import { getPublishedCatalog, getAdminContent, saveScenario, setScenarioStatus, deleteScenario } from './content.js';
import * as mediaOperations from './media.js';
import { errorText } from '../src/i18n/index.js';

const scrypt = promisify(scryptCallback);
const cookieName = '__Host-proanalyst_staff';
const sessionSeconds = 8 * 60 * 60;
const digest = (text) => createHash('sha256').update(text).digest('hex');
const failure = (status, message) => Object.assign(new Error(message), { status });
const isAdminAction = (action) => action.startsWith('admin-') || action === 'insights';
const userSession = { role: 'user', admin: false };

function checkOrigin(req, env) {
  let origin;
  try { origin = new URL(req.headers.origin); } catch { throw failure(403, 'Invalid request origin'); }
  const local = env.VERCEL !== '1' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  if (origin.host !== req.headers.host || origin.origin !== req.headers.origin ||
      (origin.protocol !== 'https:' && !(local && origin.protocol === 'http:')) ||
      (req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(req.headers['sec-fetch-site']))) {
    throw failure(403, 'Invalid request origin');
  }
}

function checkCsrf(req, session) {
  const token = req.headers['x-csrf-token'];
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token) ||
      !/^[a-f0-9]{64}$/.test(session.csrfToken || '') ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(session.csrfToken))) {
    throw failure(403, 'Invalid CSRF token');
  }
}

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

export function createHandler({ getStore = privateStore, env = process.env, now = () => Date.now(), media = mediaOperations } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, body) => res.status(status).json(body.error ? { ...body, error: errorText(body.error) } : body);
    const action = new URL(req.url, 'https://localhost').pathname.split('/').pop();
    const allowed = { login: 'POST', logout: 'POST', session: 'GET', catalog: 'GET', feedback: 'POST', 'scenario-requests': 'POST', insights: 'GET',
      'admin-content': 'GET', 'admin-events': 'GET', 'admin-scenarios': 'POST', 'admin-scenario-status': 'POST',
      'admin-scenario-delete': 'POST', 'admin-video-delete': 'POST', 'admin-upload-intent': 'POST',
      'admin-upload-token': 'POST', 'admin-upload-complete': 'POST' };
    if (!allowed[action]) return send(404, { error: 'Not found' });
    try {
      const cookie = (req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
      const sessionPath = cookie && /^[a-f0-9]{64}$/.test(cookie) ? `sessions/${digest(cookie)}.json` : null;
      // Anonymous administrative requests never invoke storage or upload operations.
      if (isAdminAction(action) && !sessionPath) throw failure(403, 'Administrator access required');
      if (action === 'session' && !sessionPath && req.method === 'GET') return send(200, userSession);
      const store = getStore();
      const session = sessionPath ? await store.read(sessionPath) : null;
      // Only the server-configured owner can be an administrator. Legacy staff sessions are not upgraded.
      const admin = Boolean(env.STAFF_USER && env.STAFF_PASSWORD_HASH && session?.role === 'admin' &&
        session.owner === env.STAFF_USER && session.credentialVersion === digest(env.STAFF_PASSWORD_HASH) &&
        session.expires > now() && /^[a-f0-9]{64}$/.test(session.csrfToken || ''));
      if (isAdminAction(action) && !admin) throw failure(403, 'Administrator access required');
      if (req.method !== allowed[action]) {
        res.setHeader('Allow', allowed[action]);
        return send(405, { error: 'Method not allowed' });
      }
      if (req.method === 'POST') {
        checkOrigin(req, env);
        if (admin && (isAdminAction(action) || action === 'logout')) checkCsrf(req, session);
        if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') throw failure(415, 'JSON required');
        if (Number(req.headers['content-length'] || 0) > 32768) throw failure(413, 'Request too large');
      }
      const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
      if (Buffer.byteLength(raw, 'utf8') > 32768) throw failure(413, 'Request too large');
      let body;
      try { body = JSON.parse(raw); } catch { throw failure(400, 'Invalid JSON'); }
      if (!body || Array.isArray(body) || typeof body !== 'object') throw failure(400, 'Invalid request');
      const ip = req.headers['x-vercel-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
      const subject = createHmac('sha256', env.STAFF_PASSWORD_HASH || 'unconfigured').update(String(ip)).digest('hex');

      if (action === 'session') return send(200, admin ? { role: 'admin', admin: true, displayName: 'Amministratore', csrfToken: session.csrfToken } : userSession);
      if (action === 'catalog') return send(200, await getPublishedCatalog(store));
      if (action === 'logout') {
        if (sessionPath) await store.remove(sessionPath);
        res.setHeader('Set-Cookie', `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
        return send(200, { ok: true, ...userSession });
      }
      if (action === 'login') {
        if (!env.STAFF_USER || !env.STAFF_PASSWORD_HASH) throw failure(503, 'Administrator login is not configured');
        if (typeof body.username !== 'string' || typeof body.password !== 'string' || body.username.length > 100 || body.password.length > 256) throw failure(400, 'Invalid credentials format');
        await rateLimit(store, `login/${subject}`, 8, 15 * 60 * 1000, now());
        const valid = await checkPassword(body.password, env.STAFF_PASSWORD_HASH);
        if (!valid || body.username !== env.STAFF_USER) throw failure(401, 'Invalid credentials');
        const token = randomBytes(32).toString('hex');
        const csrfToken = randomBytes(32).toString('hex');
        await store.create(`sessions/${digest(token)}.json`, {
          role: 'admin', owner: env.STAFF_USER, credentialVersion: digest(env.STAFF_PASSWORD_HASH), csrfToken,
          expires: now() + sessionSeconds * 1000,
        }, 1);
        if (sessionPath) await store.remove(sessionPath);
        res.setHeader('Set-Cookie', `${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${sessionSeconds}`);
        return send(200, { role: 'admin', admin: true, displayName: 'Amministratore', csrfToken });
      }
      if (action === 'admin-content') return send(200, await getAdminContent(store));
      if (action === 'insights' || action === 'admin-events') {
        const events = await store.scan('events/');
        if (action === 'admin-events') return send(200, { events: events.map((event) => ({
          id: event.id, type: event.type, scenario_id: event.scenario_id, useful: event.useful,
          phase: event.phase, own: event.own, opp: event.opp, note: event.note, created_at: event.created_at,
        })).sort((a, b) => b.created_at.localeCompare(a.created_at)) });
        const feedback = events.filter((e) => e.type === 'feedback');
        const requests = events.filter((e) => e.type === 'scenario_request');
        const counts = new Map();
        for (const e of requests) {
          const key = `${e.phase}|${e.own}|${e.opp}`;
          counts.set(key, (counts.get(key) || 0) + 1);
        }
        const content = await getAdminContent(store);
        return send(200, { feedback_count: feedback.length, positive_feedback: feedback.filter((e) => e.useful).length,
          scenario_requests: requests.length, top_requested_scenarios: [...counts].sort((a, b) => b[1] - a[1]).slice(0, 10),
          published_scenarios: content.scenarios.filter((s) => s.status === 'published').length,
          total_scenarios: content.scenarios.length, video_count: content.videos.length });
      }
      if (isAdminAction(action)) {
        await rateLimit(store, `admin/${subject}`, 60, 60 * 1000, now());
        const context = { sessionId: sessionPath, env, now: now() };
        if (action === 'admin-scenarios') return send(200, await saveScenario(store, body));
        if (action === 'admin-scenario-status') return send(200, await setScenarioStatus(store, body));
        if (action === 'admin-scenario-delete') return send(200, await deleteScenario(store, body));
        if (action === 'admin-video-delete') return send(200, await media.deleteVideo(store, body, context));
        if (action === 'admin-upload-intent') {
          await rateLimit(store, `uploads/${subject}`, 5, 15 * 60 * 1000, now());
          return send(201, await media.beginUpload(store, body, context));
        }
        if (action === 'admin-upload-token') return send(200, await media.uploadToken(store, req, body, context));
        if (action === 'admin-upload-complete') return send(200, await media.finalizeUpload(store, body, context));
      }
      const id = req.headers['idempotency-key'];
      if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id || '')) throw failure(400, 'A valid idempotency key is required');
      const note = body.note ?? '';
      if (typeof note !== 'string' || note.length > (action === 'feedback' ? 1200 : 800)) throw failure(400, 'Invalid note');
      let event;
      const catalog = await getPublishedCatalog(store);
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
      const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500 ? error.status : 503;
      return send(status, { error: status === 503 ? 'Service temporarily unavailable. No success has been confirmed.' : error.message });
    }
  };
}

export default createHandler();
