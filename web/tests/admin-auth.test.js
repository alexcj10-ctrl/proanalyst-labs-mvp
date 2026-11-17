import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { authFixture, ownerPassword } from './helpers/auth-fixture.js';

const administrative = [
  ['insights'], ['admin-content'], ['admin-events'],
  ['admin-scenarios', {}], ['admin-scenario-status', {}], ['admin-scenario-delete', {}],
  ['admin-video-delete', {}], ['admin-upload-intent', {}],
  ['admin-upload-token', { type: 'blob.generate-presigned-url', payload: { pathname: 'forged.mp4' } }],
  ['admin-upload-complete', {}],
];

test('anonymous users receive 403 on every administrative route, with no storage or upload side effects', async () => {
  let storageCalls = 0;
  let mediaCalls = 0;
  const deniedOperation = async () => { mediaCalls++; throw new Error('Must never be reached'); };
  const f = authFixture({
    getStore: () => { storageCalls++; throw new Error('Must not initialize private storage'); },
    media: { beginUpload: deniedOperation, uploadToken: deniedOperation, finalizeUpload: deniedOperation, deleteVideo: deniedOperation },
  });
  for (const [route, body] of administrative) {
    const response = await f.call(route, body);
    assert.equal(response.code, 403, route);
    assert.ok(response.body.error, route);
    assert.equal(response.headers['Cache-Control'], 'no-store');
    assert.equal((await f.call(route, body, {}, { method: 'PUT' })).code, 403, `${route} method bypass`);
  }
  assert.equal(storageCalls, 0);
  assert.equal(mediaCalls, 0);
});

test('browser-supplied role flags, forged cookies and missing sessions cannot grant administrative privileges', async () => {
  const f = authFixture();
  const forged = `__Host-proanalyst_staff=${'a'.repeat(64)}`;
  const response = await f.call('session', undefined, { cookie: forged, 'x-role': 'admin', authorization: 'Bearer admin' });
  assert.equal(response.code, 200);
  assert.equal(response.body.role, 'user');
  assert.equal(response.body.admin, false);
  assert.equal(response.body.csrfToken, undefined);
  for (const [route, body] of administrative) {
    assert.equal((await f.call(route, body && { ...body, role: 'admin', admin: true, staff: true }, {
      cookie: forged, 'x-role': 'admin', 'x-csrf-token': 'attacker',
    })).code, 403, route);
  }
  assert.equal([...f.values.keys()].some((key) => key.startsWith('content/') || key.startsWith('uploads/')), false);
});

test('only the configured owner can authenticate and sessions expose no credential material', async () => {
  const f = authFixture();
  const outsider = await f.call('login', { username: 'another-user', password: ownerPassword, role: 'admin', admin: true });
  assert.equal(outsider.code, 401);
  assert.equal(outsider.headers['Set-Cookie'], undefined);
  const { response, cookie, csrf, headers } = await f.login();
  assert.equal(response.code, 200);
  assert.deepEqual({ role: response.body.role, admin: response.body.admin, displayName: response.body.displayName }, {
    role: 'admin', admin: true, displayName: 'Amministratore',
  });
  assert.match(csrf, /^[a-f0-9]{64}$/);
  assert.match(cookie, /^__Host-proanalyst_staff=[a-f0-9]{64}$/);
  assert.match(response.headers['Set-Cookie'], /Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800/);
  assert.doesNotMatch(response.headers['Set-Cookie'], /Domain=/i);
  assert.ok(!JSON.stringify(response.body).includes(ownerPassword));
  assert.ok(!JSON.stringify(response.body).includes(f.env.STAFF_PASSWORD_HASH));
  const restored = await f.call('session', undefined, headers);
  assert.equal(restored.body.role, 'admin');
  assert.equal(restored.body.csrfToken, csrf);
  for (const route of ['insights', 'admin-content', 'admin-events']) {
    assert.equal((await f.call(route, undefined, headers)).code, 200, route);
  }
});

