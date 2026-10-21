import { fixturePath, NodeFileSource, readFixture } from '@phanes/testkit';
import { describe, expect, it } from 'vitest';
import { openRpaEntry, readFully, readRpaIndex } from '../../src';

const SDKS = [
  ['6.99.14.3', 2],
  ['7.4.11', 2],
  ['8.3.7', 5],
  ['8.5.3', 5],
] as const;

for (const [sdk, protocol] of SDKS) {
  describe(`archives built by Ren'Py ${sdk}`, () => {
    const open = (name: string) =>
      NodeFileSource.open(fixturePath('build', sdk, 'phanes_demo', 'dist', 'game', name), name);

    it('reads scripts.rpa', async () => {
      const index = await readRpaIndex(await open('scripts.rpa'));
      expect(index.version).toBe('RPA-3.0');
      expect(index.key).toBe(0x42424242);
      expect(index.pickleProtocol).toBe(protocol);
      expect(index.python2).toBe(protocol === 2);
      expect(index.problems).toEqual([]);
      expect(index.entries.map((e) => e.name).sort()).toEqual([
        'characters.rpyc',
        'options.rpyc',
        'script.rpyc',
        'story/extra.rpyc',
        'tl/french/characters.rpyc',
        'tl/french/script.rpyc',
      ]);
    });

    it('extracts images.rpa entries byte for byte', async () => {
      const archive = await open('images.rpa');
      const index = await readRpaIndex(archive);
      for (const entry of index.entries) {
        const original = await readFixture(
          'games',
          'phanes_demo',
          'game',
          ...entry.name.split('/'),
        );
        expect(await readFully(openRpaEntry(archive, entry, entry.name), 1 << 20)).toEqual(
          original,
        );
      }
    });
  });
}
