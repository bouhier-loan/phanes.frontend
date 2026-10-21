import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CSP_HEADER, CSP_META } from '../csp';
import { OIDC_ISSUER } from '../src/auth/config';

const headers = readFileSync(
  join(import.meta.dirname, '..', '..', '..', 'deploy', 'security-headers.conf'),
  'utf8',
);

describe('Content Security Policy', () => {
  it('is the same in nginx and in the app', () => {
    const match = /add_header Content-Security-Policy "([^"]+)" always;/.exec(headers);
    expect(match?.[1]).toBe(CSP_HEADER);
  });

  it('allows no connection but the OIDC provider', () => {
    expect(CSP_HEADER).toContain(`connect-src ${OIDC_ISSUER};`);
    expect(CSP_HEADER).toContain("default-src 'none'");
    expect(CSP_HEADER).not.toMatch(/unsafe-(inline|eval)/);
    expect(CSP_HEADER).not.toMatch(/\*|https?:(?!\/\/auth\.lonedev\.fr)/);
  });

  it('lets previews read local files through blob: URLs only', () => {
    expect(CSP_HEADER).toContain("img-src 'self' blob: data:;");
    expect(CSP_HEADER).toContain('media-src blob:;');
  });

  it('keeps frame-ancestors out of the <meta> tag, where it is ignored', () => {
    expect(CSP_META).not.toContain('frame-ancestors');
    expect(CSP_HEADER).toContain("frame-ancestors 'none'");
  });
});