test('copied username whitespace is ignored while passwords and owner identity remain exact', async () => {
  const f = authFixture();
  const login = await f.call('login', { username: '  owner-test\n', password: ownerPassword });
  assert.equal(login.code, 200);
  assert.equal(login.body.role, 'admin');
  assert.equal((await f.call('login', { username: 'owner-test', password: ` ${ownerPassword} ` })).code, 401);
  assert.equal((await f.call('login', { username: 'another-user', password: ownerPassword })).code, 401);
});

test('administrative writes and authenticated logout require a matching session CSRF token', async () => {
  let mediaCalls = 0;
  const deniedOperation = async () => { mediaCalls++; throw new Error('Must never be reached'); };
  const f = authFixture({ media: {
    beginUpload: deniedOperation, uploadToken: deniedOperation, finalizeUpload: deniedOperation, deleteVideo: deniedOperation,
  } });
  const { cookie, headers } = await f.login();
  for (const [route, body] of administrative.filter(([, body]) => body !== undefined).concat([['logout', {}]])) {
    assert.equal((await f.call(route, body, { cookie })).code, 403, `${route} missing CSRF`);
    assert.equal((await f.call(route, body, { cookie, 'x-csrf-token': '0'.repeat(64) })).code, 403, `${route} forged CSRF`);
    assert.equal((await f.call(route, body, { ...headers, origin: 'https://malicious.example' })).code, 403, `${route} cross origin`);
    assert.equal((await f.call(route, body, { ...headers, origin: 'http://test.local' })).code, 403, `${route} wrong scheme`);
    assert.equal((await f.call(route, body, { ...headers, 'sec-fetch-site': 'cross-site' })).code, 403, `${route} fetch metadata`);
  }
  assert.equal(mediaCalls, 0);
  assert.equal((await f.call('session', undefined, headers)).body.admin, true);
});

test('CSRF tokens belong to one session and session renewal invalidates the previous cookie', async () => {
  const f = authFixture();
  const first = await f.login();
  const second = await f.login();
  assert.notEqual(first.csrf, second.csrf);
  assert.equal((await f.call('logout', {}, { cookie: first.cookie, 'x-csrf-token': second.csrf })).code, 403);
  const renewed = await f.call('login', { username: 'owner-test', password: ownerPassword }, first.headers);
  assert.equal(renewed.code, 200);
  assert.notEqual(renewed.headers['Set-Cookie']?.split(';')[0], first.cookie);
  assert.equal((await f.call('insights', undefined, first.headers)).code, 403);
  assert.equal((await f.call('insights', undefined, second.headers)).code, 200);
});

test('old staff sessions, expired sessions and credentials rotated on the server are denied', async () => {
  const f = authFixture();
  const oldToken = 'b'.repeat(64);
  const oldPath = `sessions/${createHash('sha256').update(oldToken).digest('hex')}.json`;
  await f.store.create(oldPath, { role: 'staff', expires: Date.UTC(2100, 0, 1) });
  const oldHeaders = { cookie: `__Host-proanalyst_staff=${oldToken}` };
  assert.equal((await f.call('insights', undefined, oldHeaders)).code, 403);
  assert.equal((await f.call('session', undefined, oldHeaders)).body.admin, false);
  const valid = await f.login();
  f.advance(8 * 60 * 60 * 1000 + 1);
  assert.equal((await f.call('insights', undefined, valid.headers)).code, 403);
  const fresh = await f.login();
  f.env.STAFF_PASSWORD_HASH = `${'0'.repeat(32)}:${'1'.repeat(128)}`;
  assert.equal((await f.call('insights', undefined, fresh.headers)).code, 403);
  assert.equal((await f.call('session', undefined, fresh.headers)).body.admin, false);
});

test('a stored admin session still requires its configured owner and credential binding', async () => {
  const f = authFixture();
  const session = await f.login();
  f.env.STAFF_USER = 'different-owner';
  assert.equal((await f.call('insights', undefined, session.headers)).code, 403);
  f.env.STAFF_USER = 'owner-test';
  const path = [...f.values.keys()].find((key) => key.startsWith('sessions/'));
  f.values.set(path, { role: 'admin', expires: Date.UTC(2100, 0, 1) });
  assert.equal((await f.call('insights', undefined, session.headers)).code, 403);
});

