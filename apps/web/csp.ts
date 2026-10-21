/**
 * Content Security Policy of the production build. No network access at all
 * (connect-src 'none'): game files cannot leave the machine. Shared by the
 * <meta> tag injected at build time, `vite preview` (E2E tests) and
 * deploy/security-headers.conf (checked by test/csp.test.ts).
 */
export const CSP_DIRECTIVES = [
  "default-src 'none'",
  "script-src 'self'",
  "worker-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  "connect-src 'none'",
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
