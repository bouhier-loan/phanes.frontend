import { describe, expect, it } from 'vitest';
import { VirtualFileSource } from '../src/virtual-file-source';

describe('VirtualFileSource', () => {
  it('reads placed blocks and zeros elsewhere, and records reads', async () => {
    const file = new VirtualFileSource('big.rpa', 10 * 2 ** 30).place(
      5 * 2 ** 30,
      Uint8Array.of(1, 2, 3),
    );
    expect(await file.read(5 * 2 ** 30 - 1, 5 * 2 ** 30 + 4)).toEqual(Uint8Array.of(0, 1, 2, 3, 0));
    expect(file.bytesRead).toBe(5);
  });

  it('refuses huge reads', async () => {
    const file = new VirtualFileSource('big.rpa', 10 * 2 ** 30);
    await expect(file.read(0, 2 ** 30)).rejects.toThrow(/refusing/);
  });
});
