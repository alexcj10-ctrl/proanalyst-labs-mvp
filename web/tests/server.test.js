import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { authFixture as fixture, ownerPassword } from './helpers/auth-fixture.js';

test('owner authentication, private insights, logout invalidation and cookie security', async () => {
  const { call, login } = fixture();
  assert.equal((await call('insights')).code, 403);
  assert.equal((await call('login', { username: 'owner-test', password: 'wrong' })).code, 401);
  const session = await login();
  assert.equal(session.response.code, 200);
  assert.match(session.response.headers['Set-Cookie'], /HttpOnly; Secure; SameSite=Strict/);
  assert.equal((await call('insights', undefined, session.headers)).code, 200);
  assert.equal((await call('logout', {}, session.headers)).code, 200);
  assert.equal((await call('insights', undefined, session.headers)).code, 403);
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
  for (let i = 0; i < 8; i++) assert.equal((await f.call('login', { username: 'owner-test', password: 'wrong' })).code, 401);
  assert.equal((await f.call('login', { username: 'owner-test', password: ownerPassword })).code, 429);
  f.store.create = async () => { throw new Error('storage down'); };
  const result = await f.call('feedback', { scenario_id: 'build_up|4-3-3|4-2-3-1|A', useful: true });
  assert.equal(result.code, 503);
  assert.notEqual(result.body.status, 'recorded');
});
