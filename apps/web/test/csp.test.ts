import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CSP_HEADER, CSP_META } from '../csp';

const headers = readFileSync(
  join(import.meta.dirname, '..', '..', '..', 'deploy', 'security-headers.conf'),
  'utf8',
);

describe('Content Security Policy', () => {
  it('is the same in nginx and in the app', () => {
    const match = /add_header Content-Security-Policy "([^"]+)" always;/.exec(headers);
    expect(match?.[1]).toBe(CSP_HEADER);
  });

  it('forbids every network connection', () => {
    expect(CSP_HEADER).toContain("connect-src 'none'");
    expect(CSP_HEADER).toContain("default-src 'none'");
    expect(CSP_HEADER).not.toMatch(/unsafe-(inline|eval)/);
  });

  it('keeps frame-ancestors out of the <meta> tag, where it is ignored', () => {
    expect(CSP_META).not.toContain('frame-ancestors');
    expect(CSP_HEADER).toContain("frame-ancestors 'none'");
  });
});
