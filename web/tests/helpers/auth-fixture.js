import { randomUUID } from 'node:crypto';
import { createHandler, passwordHash } from '../../server/app.js';
import { memoryStore } from './memory-store.js';

export const ownerPassword = 'test-only-owner-password';
const hash = await passwordHash(ownerPassword);

export function authFixture(options = {}) {
  const memory = memoryStore();
  const env = { STAFF_USER: 'owner-test', STAFF_PASSWORD_HASH: hash, ...options.env };
  let time = Date.UTC(2026, 10, 16, 12);
  const handler = createHandler({ getStore: () => memory.store, now: () => time, ...options, env });
  async function call(action, body, headers = {}, request = {}) {
    const response = {
      headers: {},
      setHeader(key, value) { this.headers[key] = value; },
      status(status) { this.code = status; return this; },
      json(value) { this.body = value; return this; },
    };
    await handler({
      url: `/api/${action}`, method: body === undefined ? 'GET' : 'POST', body,
      socket: { remoteAddress: '127.0.0.1' },
      headers: {
        origin: 'https://test.local', host: 'test.local', 'content-type': 'application/json',
        'sec-fetch-site': 'same-origin', 'idempotency-key': randomUUID(), ...headers,
      },
      ...request,
    }, response);
    return response;
  }
  async function login() {
    const response = await call('login', { username: env.STAFF_USER, password: ownerPassword });
    return {
      response,
      cookie: response.headers['Set-Cookie']?.split(';')[0],
      csrf: response.body.csrfToken,
      headers: { cookie: response.headers['Set-Cookie']?.split(';')[0], 'x-csrf-token': response.body.csrfToken },
    };
  }
  return { ...memory, call, login, env, advance(ms) { time += ms; } };
}
