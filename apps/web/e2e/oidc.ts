import { createSign, generateKeyPairSync, randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { OIDC_CLIENT_ID, OIDC_ISSUER } from '../src/auth/config.ts';

/** What the fake provider saw, for assertions. */
export interface OidcMock {
  readonly authorizeUrls: URL[];
  readonly tokenRequests: URLSearchParams[];
  readonly logoutUrls: URL[];
}

export interface TestUser {
  readonly sub: string;
  readonly name: string;
  readonly email: string;
}

export const TEST_USER: TestUser = {
  sub: 'user-1',
  name: 'Ada Lovelace',
  email: 'ada@example.org',
};

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST',
};

/** A redirect as an HTML page: works the same in every browser engine. */
function redirect(location: string) {
  const url = location.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return {
    status: 200,
    contentType: 'text/html',
    body: `<!doctype html><meta http-equiv="refresh" content="0;url=${url}">`,
  };
}

function base64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function idToken(claims: Record<string, unknown>): string {
  const input = `${base64url({ alg: 'RS256', typ: 'JWT', kid: 'test' })}.${base64url(claims)}`;
  const signature = createSign('RSA-SHA256').update(input).sign(privateKey).toString('base64url');
  return `${input}.${signature}`;
}

/**
 * Stands in for Pocket ID at OIDC_ISSUER: discovery, authorize (redirects back
 * with a code), token (an RS256 ID token for `user`) and end-session. Nothing
 * reaches the real provider.
 */
export async function mockOidc(page: Page, user: TestUser = TEST_USER): Promise<OidcMock> {
  const mock: OidcMock = { authorizeUrls: [], tokenRequests: [], logoutUrls: [] };
  const nonces = new Map<string, string>();
  const discovery = {
    issuer: OIDC_ISSUER,
    authorization_endpoint: `${OIDC_ISSUER}/authorize`,
    token_endpoint: `${OIDC_ISSUER}/api/oidc/token`,
    end_session_endpoint: `${OIDC_ISSUER}/api/oidc/end-session`,
    jwks_uri: `${OIDC_ISSUER}/.well-known/jwks.json`,
    response_types_supported: ['code'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    authorization_response_iss_parameter_supported: true,
  };
  await page.route(`${OIDC_ISSUER}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (url.pathname === '/.well-known/openid-configuration')
      return route.fulfill({ json: discovery, headers: CORS });
    if (url.pathname === '/authorize') {
      mock.authorizeUrls.push(url);
      const code = randomUUID();
      nonces.set(code, url.searchParams.get('nonce') ?? '');
      const back = new URL(url.searchParams.get('redirect_uri') ?? '/');
      back.searchParams.set('code', code);
      back.searchParams.set('state', url.searchParams.get('state') ?? '');
      back.searchParams.set('iss', OIDC_ISSUER);
      return route.fulfill(redirect(back.href));
    }
    if (url.pathname === '/api/oidc/token') {
      const body = new URLSearchParams(request.postData() ?? '');
      mock.tokenRequests.push(body);
      const now = Math.floor(Date.now() / 1000);
      const token = idToken({
        iss: OIDC_ISSUER,
        aud: OIDC_CLIENT_ID,
        sub: user.sub,
        name: user.name,
        email: user.email,
        iat: now,
        exp: now + 3600,
        nonce: nonces.get(body.get('code') ?? ''),
      });
      return route.fulfill({
        json: { access_token: 'test', token_type: 'Bearer', expires_in: 3600, id_token: token },
        headers: CORS,
      });
    }
    if (url.pathname === '/api/oidc/end-session') {
      mock.logoutUrls.push(url);
      const back = url.searchParams.get('post_logout_redirect_uri') ?? '/';
      return route.fulfill(redirect(back));
    }
    return route.fulfill({ status: 404, headers: CORS });
  });
  return mock;
}
