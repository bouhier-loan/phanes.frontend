import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { networkRequests, openApp, openSection, REPO, waitForReport } from './helpers';

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
  const handedOver = Date.now();
  await waitForReport(page, 60_000);
  const analyzed = Date.now();
  // Time spent by Playwright handing the file over vs. by the app analyzing it.
  console.log(`setInputFiles: ${handedOver - started} ms, analysis: ${analyzed - handedOver} ms`);
  expect(analyzed - handedOver).toBeLessThan(30_000);
  await openSection(page, 'Inventaire');
  await expect(page.getByTestId('inventory')).toContainText('20 000 entrées');
  await expect(page.getByTestId('inventory')).toContainText('6 Go');
  expect(networkRequests(watch)).toEqual([]);
  expect(watch.errors).toEqual([]);
});
