import { fromHex, readFixtureJson } from '@phanes/testkit';
import { describe, expect, it } from 'vitest';
import { unpickle } from '../../src';
import { canon, withoutEmptyAttrs, type Canon } from '../helpers/canon';

interface PickleCase {
  name: string;
  protocol: number;
  python: string;
  hex: string;
  expected: Canon;
}

const suites = [
  ['Python 2.7 (Ren’Py 7 SDK)', 'py2.json'],
  ['Python 3', 'py3.json'],
] as const;

for (const [title, file] of suites) {
  const cases = await readFixtureJson<PickleCase[]>('synthetic', 'pickle', file);

  describe(`pickles written by ${title}`, () => {
    it('has cases for every protocol', () => {
      const protocols = new Set(cases.map((c) => c.protocol));
      expect(protocols.size).toBeGreaterThanOrEqual(3);
    });

    for (const c of cases) {
      it(`${c.name} (protocol ${c.protocol})`, () => {
        const result = unpickle(fromHex(c.hex), { py2Strings: 'bytes' });
        expect(result.protocol).toBe(c.protocol < 2 ? 0 : c.protocol);
        expect(withoutEmptyAttrs(canon(result.value))).toEqual(withoutEmptyAttrs(c.expected));
      });
    }
  });
}
