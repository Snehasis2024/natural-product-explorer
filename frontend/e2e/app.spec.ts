import { expect, test, type Page } from '@playwright/test';

const CURCUMIN = 'COc1cc(/C=C/C(=O)CC(=O)/C=C/c2ccc(O)c(OC)c2)ccc1O';
const SHOTS = process.env.E2E_SHOTS;

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  // Resource failures are reported with their URL below; third-party fonts may be blocked in CI sandboxes.
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(`console: ${m.text()}`); });
  page.on('requestfailed', (r) => { if (!/fonts\.(googleapis|gstatic)\.com/.test(r.url())) errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`); });
  page.on('response', (r) => { if (r.status() >= 400 && new URL(r.url()).origin === new URL(page.url() || r.url()).origin && !r.url().endsWith('/api/health')) errors.push(`http ${r.status()}: ${r.url()}`); });
  return errors;
}

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
}

async function noHorizontalScroll(page: Page) {
  const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(sw).toBeLessThanOrEqual(iw + 1);
}

test('home: hero search, 3D hero and engine status', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Explore the Chemical Diversity of Nature' })).toBeVisible();
  await expect(page.locator('canvas').first()).toBeVisible();
  await expect(page.getByText(/(API|Browser) · 76/)).toBeVisible();
  await expect(page.getByText('Landmark natural products')).toBeVisible();
  await expect(page.locator('.structure-svg svg').first()).toBeVisible();
  await page.waitForTimeout(1500);
  await shot(page, 'home');
  expect(errors).toEqual([]);
});

test('search by name → compound explorer with tabs', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('./');
  await page.locator('#hero-search').fill('artemisinin');
  await page.locator('#hero-search').press('Enter');
  await expect(page).toHaveURL(/search\?q=artemisinin/);
  await page.getByRole('link', { name: 'Artemisinin', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Artemisinin' })).toBeVisible();
  await expect(page.getByText('C15H22O5').first()).toBeVisible();
  await expect(page.getByText('BLUAFEHZUWYNDE-NNWCWBAJSA-N')).toBeVisible();
  await expect(page.locator('canvas').first()).toBeVisible();
  await expect(page.getByText(/3D conformer: RDKit ETKDGv3/)).toBeVisible();
  for (const tab of ['Properties', 'Classification', 'Biological Source', 'AI Prediction', 'Literature']) {
    await page.getByRole('tab', { name: tab }).click();
  }
  await page.getByRole('tab', { name: 'Properties' }).click();
  await expect(page.getByText('Lipinski rule of five')).toBeVisible();
  await page.getByRole('tab', { name: 'Classification' }).click();
  await expect(page.getByRole('button', { name: /Cadinane sesquiterpenoids/ })).toBeVisible();
  await page.getByRole('button', { name: /Sesquiterpenoids/ }).first().click();
  await expect(page.getByText('Representative structures')).toBeVisible();
  await page.getByRole('tab', { name: 'Biological Source' }).click();
  await expect(page.getByText('Artemisia annua').first()).toBeVisible();
  await page.getByRole('tab', { name: 'Literature' }).click();
  await expect(page.getByText('doi:10.1038/nm.2471')).toBeVisible();
  await page.getByRole('tab', { name: 'AI Prediction' }).click();
  await expect(page.getByText('Demo prediction — connect NPC-BERT API')).toBeVisible();
  await shot(page, 'compound-artemisinin');
  expect(errors).toEqual([]);
});

test('viewer controls, atom selection and representations', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('./#/compound/caffeine');
  await expect(page.getByText(/3D conformer:/)).toBeVisible();
  for (const name of ['Reset view', 'Center molecule', 'Fit molecule']) await page.getByRole('button', { name }).click();
  for (const rep of ['Stick', 'Spacefill', 'Line', 'Ball & stick']) await page.getByRole('button', { name: rep, exact: true }).click();
  await page.getByLabel('Van der Waals surface').check();
  await page.getByLabel('Atom labels').check();
  await page.getByLabel('Hydrogens').uncheck();
  await page.getByRole('button', { name: 'Charge', exact: true }).click();
  await expect(page.getByText('Gasteiger–Marsili partial charges (RDKit, calculated)')).toBeVisible();
  await page.getByLabel('Van der Waals surface').uncheck();
  await page.getByLabel('Atom labels').uncheck();
  await page.getByRole('button', { name: 'Ball & stick', exact: true }).click();
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download structure as SDF' }).click();
  expect((await dl).suggestedFilename()).toBe('caffeine.sdf');
  // click across the canvas until an atom is hit
  const box = (await page.locator('canvas').first().boundingBox())!;
  let found = false;
  for (let dx = -0.2; dx <= 0.2 && !found; dx += 0.05) {
    for (let dy = -0.2; dy <= 0.2 && !found; dy += 0.05) {
      await page.mouse.click(box.x + box.width * (0.5 + dx), box.y + box.height * (0.5 + dy));
      found = await page.getByText('Formal charge', { exact: true }).isVisible().catch(() => false);
    }
  }
  expect(found).toBe(true);
  await expect(page.getByText('x, y, z (Å)')).toBeVisible();
  await shot(page, 'atom-selected');
  expect(errors).toEqual([]);
});

test('paste SMILES → full pipeline', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('./');
  await page.locator('#hero-search').fill(CURCUMIN);
  await page.getByRole('button', { name: /Analyse/ }).click();
  await expect(page).toHaveURL(/analyze\?smiles=/);
  await expect(page.getByText('Exact match in the database')).toBeVisible();
  await expect(page.getByText('C21H20O6').first()).toBeVisible();
  await expect(page.getByText('368.38').first()).toBeVisible();
  await page.getByRole('tab', { name: 'AI Prediction' }).click();
  await expect(page.getByText('Pathway prediction')).toBeVisible();
  await expect(page.getByText('Explain prediction')).toBeVisible();
  await shot(page, 'analyze-curcumin');
  expect(errors).toEqual([]);
});

test('novel SMILES not in database gets computed 3D + prediction', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(`./#/analyze?smiles=${encodeURIComponent('Cn1c(=O)c2[nH]cnc2n(C)c1=O')}`);
  await expect(page.getByRole('heading', { name: 'Structure analysis' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('C7H8N4O2').first()).toBeVisible();
  await expect(page.getByText(/3D conformer: (RDKit ETKDGv3|OpenChemLib)/)).toBeVisible();
  await page.getByRole('tab', { name: 'Classification' }).click();
  await expect(page.getByText('No curated classification')).toBeVisible();
  await page.getByRole('tab', { name: 'AI Prediction' }).click();
  await expect(page.getByText('Purine alkaloids').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('invalid SMILES shows a clear error', async ({ page }) => {
  await page.goto(`./#/analyze?smiles=${encodeURIComponent('C1CC(c1ccccc1')}`);
  await expect(page.getByText('Invalid SMILES')).toBeVisible();
  await page.goto(`./#/analyze?smiles=${encodeURIComponent('c1cccc1')}`);
  await expect(page.getByText('Invalid SMILES')).toBeVisible();
});

test('database: filters, sorting, pagination, empty state', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('./#/search?pathway=Terpenoids&sort=molecular_weight&order=desc');
  await expect(page.getByText(/19 results/)).toBeVisible();
  await expect(page.getByRole('row').nth(1)).toContainText('Paclitaxel');
  await page.goto('./#/search?pathway=Alkaloids&mw_max=200');
  await expect(page.getByText(/[0-9]+ results?/)).toBeVisible();
  const rows = await page.getByRole('row').count();
  expect(rows).toBeGreaterThan(1);
  await page.goto('./#/search?page_size=25&page=2');
  await expect(page.getByText(/Page 2 of 4/)).toBeVisible();
  await page.goto('./#/search?q=zzzzqqq');
  await expect(page.getByText('No compounds match')).toBeVisible();
  await page.goto('./#/search?q=36314');
  await expect(page.getByText('PubChem CID')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Paclitaxel (Taxol)' }).first()).toBeVisible();
  await shot(page, 'search');
  expect(errors).toEqual([]);
});

test('structure search: similarity threshold, substructure, exact', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('./#/search?mode=similarity');
  await page.getByRole('button', { name: 'Apigenin' }).click();
  await expect(page.getByText(/hits? ·/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Apigenin' }).first()).toBeVisible();
  await page.goto('./#/search?mode=substructure');
  await page.getByRole('button', { name: 'β-Lactam' }).click();
  await expect(page.getByText('1 hit')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Penicillin G (Benzylpenicillin)' }).first()).toBeVisible();
  await page.goto('./#/search?mode=exact');
  await page.getByRole('button', { name: 'Caffeine (Kekulé)' }).click();
  await expect(page.getByRole('link', { name: 'Caffeine' }).first()).toBeVisible();
  await shot(page, 'similarity');
  expect(errors).toEqual([]);
});

test('compare with synchronised viewers', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('./#/compare?ids=quercetin,kaempferol,genistein');
  await expect(page.locator('canvas')).toHaveCount(3);
  await expect(page.getByText('Pairwise Tanimoto similarity')).toBeVisible();
  await expect(page.getByRole('cell', { name: '0.78' }).first()).toBeVisible();
  await page.getByRole('button', { name: /Sync rotation/ }).click();
  await shot(page, 'compare');
  expect(errors).toEqual([]);
});

test('landscape analytics and classification browser', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('./#/explore');
  await expect(page.getByText('Pathway distribution')).toBeVisible();
  await expect(page.locator('.recharts-surface').first()).toBeVisible();
  await page.getByRole('button', { name: 't-SNE' }).click();
  await page.getByLabel('Colour by').selectOption('superclass');
  await shot(page, 'landscape');
  await page.getByRole('tab', { name: 'Classification hierarchy' }).click();
  await page.getByRole('treeitem').first().getByRole('button').first().click();
  await expect(page.getByText('Representative structures')).toBeVisible();
  expect(errors).toEqual([]);
});

test('AI classification page', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('./#/predict');
  await expect(page.getByText('No structure yet')).toBeVisible();
  await page.getByRole('button', { name: 'Emodin' }).click();
  await expect(page.getByText('Demo prediction — connect NPC-BERT API')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Top-\d alternatives/ })).toBeVisible();
  await shot(page, 'predict');
  expect(errors).toEqual([]);
});

test('databases and about pages', async ({ page }) => {
  await page.goto('./#/databases');
  await expect(page.getByRole('heading', { name: 'COCONUT' })).toBeVisible();
  await page.goto('./#/about');
  await expect(page.getByText('What each label means')).toBeVisible();
});

test('mobile layout stacks panels without horizontal scroll @mobile', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Explore the Chemical Diversity of Nature' })).toBeVisible();
  await noHorizontalScroll(page);
  await page.goto('./#/compound/paclitaxel');
  await expect(page.getByRole('heading', { name: 'Paclitaxel (Taxol)' })).toBeVisible();
  await expect(page.locator('canvas').first()).toBeVisible();
  await noHorizontalScroll(page);
  await shot(page, 'mobile-compound');
  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(page.getByRole('navigation', { name: 'Mobile' })).toBeVisible();
  await page.goto('./#/search');
  await noHorizontalScroll(page);
});
