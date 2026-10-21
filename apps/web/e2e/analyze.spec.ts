import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { FIXTURES, networkRequests, openApp, payload, waitForReport } from './helpers';

const DIST = join(FIXTURES, 'build', '8.5.3', 'phanes_demo', 'dist');

test('analyzes a game folder without any network request', async ({ page }) => {
  const watch = await openApp(page);
  await page.getByTestId('folder-input').setInputFiles(DIST);

  await expect(page.getByTestId('report')).toBeVisible();
  await expect(page.getByTestId('game-title')).toContainText('Phanes Demo');
  await expect(page.getByText('8.5.3.26051504')).toBeVisible();
  await expect(page.locator('.stat', { hasText: 'Répliques' })).toContainText('17');
  await expect(page.locator('.stat', { hasText: 'Mots' })).toContainText('71');

  await page.getByRole('tab', { name: 'Personnages' }).click();
  await expect(page.getByTestId('characters')).toContainText('Eileen');
  await expect(page.getByTestId('characters')).toContainText('Narrateur');

  await page.getByRole('tab', { name: 'Labels' }).click();
  await expect(page.getByTestId('labels')).toContainText('park.bench');

  await page.getByRole('tab', { name: 'Inventaire' }).click();
  await expect(page.getByTestId('inventory')).toContainText('scripts.rpa');
  await page.getByPlaceholder('Filtrer par nom ou chemin').fill('lucy');
  await expect(page.getByTestId('inventory')).toContainText('dist/game/images/lucy smile.png');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter le rapport (JSON)' }).click();
  const file = await (await download).path();
  const report = JSON.parse(await readFile(file, 'utf8')) as {
    schemaVersion: number;
    analyses: { overview: { dialogue: { lines: number } } };
  };
  expect(report.schemaVersion).toBe(1);
  expect(report.analyses.overview.dialogue.lines).toBe(17);

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
  await page.getByRole('tab', { name: /Diagnostics/ }).click();
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
  await expect(page.getByText('≤ 7')).toBeVisible();
  expect(networkRequests(watch)).toEqual([]);
  expect(watch.errors).toEqual([]);
});
