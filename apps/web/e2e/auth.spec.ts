import { expect, test } from '@playwright/test';
import { OIDC_CLIENT_ID, OIDC_ISSUER } from '../src/auth/config.ts';
import { openApp } from './helpers';
import { mockOidc } from './oidc';

test('signs in with the authorization code flow and PKCE', async ({ page, baseURL }) => {
  const watch = await openApp(page);
  const [authorize] = watch.oidc.authorizeUrls;
  expect(authorize?.origin).toBe(OIDC_ISSUER);
  const params = authorize?.searchParams;
  expect(params?.get('client_id')).toBe(OIDC_CLIENT_ID);
  expect(params?.get('response_type')).toBe('code');
  expect(params?.get('redirect_uri')).toBe(`${baseURL}/auth/callback`);
  expect(params?.get('scope')).toContain('openid');
  expect(params?.get('code_challenge_method')).toBe('S256');
  expect(params?.get('code_challenge')).toMatch(/^[\w-]{43}$/);
  expect(params?.get('state')).toBeTruthy();
  expect(params?.get('nonce')).toBeTruthy();

  const [token] = watch.oidc.tokenRequests;
  expect(token?.get('grant_type')).toBe('authorization_code');
  expect(token?.get('client_id')).toBe(OIDC_CLIENT_ID);
  expect(token?.get('code_verifier')).toMatch(/^[\w-]{43,128}$/);
  expect(token?.has('client_secret')).toBe(false);

  // Back on the home page, at the root, with the user's session.
  expect(new URL(page.url()).pathname).toBe('/');
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible();
  expect(watch.errors).toEqual([]);
});

test('keeps the session for the tab and signs out at the provider', async ({ page }) => {
  const watch = await openApp(page);
  await page.reload();
  await expect(page.getByTestId('dropzone')).toBeVisible();
  expect(watch.oidc.authorizeUrls).toHaveLength(1);

  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect.poll(() => watch.oidc.logoutUrls.length).toBe(1);
  const logout = watch.oidc.logoutUrls[0]?.searchParams;
  expect(logout?.get('id_token_hint')).toBeTruthy();
  expect(logout?.get('client_id')).toBe(OIDC_CLIENT_ID);
  expect(logout?.get('post_logout_redirect_uri')).toMatch(/\/$/);
  // Signing out leads back to a new sign-in.
  await expect.poll(() => watch.oidc.authorizeUrls.length).toBe(2);
  await expect(page.getByTestId('dropzone')).toBeVisible();
});

test('refuses a callback that does not match a sign-in in progress', async ({ page }) => {
  await mockOidc(page);
  await page.goto('/auth/callback?code=forged&state=forged');
  await expect(page.getByRole('heading', { name: 'Connexion impossible' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('ne correspond pas');
});
