import { fixturePath, NodeFileSource, readFixture } from '@phanes/testkit';
import { zlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  BytesSource,
  FormatError,
  parseRpycContainer,
  PyDict,
  PyObject,
  readRpyc,
  readRpycPayload,
} from '../../src';

const script = (sdk: string) =>
  NodeFileSource.open(
    fixturePath('build', sdk, 'phanes_demo', 'project', 'game', 'script.rpyc'),
    'script.rpyc',
  );

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    return error instanceof FormatError ? error.code : String(error);
  }
  return undefined;
}

/** Builds an RPYC2 file from slot payloads (pickles), like Script.write_rpyc_data. */
function rpyc2(slots: Record<number, Uint8Array>, raw = false): Uint8Array {
  const header = new Uint8Array(10 + 12 * 3);
  header.set(new TextEncoder().encode('RENPY RPC2'));
  const view = new DataView(header.buffer);
  const parts: Uint8Array[] = [header];
  let offset = header.length;
  let i = 0;
  for (const [slot, payload] of Object.entries(slots)) {
    const data = raw ? payload : zlibSync(payload);
    view.setUint32(10 + i * 12, Number(slot), true);
    view.setUint32(14 + i * 12, offset, true);
    view.setUint32(18 + i * 12, data.length, true);
    parts.push(data);
    offset += data.length;
    i++;
  }
  const out = new Uint8Array(offset);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// (data, stmts) = ({'version': 1}, []) as a protocol 2 pickle.
const PAYLOAD = Uint8Array.from([
  0x80,
  2,
  0x7d,
  0x58,
  7,
  0,
  0,
  0,
  ...new TextEncoder().encode('version'),
  0x4b,
  1,
  0x73,
  0x5d,
  0x86,
  0x2e,
]);

describe('readRpyc on real scripts', () => {
  // Ren'Py 8.0-8.3 still pickle with protocol 2 (renpy/compat/pickle.py: PROTOCOL = 2).
  it.each([
    ['6.99.14.3', 2, true],
    ['7.4.11', 2, true],
    ['8.3.7', 2, false],
    ['8.5.3', 5, false],
  ])("decodes slot 1 of a Ren'Py %s script", async (sdk, protocol, python2) => {
    const result = await readRpyc(await script(sdk));
    expect(result.format).toBe('rpc2');
    expect(result.slot).toBe(1);
    expect(result.pickleProtocol).toBe(protocol);
    expect(result.python2).toBe(python2);
    expect((result.data as PyDict).get('version')).toBe(5003000);
    expect(result.stmts.length).toBeGreaterThan(5);
    expect(result.stmts.every((s) => s instanceof PyObject)).toBe(true);
  });

  it('can read slot 2 (after static transforms)', async () => {
    const result = await readRpyc(await script('8.5.3'), { slots: [2] });
    expect(result.slot).toBe(2);
    const classes = new Set(result.stmts.map((s) => (s as PyObject).className));
    expect(classes.has('renpy.ast.Label')).toBe(true);
  });

  it('parses the slot table', async () => {
    const bytes = await readFixture(
      'build',
      '8.5.3',
      'phanes_demo',
      'project',
      'game',
      'script.rpyc',
    );
    const container = parseRpycContainer(bytes);
    expect(container.format).toBe('rpc2');
    expect(container.slots.map((s) => s.slot)).toEqual([1, 2]);
    expect(container.warnings).toEqual([]);
  });
});

describe('readRpyc on synthetic and damaged files', () => {
  it('reads legacy files (a bare zlib stream)', async () => {
    const result = await readRpyc(new BytesSource('old.rpyc', zlibSync(PAYLOAD)));
    expect(result.format).toBe('legacy');
    expect(result.slot).toBe(1);
    expect(result.stmts).toEqual([]);
  });

  it('falls back to slot 2 when slot 1 is damaged', async () => {
    const file = rpyc2({ 1: Uint8Array.of(1, 2, 3, 4), 2: zlibSync(PAYLOAD) }, true);
    const result = await readRpycPayload(new BytesSource('x.rpyc', file));
    expect(result.slot).toBe(2);
    expect(result.warnings).toEqual([expect.stringContaining('slot 1')]);
  });

  it('rejects obfuscated headers', async () => {
    const bytes = await readFixture(
      'build',
      '8.5.3',
      'phanes_demo',
      'project',
      'game',
      'script.rpyc',
    );
    const tampered = bytes.slice();
    tampered.set(new TextEncoder().encode('RENPY RPC3'));
    const error = await readRpyc(new BytesSource('x.rpyc', tampered)).catch((e: unknown) => e);
    expect((error as FormatError).code).toBe('RPYC_BAD_HEADER');
    expect((error as FormatError).details.header).toBe('RENPY RPC3......');
  });

  it('reports missing slots and bad payloads', async () => {
    expect(await codeOf(readRpyc(new BytesSource('x.rpyc', rpyc2({}))))).toBe('RPYC_NO_SLOT');
    expect(await codeOf(readRpyc(new BytesSource('x.rpyc', rpyc2({ 3: PAYLOAD }))))).toBe(
      'RPYC_NO_SLOT',
    );
    const notPair = Uint8Array.of(0x80, 2, 0x4e, 0x2e);
    expect(await codeOf(readRpyc(new BytesSource('x.rpyc', rpyc2({ 1: notPair }))))).toBe(
      'RPYC_BAD_PAYLOAD',
    );
  });

  it('ignores slot ranges outside the file', () => {
    const file = rpyc2({ 1: PAYLOAD });
    new DataView(file.buffer).setUint32(18, 1_000_000, true);
    const container = parseRpycContainer(file);
    expect(container.slots).toEqual([]);
    expect(container.warnings[0]).toMatch(/outside the file/);
  });
});
