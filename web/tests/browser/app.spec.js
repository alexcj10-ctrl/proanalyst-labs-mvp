import { test, expect } from '@playwright/test';
import sourceCatalog from '../../src/data/catalog.json' with { type: 'json' };
import { catalog } from '../../src/catalog.js';

async function enterDemo(page) {
  await page.goto('/');
  await page.getByRole('button', { name: "Entra nella demo" }).click();
  await expect(page.locator('.introScreen video')).toHaveAttribute('src', '/intro.mp4');
  await page.getByRole('button', { name: "Salta introduzione" }).click();
}

test('complete deterministic workflow without API, preserving personal data', async ({ page }) => {
  const apiRequests = [];
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (/\/(demo-login|catalog|generate|status)(\/|\?|$)/.test(new URL(request.url()).pathname)) apiRequests.push(request.url());
  });
  await enterDemo(page);
  await page.getByRole('button', { name: "Genera", exact: false }).click();
  await expect(page.locator('.tacticalDetail h2')).toHaveText("Uscita dal pressing con portiere e terzo uomo");
  await expect(page.locator('.analysisVideo')).toHaveAttribute('src', /public.blob.vercel-storage.com/);
  await page.getByRole('button', { name: "Salva analisi" }).click();
  await page.getByRole('button', { name: "Utile ↑", exact: true }).click();
  await expect(page.getByRole('status')).toContainText("Servizio temporaneamente non disponibile");

  await page.getByRole('button', { name: "Libreria video" }).click();
  await expect(page.locator('.libraryCard')).toHaveCount(24);
  await page.locator('.libraryToolbar select').selectOption('finishing');
  await expect(page.locator('.libraryCard')).toHaveCount(5);
  await page.locator('.libraryToolbar select').selectOption('all');
  await page.getByPlaceholder("Cerca sistema di gioco, principio, obiettivo…").fill("portiere e terzo uomo");
  await expect(page.locator('.libraryCard')).toHaveCount(1);
  await page.getByPlaceholder("Cerca sistema di gioco, principio, obiettivo…").fill('no such scenario');
  await expect(page.getByText("Nessuno scenario trovato")).toBeVisible();
  await page.getByPlaceholder("Cerca sistema di gioco, principio, obiettivo…").fill('');
  await page.locator('.libraryCard').first().getByRole('button', { name: "Apri analisi" }).click();
  await expect(page.locator('.resultCard .solutionBadge')).toHaveText("Soluzione A");
  await page.getByRole('button', { name: "Confronta le soluzioni" }).click();
  await expect(page.locator('.comparisonCard')).toHaveCount(2);
  await page.getByRole('button', { name: "Apri Soluzione B" }).click();
  await expect(page.locator('.resultCard .solutionBadge')).toHaveText("Soluzione B");
  await expect(page.locator('.tacticalDetail h2')).toHaveText("Uscita sulle corsie esterne");
  await page.locator('.selectorPanel').first().getByRole('button', { name: '5-4-1', exact: true }).click();
  await expect(page.getByText("Non ancora in catalogo", { exact: true })).toBeVisible();
  await expect(page.locator('.resultCard')).toHaveCount(0);
  await page.locator('.requestBox button').click();
  await expect(page.getByRole('status')).toContainText("Servizio temporaneamente non disponibile");

  await page.reload();
  await page.getByRole('button', { name: "Entra nella demo" }).click();
  await expect(page.locator('.introScreen')).toHaveCount(0);
  await page.getByRole('button', { name: "Le mie analisi" }).click();
  await expect(page.locator('.historyGrid .historyCard')).toHaveCount(1);
  await expect(page.locator('.historyRow')).toHaveCount(3);
  await page.locator('.historyGrid .historyCard').click();
  await expect(page.locator('.tacticalDetail h2')).toHaveText("Uscita dal pressing con portiere e terzo uomo");
  await page.getByRole('button', { name: "Metodologia del club" }).click();
  await expect(page.locator('.methodologyMap > div')).toHaveCount(6);
  for (const path of ['/intro.mp4', '/logo-proanalyst.png', '/ProAnalystLabs_Whitepaper.pdf']) {
    expect((await page.request.get(path)).ok()).toBeTruthy();
  }
  expect(apiRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test('mobile navigation, finishing pattern and staff form', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: "Accesso staff", exact: true }).click();
  await expect(page.getByRole('button', { name: "Accedi", exact: true })).toBeVisible();
  await expect(page.locator('input[type=password]')).toHaveCount(1);
  await enterDemo(page);
  await page.getByRole('combobox', { name: "Sezione" }).selectOption('library');
  await page.locator('.libraryToolbar select').selectOption('finishing');
  await page.locator('.libraryCard').first().getByRole('button', { name: "Apri analisi" }).click();
  await expect(page.locator('.resultCard .solutionBadge')).toHaveText("Schema di finalizzazione");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});

