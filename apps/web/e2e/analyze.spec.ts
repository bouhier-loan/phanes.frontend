import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { FIXTURES, networkRequests, openApp, openSection, payload, waitForReport } from './helpers';

const DIST = join(FIXTURES, 'build', '8.5.3', 'phanes_demo', 'dist');

test('analyzes a game folder without any network request', async ({ page }) => {
  const watch = await openApp(page);
  await page.getByTestId('folder-input').setInputFiles(DIST);

  await expect(page.getByTestId('report')).toBeVisible();
  await expect(page.getByTestId('game-title')).toContainText('Phanes Demo');
  const main = page.locator('main');
  await expect(main.getByText('8.5.3.26051504')).toBeVisible();
  await expect(page.locator('.stat', { hasText: 'Répliques' })).toContainText('17');
  await expect(page.locator('.stat', { hasText: 'Mots' })).toContainText('71');
  await expect(page.locator('.stat', { hasText: 'Fins' })).toContainText('3');

  await openSection(page, 'Personnages');
  await expect(page.getByTestId('characters')).toContainText('Eileen');
  await expect(page.getByTestId('characters')).toContainText('Narrateur');

  await openSection(page, 'Labels');
  await expect(page.getByTestId('labels')).toContainText('park.bench');
  await expect(page.getByTestId('labels')).toContainText('Inaccessible');

  await openSection(page, 'Inventaire');
  await expect(page.getByTestId('inventory')).toContainText('scripts.rpa');
  await page.getByPlaceholder('Filtrer par nom ou chemin').fill('lucy');
  await expect(page.getByTestId('inventory')).toContainText('dist/game/images/lucy smile.png');

  await openSection(page, 'Graphe');
  const graph = page.getByTestId('graph');
  await expect(graph.getByRole('button', { name: /^start/ })).toBeVisible();
  await expect(main).toContainText('missing_label');

  await openSection(page, 'Choix');
  await expect(page.getByTestId('menus')).toContainText('To the library');
  await expect(page.getByTestId('menus')).toContainText('affection > 0');

  await openSection(page, 'Variables');
  await expect(page.getByTestId('variables')).toContainText('affection');

  await openSection(page, 'Lecteur de script');
  await expect(page.getByTestId('reader')).toContainText('Good morning! Did you sleep well?');
  await page.getByRole('link', { name: 'park ›' }).click();
  await expect(page.getByTestId('reader')).toContainText('Oh, hello there!');

  await openSection(page, 'Ressources');
  const gallery = page.getByTestId('gallery');
  await expect(gallery).toContainText('bg park');
  // The preview is decoded from images.rpa through a blob: URL.
  const preview = page.locator('.viewer-stage img');
  await expect(preview).toBeVisible();
  await expect.poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);

  await openSection(page, 'Traductions');
  await expect(page.getByTestId('translations')).toContainText('french');
  await expect(page.getByTestId('translations')).toContainText('5 / 17');

  await page.getByRole('link', { name: 'Exporter en JSON' }).first().click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Télécharger le JSON' }).click();
  const file = await (await download).path();
  const report = JSON.parse(await readFile(file, 'utf8')) as {
    schemaVersion: number;
    analyses: Record<string, unknown> & { overview: { dialogue: { lines: number } } };
  };
  expect(report.schemaVersion).toBe(1);
  expect(report.analyses.overview.dialogue.lines).toBe(17);
  expect(Object.keys(report.analyses)).toEqual(
    expect.arrayContaining(['storyGraph', 'menus', 'variables', 'assets', 'translations']),
  );

  expect(networkRequests(watch)).toEqual([]);
  expect(watch.errors).toEqual([]);
});

test('shows the rest of the report when files are corrupted', async ({ page }) => {
  const watch = await openApp(page);
  await page.getByTestId('files-input').setInputFiles([
    payload(join(DIST, 'game', 'scripts.rpa')),
    {
      name: 'broken.rpa',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('RPA-4.0 0000 garbage'),
    },
    {
      name: 'broken.rpyc',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('not a script'),
    },
  ]);

  await expect(page.getByTestId('report')).toBeVisible();
  await expect(page.locator('.stat', { hasText: 'Répliques' })).toContainText('17');
  await openSection(page, 'Diagnostics');
  const diagnostics = page.getByTestId('diagnostics');
  await expect(diagnostics).toContainText('Archive dans un format non pris en charge');
  await expect(diagnostics).toContainText('RPA-4.0');
  await expect(diagnostics).toContainText('Script compilé illisible');
  expect(networkRequests(watch)).toEqual([]);
  expect(watch.errors).toEqual([]);
});

test('accepts dropped files', async ({ page }) => {
  const watch = await openApp(page);
  const script = await readFile(
    join(FIXTURES, 'build', '7.4.11', 'phanes_demo', 'project', 'game', 'script.rpyc'),
  );
  const dataTransfer = await page.evaluateHandle(
    (bytes) => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(bytes)], 'script.rpyc'));
      return dt;
    },
    [...script],
  );
  await page.getByTestId('dropzone').dispatchEvent('drop', { dataTransfer });

  await waitForReport(page);
  await expect(page.locator('.stat', { hasText: 'Labels' })).toContainText('7');
  await expect(page.locator('main').getByText('≤ 7')).toBeVisible();
  expect(networkRequests(watch)).toEqual([]);
  expect(watch.errors).toEqual([]);
});
