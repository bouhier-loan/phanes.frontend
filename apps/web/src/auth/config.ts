/**
 * OpenID Connect settings (Pocket ID at auth.lonedev.fr). A public client:
 * authorization code with PKCE, no secret in the bundle. Shared with csp.ts,
 * whose connect-src allows the issuer and nothing else. Pure constants: also
 * imported by the Node side (CSP, E2E tests).
 */
export const OIDC_ISSUER = 'https://auth.lonedev.fr';
export const OIDC_CLIENT_ID = '27c855f7-406c-4a57-9117-8370bd85e9dd';
export const OIDC_SCOPES = 'openid profile email';
/** Path of the redirect URI, registered in Pocket ID for every origin. */
export const OIDC_CALLBACK_PATH = '/auth/callback';
