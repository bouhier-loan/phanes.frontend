import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { networkRequests, openApp, REPO } from './helpers';

let dir = '';

test.beforeAll(() => {
  // A 6 GiB sparse archive: almost no disk space, index past 4 GiB.
  dir = mkdtempSync(join(tmpdir(), 'phanes-huge-'));
  mkdirSync(join(dir, 'HugeGame', 'game'), { recursive: true });
  execFileSync(
    'pnpm',
    [
      'exec',
      'tsx',
      'tools/make-big-rpa.ts',
      join(dir, 'HugeGame', 'game', 'big.rpa'),
      '6',
      '20000',
    ],
    {
      cwd: REPO,
    },
  );
});

test.afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

test('lists a 6 GiB archive without loading it', async ({ page }) => {
  const watch = await openApp(page);
  const started = Date.now();
  await page.getByTestId('folder-input').setInputFiles(join(dir, 'HugeGame'));
  await expect(page.getByTestId('report')).toBeVisible({ timeout: 60_000 });
  expect(Date.now() - started).toBeLessThan(30_000);
  await page.getByRole('tab', { name: 'Inventaire' }).click();
  await expect(page.getByTestId('inventory')).toContainText('20 000 entrées');
  await expect(page.getByTestId('inventory')).toContainText('6 Go');
  expect(networkRequests(watch)).toEqual([]);
  expect(watch.errors).toEqual([]);
});
