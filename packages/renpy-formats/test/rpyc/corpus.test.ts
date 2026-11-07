import { CORPUS, fixturePath, NodeFileSource, readGzipJson } from '@phanes/testkit';
import { describe, expect, it } from 'vitest';
import { readRpycPayload, toCanonicalJson } from '../../src';

/**
 * The scripts of the games shipped with the pinned SDKs (fixtures/corpus),
 * decoded by our unpickler, against CPython's (tools/oracle/dump_json.py).
 */
interface OracleDump {
  slot: number;
  protocol: number;
  payload: unknown;
}

for (const { sdk, game } of CORPUS) {
  describe(`${game} compiled by Ren'Py ${sdk} matches CPython's unpickler`, async () => {
    const expected = await readGzipJson<Record<string, OracleDump>>(
      'expected',
      'corpus',
      sdk,
      game,
      'canonical.json.gz',
    );
    const paths = Object.keys(expected).sort();

    it('has oracle dumps', () => {
      expect(paths.length).toBeGreaterThan(0);
    });

    it('for every script', async () => {
      for (const path of paths) {
        const dump = expected[path];
        const source = await NodeFileSource.open(fixturePath('corpus', sdk, game, path), path);
        const payload = await readRpycPayload(source);
        expect(payload.slot, path).toBe(dump?.slot);
        expect(payload.pickleProtocol, path).toBe(dump?.protocol);
        expect(payload.warnings, path).toEqual([]);
        // Round-trip through JSON text, like the oracle's output.
        const actual = JSON.parse(JSON.stringify(toCanonicalJson(payload.value))) as unknown;
        expect(actual, path).toEqual(dump?.payload);
      }
    });
  });
}
