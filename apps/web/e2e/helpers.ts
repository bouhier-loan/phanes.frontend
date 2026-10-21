import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';

export const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const FIXTURES = join(REPO, 'fixtures');

export interface Watch {
  /** Requests made since the app finished loading. */
  readonly requests: string[];
  /** Console errors, page errors and CSP violations. */
  readonly errors: string[];
}

/** Opens the app, waits until it is fully loaded, then records every request. */
export async function openApp(page: Page): Promise<Watch> {
  const watch: Watch = { requests: [], errors: [] };
  let loaded = false;
  page.on('request', (request) => {
    if (loaded) watch.requests.push(request.url());
  });
  page.on('console', (message) => {
    if (message.type() === 'error') watch.errors.push(message.text());
  });
  page.on('pageerror', (error) => {
    watch.errors.push(error.message);
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  await page.goto('/');
  await expect(page.getByTestId('dropzone')).toBeVisible();
  await page.waitForLoadState('networkidle');
  loaded = true;
  return watch;
}

/** Requests that reach the network (blob: and data: URLs stay in the page). */
export function networkRequests(watch: Watch): string[] {
  return watch.requests.filter((url) => !url.startsWith('blob:') && !url.startsWith('data:'));
}

export function payload(path: string, name = path.split('/').pop() ?? path) {
  return { name, mimeType: 'application/octet-stream', buffer: readFileSync(path) };
}

/**
 * Waits for the report. On failure, reports what the page shows instead
 * (progress, message, error), to tell harness limits from app bugs.
 */
export async function waitForReport(page: Page, timeout = 15_000): Promise<void> {
  try {
    await expect(page.getByTestId('report')).toBeVisible({ timeout });
  } catch (error) {
    const state = await page
      .locator('main')
      .innerText()
      .catch(() => '(page unavailable)');
    throw new Error(`report not shown after ${timeout} ms; page shows: ${state.slice(0, 500)}`, {
      cause: error,
    });
  }
}