test('all 24 Italian analyses and existing English history keep their identifiers and videos', async ({ page }) => {
  const saved = { ...sourceCatalog.combos[8], created_at: '2026-11-01T10:00:00Z' };
  await page.addInitScript((item) => {
    localStorage.setItem('proanalyst_history_v11', JSON.stringify([item]));
    localStorage.setItem('proanalyst_favorites_v11', JSON.stringify([item.scenario_id]));
  }, saved);
  await enterDemo(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'it');
  await page.getByRole('button', { name: 'Le mie analisi' }).click();
  await expect(page.locator('.historyRow')).toContainText('Uscita dal pressing con portiere e terzo uomo');
  await expect(page.locator('.historyGrid .historyCard')).toHaveCount(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('proanalyst_history_v11'))[0].title)).toBe(saved.title);
  for (let index = 0; index < catalog.combos.length; index++) {
    await page.getByRole('button', { name: 'Libreria video' }).click();
    await page.locator('.libraryCard').nth(index).getByRole('button', { name: 'Apri analisi' }).click();
    const item = catalog.combos[index];
    await expect(page.locator('.tacticalDetail h2')).toHaveText(item.title);
    await expect(page.locator('.analysisVideo')).toHaveAttribute('src', new RegExp(`${item.video.replace('.', '\\.')}$`));
    const detail = await page.locator('.tacticalDetail').innerText();
    for (const text of [...item.principles, ...item.key_actions, ...item.risk_notes, ...item.coaching_points]) expect(detail).toContain(text);
    expect(detail).not.toMatch(/Coaching|Risk|Third.man|Free.player|Controlled|Finishing|Build Up/);
  }
});

test('staff interface and dynamic errors stay Italian', async ({ page }) => {
  // Browser fixture only; production keeps real authentication and persistence.
  await page.route('**/api/login', (route) => route.fulfill({ status: 401, json: { error: 'Invalid credentials' } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Accesso staff', exact: true }).click();
  await page.getByLabel('Nome utente').fill('test');
  await page.getByLabel('Password').fill('wrong-test-only');
  await page.getByRole('button', { name: 'Accedi', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Nome utente o password non corretti.');
  await page.route('**/api/login', (route) => route.fulfill({ json: { staff: true } }));
  await page.route('**/api/insights', (route) => route.fulfill({ json: { feedback_count: 1, positive_feedback: 1, scenario_requests: 2, top_requested_scenarios: [['build_up|4-3-3|4-4-2', 2]] } }));
  await page.getByRole('button', { name: 'Accedi', exact: true }).click();
  await page.getByRole('button', { name: 'Salta introduzione' }).click();
  await page.getByRole('button', { name: 'Statistiche staff' }).click();
  await expect(page.locator('.mainWorkspace')).toContainText('Costruzione dal basso · 4-3-3 · 4-4-2');
  await expect(page.locator('.mainWorkspace')).not.toContainText('build_up');
});
