import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createHandler, passwordHash } from '../server/app.js';

const hash = await passwordHash('test-only-password');
function fixture() {
  const values = new Map();
  const store = {
    async read(key) { return values.get(key) || null; },
    async create(key, value) { if (values.has(key)) throw new Error('exists'); values.set(key, value); },
    async remove(key) { values.delete(key); },
    async scan(prefix) { return [...values].filter(([key]) => key.startsWith(prefix)).map(([, value]) => value); },
  };
  const handler = createHandler({ getStore: () => store, env: { STAFF_USER: 'admin', STAFF_PASSWORD_HASH: hash } });
  async function call(action, body, headers = {}) {
    const response = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(s) { this.code = s; return this; }, json(v) { this.body = v; } };
    await handler({ url: `/api/${action}`, method: body === undefined ? 'GET' : 'POST', body,
      headers: { origin: 'https://test.local', host: 'test.local', 'content-type': 'application/json', 'idempotency-key': randomUUID(), ...headers } }, response);
    return response;
  }
  return { call, store, values };
}

test('staff authentication, private insights, logout invalidation and cookie security', async () => {
  const { call } = fixture();
  assert.equal((await call('insights')).code, 401);
  assert.equal((await call('login', { username: 'admin', password: 'wrong' })).code, 401);
  const login = await call('login', { username: 'admin', password: 'test-only-password' });
  assert.equal(login.code, 200);
  const cookie = login.headers['Set-Cookie'];
  assert.match(cookie, /HttpOnly; Secure; SameSite=Strict/);
  assert.equal((await call('insights', undefined, { cookie })).code, 200);
  assert.equal((await call('logout', {}, { cookie })).code, 200);
  assert.equal((await call('insights', undefined, { cookie })).code, 401);
});

test('real write acknowledgment, retries do not duplicate, mismatched retry rejected', async () => {
  const { call, values } = fixture();
  const headers = { 'idempotency-key': randomUUID() };
  const body = { scenario_id: 'build_up|4-3-3|4-2-3-1|A', useful: true, note: 'test' };
  assert.equal((await call('feedback', body, headers)).code, 201);
  assert.equal((await call('feedback', body, headers)).code, 200);
  assert.equal((await call('feedback', { ...body, useful: false }, headers)).code, 409);
  assert.equal([...values.keys()].filter((s) => s.startsWith('events/')).length, 1);
  assert.equal((await call('scenario-requests', { phase: 'build_up', own: '5-4-1', opp: '4-3-3' })).code, 201);
});

test('rejects cross-origin, invalid data and overlong notes', async () => {
  const { call } = fixture();
  assert.equal((await call('login', {}, { origin: 'https://evil.test' })).code, 403);
  assert.equal((await call('feedback', { scenario_id: 'missing', useful: true })).code, 400);
  assert.equal((await call('scenario-requests', { phase: 'unknown', own: '4-3-3', opp: '4-3-3' })).code, 400);
  assert.equal((await call('scenario-requests', { note: 'x'.repeat(801) })).code, 400);
});

test('write failures never return recorded and login rate limit is durable', async () => {
  const f = fixture();
  for (let i = 0; i < 8; i++) assert.equal((await f.call('login', { username: 'admin', password: 'wrong' })).code, 401);
  assert.equal((await f.call('login', { username: 'admin', password: 'test-only-password' })).code, 429);
  f.store.create = async () => { throw new Error('storage down'); };
  const result = await f.call('feedback', { scenario_id: 'build_up|4-3-3|4-2-3-1|A', useful: true });
  assert.equal(result.code, 503);
  assert.notEqual(result.body.status, 'recorded');
});
