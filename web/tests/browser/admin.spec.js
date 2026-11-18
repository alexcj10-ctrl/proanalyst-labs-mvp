import { test, expect } from '@playwright/test';
import { createHandler, passwordHash } from '../../server/app.js';
import { memoryStore } from '../helpers/memory-store.js';
import { getPublishedCatalog } from '../../server/content.js';

const password = 'browser-test-only-password';
const hash = await passwordHash(password);

// Browser UI calls the real handler and validators against an isolated test store.
async function backend(page, store = memoryStore().store) {
  const handler = createHandler({ getStore: () => store, env: { STAFF_USER: 'owner', STAFF_PASSWORD_HASH: hash } });
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const headers = { ...request.headers(), host: new URL(request.url()).host };
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(s) { this.code = s; return this; }, json(v) { this.body = v; } };
    await handler({ url: request.url(), method: request.method(), headers, body: request.postData() || '{}', socket: { remoteAddress: '127.0.0.1' } }, res);
    await route.fulfill({ status: res.code, headers: res.headers, json: res.body });
  });
  return store;
}

async function login(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Accesso amministratore', exact: true }).click();
  await page.getByLabel('Nome utente').fill('owner');
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Accedi', exact: true }).click();
  await page.getByRole('button', { name: 'Salta introduzione' }).click();
  await page.getByRole('button', { name: 'Pannello amministratore' }).click();
}

