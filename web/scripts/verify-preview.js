import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import catalog from '../src/data/catalog.json' with { type: 'json' };
import media from '../src/data/media.json' with { type: 'json' };

const origin = new URL(process.argv[2]).origin;
if (!origin.includes('proanalyst-labs-') || !origin.endsWith('.vercel.app')) throw new Error('Unexpected preview target');
const credentials = JSON.parse(await readFile(process.env.STAFF_ACCESS_FILE, 'utf8'));
const headers = { 'x-vercel-trusted-oidc-idp-token': process.env.VERCEL_OIDC_TOKEN };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext();
// Never send the deployment-protection token to Blob or any third-party origin.
await context.route(`${origin}/**`, (route) => route.continue({ headers: { ...route.request().headers(), ...headers } }));
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const report = { preview: origin, videos: [], checks: [] };
try {
  const navigation = await page.goto(origin);
  console.log(`Preview HTTP ${navigation.status()}`);
  await page.getByRole('button', { name: "Entra nella demo" }).click();
  await page.getByRole('button', { name: "Salta introduzione" }).click();
  await page.getByRole('button', { name: "Genera", exact: false }).click();
  for (const item of catalog.combos) {
    await page.getByRole('button', { name: "Libreria video" }).click();
    await page.locator('.libraryCard').nth(catalog.combos.indexOf(item)).getByRole('button', { name: "Apri analisi" }).click();
    const video = page.locator('.analysisVideo');
    assert.equal(await video.getAttribute('src'), media[item.video].url);
    await video.evaluate(async (el) => {
      el.muted = true;
      await el.play();
    });
    await page.waitForFunction(() => { const el = document.querySelector('.analysisVideo'); return el && el.currentTime > 0 && Number.isFinite(el.duration); }, { timeout: 30000 });
    const target = await video.evaluate((el) => { el.pause(); const time = el.duration * 0.6; el.currentTime = time; return time; });
    await page.waitForFunction((time) => { const el = document.querySelector('.analysisVideo'); return el && !el.seeking && Math.abs(el.currentTime - time) < 1 && el.readyState >= 2; }, target, { timeout: 30000 });
    report.videos.push({ filename: item.video, playback: true, seek: true });
    console.log(`Playback + seek ${report.videos.length}/24: ${item.video}`);
  }
  const request = async (action, body) => {
    const response = await context.request.fetch(`${origin}/api/${action}`, { method: body === undefined ? 'GET' : 'POST',
      headers: { ...headers, Origin: origin, 'Idempotency-Key': randomUUID() }, ...(body ? { data: body } : {}) });
    return { status: response.status(), body: await response.json() };
  };
  assert.equal((await request('insights')).status, 401);
  assert.equal((await request('login', { username: credentials.username, password: 'incorrect-test-password' })).status, 401);
  assert.equal((await request('login', credentials)).status, 200);
  const before = await request('insights');
  assert.equal(before.status, 200);
  const feedback = await request('feedback', { scenario_id: catalog.combos[0].scenario_id, useful: true, note: 'Automated preview acceptance test' });
  assert.equal(feedback.status, 201);
  assert.equal(feedback.body.status, 'recorded');
  const scenario = await request('scenario-requests', { phase: 'build_up', own: '5-4-1', opp: '4-3-3', note: 'Automated preview acceptance test' });
  assert.equal(scenario.status, 201);
  const after = await request('insights');
  assert.equal(after.body.feedback_count, before.body.feedback_count + 1);
  assert.equal(after.body.scenario_requests, before.body.scenario_requests + 1);
  assert.equal((await request('logout', {})).status, 200);
  assert.equal((await request('insights')).status, 401);
  report.checks.push('staff authorization', 'wrong password rejected', 'persistent feedback', 'persistent scenario request', 'private insights', 'logout revocation');
  assert.deepEqual(errors, []);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  report.checks.push('mobile layout', 'no browser runtime errors');
} catch (error) {
  console.log('Page title:', await page.title());
  console.log('Runtime errors:', JSON.stringify(errors));
  await page.screenshot({ path: 'test-results/preview-failure.png' });
  throw error;
} finally {
  await writeFile(new URL('../preview-verification.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
console.log('Preview acceptance checks passed.');