test('public catalog preserves 24 published originals without exposing private administration state', async () => {
  const f = authFixture();
  const response = await f.call('catalog');
  assert.equal(response.code, 200);
  assert.equal(response.body.combos.length, 24);
  assert.equal(new Set(response.body.combos.map((scenario) => scenario.scenario_id)).size, 24);
  assert.ok(response.body.combos.every((scenario) => scenario.video_url.startsWith('https://') && scenario.video_url.endsWith('.mp4')));
  assert.equal(response.body.videos, undefined);
  assert.equal(response.body.events, undefined);
  assert.equal(response.body.csrfToken, undefined);
  assert.equal((await f.call('session')).body.role, 'user');
});

test('the administrator can publish and deactivate a new scenario without changing the 24 original records', async () => {
  const f = authFixture();
  const admin = await f.login();
  const initial = (await f.call('admin-content', undefined, admin.headers)).body;
  const base = initial.scenarios[0];
  const scenario = {
    phase: 'build_up', own: '5-3-2', opp: '4-3-3', variant: 'A',
    title: 'Uscita controllata con il terzo uomo', objective: 'Superare la prima pressione mantenendo le distanze di sostegno.',
    principles: ['Occupare ampiezza e profondità.'], key_actions: ['Attirare la pressione prima della trasmissione.'],
    coaching_points: ['Controllare la postura del ricevente.'], risk_notes: ['Proteggere lo spazio centrale in caso di perdita.'],
    profile: { risk: 'Medio', verticality: 'Media', tempo: 'Controllato' }, video_id: base.video_id,
  };
  const draft = await f.call('admin-scenarios', { revision: initial.revision, scenario }, admin.headers);
  assert.equal(draft.code, 200);
  const created = draft.body.scenarios.find((item) => item.title === scenario.title);
  assert.ok(created.scenario_id.startsWith('custom-'));
  assert.equal(created.status, 'draft');
  assert.equal((await f.call('catalog')).body.combos.length, 24);
  const published = await f.call('admin-scenario-status', {
    revision: draft.body.revision, scenario_id: created.scenario_id, status: 'published',
  }, admin.headers);
  assert.equal(published.code, 200);
  const visible = (await f.call('catalog')).body.combos;
  assert.equal(visible.length, 25);
  assert.equal(visible.find((item) => item.scenario_id === created.scenario_id).video_url, base.video_url);
  assert.equal((await f.call('feedback', { scenario_id: created.scenario_id, useful: true, note: 'Test di integrazione' })).code, 201);
  assert.equal((await f.call('admin-scenario-status', {
    revision: published.body.revision, scenario_id: created.scenario_id, status: 'inactive',
  })).code, 403);
  const inactive = await f.call('admin-scenario-status', {
    revision: published.body.revision, scenario_id: created.scenario_id, status: 'inactive',
  }, admin.headers);
  assert.equal(inactive.code, 200);
  assert.equal((await f.call('catalog')).body.combos.length, 24);
  const deleted = await f.call('admin-scenario-delete', {
    revision: inactive.body.revision, scenario_id: created.scenario_id,
  }, admin.headers);
  assert.equal(deleted.code, 200);
  assert.equal(deleted.body.scenarios.length, 24);
  assert.deepEqual(deleted.body.scenarios, initial.scenarios);
  assert.deepEqual(deleted.body.videos, initial.videos);
});

test('private storage failure fails closed instead of granting a role or acknowledging an upload', async () => {
  const f = authFixture({ getStore: () => { throw new Error('Private storage unavailable'); } });
  const headers = { cookie: `__Host-proanalyst_staff=${'a'.repeat(64)}` };
  for (const route of ['session', 'admin-content']) {
    const response = await f.call(route, undefined, headers);
    assert.equal(response.code, 503);
    assert.notEqual(response.body.admin, true);
  }
  const login = await f.call('login', { username: 'owner-test', password: ownerPassword });
  assert.equal(login.code, 503);
  assert.equal(login.headers['Set-Cookie'], undefined);
});
