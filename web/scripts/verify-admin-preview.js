// Real preview acceptance test. Creates and removes only its own test scenario/video.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const origin = new URL(process.argv[2]).origin;
assert.match(origin, /^https:\/\/proanalyst-labs-[a-z0-9]+-alejandros-projects-a7058275\.vercel\.app$/);
const link = JSON.parse(await readFile('.vercel/project.json'));
assert.equal(link.projectId, 'prj_Mlq2vXazedm3goNlECwBKJhHS9x3');
const credentials = JSON.parse(await readFile(process.env.STAFF_ACCESS_FILE));
assert.equal(credentials.project, link.projectId);
assert.ok(process.env.VERCEL_OIDC_TOKEN, 'A same-project preview OIDC token is required');
const protection = { 'x-vercel-trusted-oidc-idp-token': process.env.VERCEL_OIDC_TOKEN };
await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext();
const visitor = await browser.newContext();
for (const ctx of [context, visitor]) {
  await ctx.route(`${origin}/**`, (route) => route.continue({ headers: { ...route.request().headers(), ...protection } }));
}
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
let csrfToken = '';
let testScenarioId;
let testVideoId;
let testVideoUrl;
const report = { preview: origin, checked_at: new Date().toISOString(), checks: [], cleanup: false };

async function api(action, body, { publicUser = false, csrf = csrfToken } = {}) {
  const response = await (publicUser ? visitor : context).request.fetch(`${origin}/api/${action}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...protection, Origin: origin, ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
    ...(body === undefined ? {} : { data: body }),
  });
  return { status: response.status(), data: await response.json() };
}

try {
  const before = await api('catalog', undefined, { publicUser: true });
  assert.equal(before.status, 200); assert.equal(before.data.combos.length, 24);
  for (const [action, body] of [['insights'], ['admin-content'], ['admin-events'], ['admin-scenarios', {}], ['admin-scenario-status', {}], ['admin-scenario-delete', {}], ['admin-video-delete', {}], ['admin-upload-intent', {}], ['admin-upload-token', {}], ['admin-upload-complete', {}]]) {
    assert.equal((await api(action, body, { publicUser: true })).status, 403, action);
  }
  report.checks.push('all 10 administrative endpoints reject public users with HTTP 403', '24 original scenarios published');
  assert.equal((await page.goto(origin)).status(), 200);
  await page.getByRole('button', { name: 'Accesso amministratore', exact: true }).click();
  await page.getByLabel('Nome utente').fill(credentials.username);
  await page.getByLabel('Password').fill(credentials.password);
  await page.getByRole('button', { name: 'Accedi', exact: true }).click();
  await page.getByRole('button', { name: 'Salta introduzione' }).click({ timeout: 45000 });
  await page.getByRole('button', { name: 'Pannello amministratore' }).click();
  await page.locator('.adminVideoCard').first().waitFor();
  const session = await api('session');
  assert.equal(session.data.role, 'admin'); csrfToken = session.data.csrfToken;
  const cookie = (await context.cookies(origin)).find((item) => item.name === '__Host-proanalyst_staff');
  assert.ok(cookie.httpOnly && cookie.secure && cookie.sameSite === 'Strict');
  assert.equal((await api('admin-upload-intent', {}, { csrf: '' })).status, 403);
  report.checks.push('owner login and protected cookie', 'missing CSRF token rejected');
  const completion = page.waitForResponse((response) => response.url() === `${origin}/api/admin-upload-complete`, { timeout: 120000 });
  await page.locator('#admin-video-file').setInputFiles(resolve('test-results/admin-upload-test.mp4'));
  await page.getByRole('button', { name: 'Carica video', exact: true }).click();
  const uploadResponse = await completion;
  assert.equal(uploadResponse.status(), 200, JSON.stringify(await uploadResponse.json()));
  let state = await uploadResponse.json();
  const uploaded = state.videos.find((video) => video.filename === 'admin-upload-test.mp4' && !video.original);
  assert.ok(uploaded?.verified); testVideoId = uploaded.id; testVideoUrl = uploaded.url;
  report.checks.push('real browser multipart upload directly to Blob', 'server MP4 verification and persistent media registration');
  const videoCard = page.locator('.adminVideoCard').filter({ hasText: 'admin-upload-test.mp4' });
  await videoCard.getByRole('button', { name: 'Anteprima video', exact: true }).click();
  await page.locator('.adminVideoPreview').evaluate(async (video) => { video.muted = true; await video.play(); });
  await page.waitForFunction(() => document.querySelector('.adminVideoPreview')?.currentTime > 0);
  await page.locator('.adminVideoPreview').evaluate((video) => { video.pause(); video.currentTime = 1; });
  await page.waitForFunction(() => { const video = document.querySelector('.adminVideoPreview'); return video && !video.seeking && Math.abs(video.currentTime - 1) < .2; });
  report.checks.push('uploaded video playback and seek');
  const seed = before.data.combos[0];
  const fields = ['phase', 'own', 'opp', 'variant', 'title', 'objective', 'principles', 'key_actions', 'coaching_points', 'risk_notes', 'profile'];
  const scenario = { ...Object.fromEntries(fields.map((key) => [key, seed[key]])), phase: 'progression',
    title: 'Verifica automatica riservata alla preview', video_id: testVideoId };
  let result = await api('admin-scenarios', { revision: state.revision, scenario });
  assert.equal(result.status, 200); state = result.data;
  testScenarioId = state.scenarios.find((item) => item.video_id === testVideoId).scenario_id;
  assert.equal((await api('catalog', undefined, { publicUser: true })).data.combos.length, 24);
  result = await api('admin-scenario-status', { revision: state.revision, scenario_id: testScenarioId, status: 'published' });
  assert.equal(result.status, 200); state = result.data;
  const published = await api('catalog', undefined, { publicUser: true });
  assert.equal(published.data.combos.length, 25);
  assert.equal(published.data.combos.find((item) => item.scenario_id === testScenarioId).video_url, testVideoUrl);
  // New browser proves publication is visible without another build or an admin cookie.
  const publicPage = await visitor.newPage();
  await publicPage.goto(origin);
  await publicPage.getByRole('button', { name: 'Entra nella demo' }).click();
  await publicPage.getByRole('button', { name: 'Salta introduzione' }).click();
  await publicPage.getByRole('button', { name: 'Libreria video' }).click();
  await publicPage.getByPlaceholder('Cerca sistema di gioco, principio, obiettivo…').fill(scenario.title);
  await publicPage.locator('.libraryCard').getByRole('button', { name: 'Apri analisi' }).click();
  assert.equal(await publicPage.locator('.analysisVideo').getAttribute('src'), testVideoUrl);
  assert.equal(await publicPage.getByRole('button', { name: 'Pannello amministratore' }).count(), 0);
  report.checks.push('draft hidden, published scenario visible in a new public browser without deploy');
  await page.getByRole('button', { name: 'Statistiche', exact: true }).click();
  await page.locator('.adminStats').waitFor();
  await page.screenshot({ path: 'test-results/admin-preview-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.getByRole('button', { name: 'Feedback e richieste', exact: true }).click();
  await page.getByRole('button', { name: 'Gestione scenari', exact: true }).click();
  await page.getByRole('button', { name: 'Nuovo scenario', exact: true }).click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: 'test-results/admin-preview-mobile.png', fullPage: true });
  report.checks.push('private statistics and feedback', 'desktop and mobile panel/editor');
  result = await api('admin-scenario-status', { revision: state.revision, scenario_id: testScenarioId, status: 'inactive' });
  assert.equal(result.status, 200);
  assert.equal((await api('catalog', undefined, { publicUser: true })).data.combos.length, 24);
  report.checks.push('deactivated scenario immediately removed from public catalog');
  assert.deepEqual(errors, []);
} finally {
  // Cleanup targets only the UUIDs returned during this test, never original content.
  if (csrfToken && (testScenarioId || testVideoId)) {
    let state = (await api('admin-content')).data;
    if (testScenarioId) {
      const deleted = await api('admin-scenario-delete', { revision: state.revision, scenario_id: testScenarioId });
      assert.equal(deleted.status, 200); state = deleted.data;
    }
    if (testVideoId) {
      const deleted = await api('admin-video-delete', { revision: state.revision, video_id: testVideoId });
      assert.equal(deleted.status, 200); state = deleted.data;
    }
    assert.equal(state.videos.length, 24); assert.equal(state.scenarios.length, 24);
    report.cleanup = true;
  }
  if (csrfToken) {
    assert.equal((await api('logout', {})).status, 200);
    assert.equal((await api('admin-content')).status, 403);
  }
  await writeFile('admin-preview-verification.json', JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