test('video classification persists and public selections generate the published scenario', async ({ page, browser }) => {
  const store = await backend(page);
  await login(page);
  await expect(page.locator('.adminVideoCard')).toHaveCount(24);
  const videoCard = page.locator('.adminVideoCard').first();
  const filename = await videoCard.locator('h3').innerText();
  await videoCard.getByRole('button', { name: 'Classifica video', exact: true }).click();
  await expect(page.getByLabel('Video dello scenario')).toHaveValue(filename);
  await page.getByLabel('Fase di gioco', { exact: true }).selectOption('progression');
  await page.getByLabel('Sistema della squadra in possesso', { exact: true }).fill('3-2-4-1');
  await page.getByLabel('Sistema della squadra in non possesso', { exact: true }).fill('5-3-2');
  await page.getByLabel('Variante', { exact: true }).selectOption('B');
  await page.getByLabel('Titolo dello scenario').fill('Prova di progressione attraverso il terzo uomo');
  await page.getByLabel('Obiettivo tattico').fill('Superare la linea intermedia con il terzo uomo.');
  for (const label of ['Principi di gioco', 'Azioni chiave', 'Indicazioni per l’allenatore', 'Rischi tattici']) {
    await page.getByLabel(label, { exact: true }).fill('Controllare le distanze tra i reparti.');
  }
  await page.getByRole('button', { name: 'Salva bozza', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Bozza salvata');
  expect((await getPublishedCatalog(store)).combos).toHaveLength(24);
  const created = page.locator('.adminScenarioCard').filter({ hasText: 'Prova di progressione attraverso il terzo uomo' });
  await page.getByRole('status').getByRole('button', { name: 'Pubblica ora', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Scenario pubblicato');
  expect((await getPublishedCatalog(store)).combos).toHaveLength(25);
  const published = (await getPublishedCatalog(store)).combos.find((scenario) => scenario.title === 'Prova di progressione attraverso il terzo uomo');
  expect(published).toMatchObject({ phase: 'progression', own: '3-2-4-1', opp: '5-3-2', variant: 'B', video: filename });
  const visitor = await browser.newPage();
  await backend(visitor, store);
  await visitor.goto('/');
  await visitor.getByRole('button', { name: 'Entra nella demo' }).click();
  await visitor.getByRole('button', { name: 'Salta introduzione' }).click();
  await visitor.getByRole('button', { name: /^Progressione / }).click();
  await visitor.locator('.selectorPanel').first().getByRole('button', { name: '3-2-4-1', exact: true }).click();
  await visitor.locator('.selectorPanel').last().getByRole('button', { name: '5-3-2', exact: true }).click();
  await expect(visitor.locator('.solutionsGrid')).toContainText('Soluzione B');
  await visitor.getByRole('button', { name: 'Genera', exact: false }).click();
  await expect(visitor.locator('.tacticalDetail h2')).toHaveText(published.title);
  await expect(visitor.locator('.analysisVideo')).toHaveAttribute('src', published.video_url);
  await expect(visitor.getByRole('button', { name: 'Pannello amministratore' })).toHaveCount(0);
  await visitor.getByRole('button', { name: 'Libreria video' }).click();
  await visitor.locator('.libraryToolbar select').selectOption('progression');
  await expect(visitor.locator('.libraryCard')).toHaveCount(1);
  await expect(visitor.locator('.libraryCard')).toContainText(published.title);
  await visitor.close();
  await page.reload();
  await page.getByRole('button', { name: 'Pannello amministratore' }).click();
  await page.getByRole('button', { name: 'Gestione scenari', exact: true }).click();
  await created.getByRole('button', { name: 'Disattiva', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Scenario disattivato');
  expect((await getPublishedCatalog(store)).combos).toHaveLength(24);
  await page.getByRole('button', { name: 'Statistiche', exact: true }).click();
  await expect(page.locator('.adminStats')).toContainText('Video disponibili');
  await page.getByRole('button', { name: 'Feedback e richieste', exact: true }).click();
  await expect(page.locator('.adminPanel')).toContainText('Non sono ancora presenti riscontri');
  await page.getByRole('button', { name: 'Esci', exact: true }).filter({ visible: true }).click();
  await page.getByRole('button', { name: 'Entra nella demo' }).click();
  await expect(page.getByRole('button', { name: 'Pannello amministratore' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Libreria video' }).click();
  await expect(page.locator('.libraryCard')).toHaveCount(24);
});

test('save and publish opens the exact analysis and failed publication preserves the editor', async ({ page }) => {
  const store = await backend(page);
  await login(page);
  await page.locator('.adminVideoCard').first().getByRole('button', { name: 'Classifica video', exact: true }).click();
  await page.getByLabel('Sistema della squadra in possesso', { exact: true }).fill('4-4-2');
  await page.getByLabel('Sistema della squadra in non possesso', { exact: true }).fill('3-4-2-1');
  await page.getByLabel('Titolo dello scenario').fill('Progressione per vie interne');
  await page.getByLabel('Obiettivo tattico').fill('Trovare il terzo uomo per superare la prima pressione.');
  for (const label of ['Principi di gioco', 'Azioni chiave', 'Indicazioni per l’allenatore', 'Rischi tattici']) {
    await page.getByLabel(label, { exact: true }).fill('Controllare distanze e tempi di smarcamento.');
  }
  const request = page.waitForRequest('**/api/admin-scenarios');
  await page.getByRole('button', { name: 'Salva e pubblica', exact: true }).click();
  expect((await request).postDataJSON().publish).toBe(true);
  await expect(page.getByRole('status')).toContainText('Scenario pubblicato');
  const catalog = await getPublishedCatalog(store);
  const published = catalog.combos.find(s => s.own === '4-4-2' && s.opp === '3-4-2-1');
  expect(catalog.revision).toBe(1);
  expect(published.phase).toBe('build_up');
  await page.getByRole('button', { name: 'Apri in Analisi tattica', exact: true }).click();
  await expect(page.locator('.phaseCard.active')).toContainText('Costruzione dal basso');
  await expect(page.locator('.selectorPanel').first().getByRole('button', { name: '4-4-2', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.selectorPanel').last().getByRole('button', { name: '3-4-2-1', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.analysisVideo')).toHaveAttribute('src', published.video_url);
  await expect(page.locator('.tacticalDetail h2')).toHaveText(published.title);
  await page.getByRole('button', { name: 'Pannello amministratore' }).click();
  await page.locator('.adminVideoCard').first().getByRole('button', { name: 'Classifica video', exact: true }).click();
  await page.getByLabel('Sistema della squadra in possesso', { exact: true }).fill('4-4-2');
  await page.getByLabel('Sistema della squadra in non possesso', { exact: true }).fill('3-4-2-1');
  await page.getByLabel('Titolo dello scenario').fill('Tentativo duplicato da conservare nel modulo');
  await page.getByLabel('Obiettivo tattico').fill('Conservare il lavoro se la pubblicazione viene rifiutata.');
  for (const label of ['Principi di gioco', 'Azioni chiave', 'Indicazioni per l’allenatore', 'Rischi tattici']) {
    await page.getByLabel(label, { exact: true }).fill('Non sovrascrivere lo scenario pubblicato.');
  }
  await page.getByRole('button', { name: 'Salva e pubblica', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Esiste già uno scenario pubblicato');
  await expect(page.getByLabel('Titolo dello scenario')).toHaveValue('Tentativo duplicato da conservare nel modulo');
  expect(await getPublishedCatalog(store)).toEqual(catalog);
});

test('public browser flags never expose the admin panel; catalog failures hide stale content', async ({ page }) => {
  await backend(page);
  await page.addInitScript(() => {
    localStorage.setItem('role', 'admin'); localStorage.setItem('staff', 'true'); localStorage.setItem('admin', 'true');
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Entra nella demo' }).click();
  await page.getByRole('button', { name: 'Salta introduzione' }).click();
  await expect(page.getByRole('button', { name: 'Pannello amministratore' })).toHaveCount(0);
  await page.route('**/api/catalog', (route) => route.fulfill({ status: 503, json: { error: 'Service unavailable' } }));
  await page.reload();
  await page.getByRole('button', { name: 'Entra nella demo' }).click();
  await expect(page.getByRole('button', { name: 'Riprova', exact: false })).toBeVisible();
  await expect(page.locator('.analysisVideo')).toHaveCount(0);
  await expect(page.locator('.libraryCard')).toHaveCount(0);
});

test('administrator panel and editor fit mobile screens', async ({ page }) => {
  await backend(page);
  await login(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.adminUploadCard')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.getByRole('button', { name: 'Gestione scenari', exact: true }).click();
  await page.getByRole('button', { name: 'Nuovo scenario', exact: true }).click();
  await expect(page.getByLabel('Titolo dello scenario')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: 'test-results/admin-mobile.png', fullPage: true });
});

test('mobile owner login supports pasted usernames and optional password visibility', async ({ page }) => {
  await backend(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Accesso amministratore', exact: true }).click();
  const username = page.getByLabel('Nome utente', { exact: true });
  const secret = page.getByLabel('Password', { exact: true });
  await expect(username).toHaveAttribute('autocapitalize', 'none');
  await expect(username).toHaveAttribute('autocorrect', 'off');
  await username.fill('  owner  ');
  await secret.fill(password);
  await expect(secret).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Mostra password', exact: true }).click();
  await expect(secret).toHaveAttribute('type', 'text');
  await expect(secret).toHaveValue(password);
  await page.getByRole('button', { name: 'Nascondi password', exact: true }).click();
  await expect(secret).toHaveAttribute('type', 'password');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  const request = page.waitForRequest('**/api/login');
  await page.getByRole('button', { name: 'Accedi', exact: true }).click();
  expect((await request).postDataJSON()).toEqual({ username: 'owner', password });
  await page.getByRole('button', { name: 'Salta introduzione' }).click();
  await page.getByRole('combobox', { name: 'Sezione', exact: true }).selectOption('admin');
  await expect(page.getByRole('heading', { name: 'Pannello amministratore', exact: true })).toBeVisible();
});
