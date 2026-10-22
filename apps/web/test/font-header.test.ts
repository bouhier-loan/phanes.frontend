import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { looksLikeFont } from '../src/adapters/font-header';

const ROOT = join(import.meta.dirname, '..', '..', '..');

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

describe('font headers', () => {
  it('accepts a real WOFF2 font', () => {
    const font = readFileSync(
      join(
        ROOT,
        'apps/web/node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2',
      ),
    );
    expect(looksLikeFont(new Uint8Array(font), font.length)).toBe(true);
    expect(looksLikeFont(new Uint8Array(font), font.length - 1)).toBe(false);
  });

  it('rejects the fixture stub and other non-fonts', () => {
    const stub = readFileSync(join(ROOT, 'fixtures/games/phanes_demo/game/fonts/demo.ttf'));
    expect(looksLikeFont(new Uint8Array(stub), stub.length)).toBe(false);
    expect(looksLikeFont(new TextEncoder().encode('not a font at all'), 17)).toBe(false);
    expect(looksLikeFont(bytes(0, 1, 0, 0), 4)).toBe(false);
  });

  it('checks the table count of an sfnt font', () => {
    // version 1.0, 2 tables: the table directory needs 12 + 2 × 16 bytes.
    const header = bytes(0, 1, 0, 0, 0, 2, 0, 32, 0, 1, 0, 0);
    expect(looksLikeFont(header, 44)).toBe(true);
    expect(looksLikeFont(header, 43)).toBe(false);
    expect(looksLikeFont(bytes(0x4f, 0x54, 0x54, 0x4f, 0, 0, 0, 0, 0, 0, 0, 0), 100)).toBe(false);
  });
});
