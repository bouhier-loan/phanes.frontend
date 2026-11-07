import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { FIXTURES, networkRequests, openApp, openSection, waitForReport } from './helpers';

test('lists the attributes of a layered image', async ({ page }) => {
  const watch = await openApp(page);
  await page
    .getByTestId('folder-input')
    .setInputFiles(join(FIXTURES, 'build', '8.5.3', 'phanes_layers', 'dist'));
  await waitForReport(page);
  await openSection(page, 'Ressources');
  await page.getByPlaceholder('Filtrer par nom ou chemin').fill('eileen');
  await page
    .getByRole('button', { name: /eileen$/ })
    .first()
    .click();
  const attributes = page.getByTestId('layered-attributes');
  await expect(attributes).toContainText('casual · par défaut → eileen_casual');
  await expect(attributes).toContainText('sad · trouvé par auto');
  await expect(attributes).toContainText('eileen_outfit_hat (calque introuvable)');
  expect(networkRequests(watch)).toEqual([]);
  expect(watch.errors).toEqual([]);
});
