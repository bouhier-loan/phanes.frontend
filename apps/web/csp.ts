import { OIDC_ISSUER } from './src/auth/config.ts';

/**
 * Content Security Policy of the production build. The only connection
 * allowed is to the OIDC provider, used while signing in, before the app
 * renders: game files cannot leave the machine. Previews of game images and
 * media use blob: URLs over the local files. Shared by the <meta> tag
 * injected at build time, `vite preview` (E2E tests) and
 * deploy/security-headers.conf (checked by test/csp.test.ts).
 */
export const CSP_DIRECTIVES = [
  "default-src 'none'",
  "script-src 'self'",
  "worker-src 'self'",
  "style-src 'self'",
  // data: for the inline favicon, blob: for previews of game images.
  "img-src 'self' blob: data:",
  'media-src blob:',
  "font-src 'self'",
  `connect-src ${OIDC_ISSUER}`,
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "require-trusted-types-for 'script'",
  // Only the "default" policy of src/trusted-types.ts may exist.
  'trusted-types default',
] as const;

/** frame-ancestors only works as an HTTP header, not in a <meta> tag. */
export const CSP_HEADER = [...CSP_DIRECTIVES, "frame-ancestors 'none'"].join('; ');
export const CSP_META = CSP_DIRECTIVES.join('; ');
