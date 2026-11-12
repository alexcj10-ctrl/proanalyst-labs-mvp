import { test, expect } from '@playwright/test';

async function enterDemo(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter Demo' }).click();
  await expect(page.locator('.introScreen video')).toHaveAttribute('src', '/intro.mp4');
  await page.getByRole('button', { name: 'Skip intro' }).click();
}

test('complete deterministic workflow without API, preserving personal data', async ({ page }) => {
  const apiRequests = [];
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (/\/(demo-login|catalog|generate|status)(\/|\?|$)/.test(new URL(request.url()).pathname)) apiRequests.push(request.url());
  });
  await enterDemo(page);
  await page.getByRole('button', { name: 'Generate', exact: false }).click();
  await expect(page.locator('.tacticalDetail h2')).toHaveText('Goalkeeper + third-man press escape');
  await expect(page.locator('.analysisVideo')).toHaveAttribute('src', /public.blob.vercel-storage.com/);
  await page.getByRole('button', { name: 'Save analysis' }).click();
  await page.getByRole('button', { name: 'Useful ↑', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Service temporarily unavailable');

  await page.getByRole('button', { name: 'Video Library' }).click();
  await expect(page.locator('.libraryCard')).toHaveCount(24);
  await page.locator('.libraryToolbar select').selectOption('finishing');
  await expect(page.locator('.libraryCard')).toHaveCount(5);
  await page.locator('.libraryToolbar select').selectOption('all');
  await page.getByPlaceholder('Search formation, principle, objective…').fill('third-man press');
  await expect(page.locator('.libraryCard')).toHaveCount(1);
  await page.getByPlaceholder('Search formation, principle, objective…').fill('no such scenario');
  await expect(page.getByText('No matching scenarios')).toBeVisible();
  await page.getByPlaceholder('Search formation, principle, objective…').fill('');
  await page.locator('.libraryCard').first().getByRole('button', { name: 'Open analysis' }).click();
  await expect(page.locator('.resultCard .solutionBadge')).toHaveText('Solution A');
  await page.getByRole('button', { name: 'Compare solutions' }).click();
  await expect(page.locator('.comparisonCard')).toHaveCount(2);
  await page.getByRole('button', { name: 'Open Solution B' }).click();
  await expect(page.locator('.resultCard .solutionBadge')).toHaveText('Solution B');
  await expect(page.locator('.tacticalDetail h2')).toHaveText('Outside release');
  await page.locator('.selectorPanel').first().getByRole('button', { name: '5-4-1', exact: true }).click();
  await expect(page.getByText('Not catalogued yet', { exact: true })).toBeVisible();
  await expect(page.locator('.resultCard')).toHaveCount(0);
  await page.getByRole('button', { name: 'Scenario requests · unavailable' }).click();
  await expect(page.getByRole('status')).toContainText('Service temporarily unavailable');

  await page.reload();
  await page.getByRole('button', { name: 'Enter Demo' }).click();
  await expect(page.locator('.introScreen')).toHaveCount(0);
  await page.getByRole('button', { name: 'My Analyses' }).click();
  await expect(page.locator('.historyGrid .historyCard')).toHaveCount(1);
  await expect(page.locator('.historyRow')).toHaveCount(3);
  await page.locator('.historyGrid .historyCard').click();
  await expect(page.locator('.tacticalDetail h2')).toHaveText('Goalkeeper + third-man press escape');
  await page.getByRole('button', { name: 'Club Methodology' }).click();
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
  await page.getByRole('button', { name: 'Staff access', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.locator('input[type=password]')).toHaveCount(1);
  await enterDemo(page);
  await page.getByRole('combobox', { name: 'Section' }).selectOption('library');
  await page.locator('.libraryToolbar select').selectOption('finishing');
  await page.locator('.libraryCard').first().getByRole('button', { name: 'Open analysis' }).click();
  await expect(page.locator('.resultCard .solutionBadge')).toHaveText('Finishing Pattern');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});
