import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeFileSource } from './node-file-source';

/** Absolute path of the repository's fixtures directory. */
export const FIXTURES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'fixtures',
);

export function fixturePath(...parts: string[]): string {
  return join(FIXTURES_DIR, ...parts);
}

export function openFixture(...parts: string[]): Promise<NodeFileSource> {
  return NodeFileSource.open(fixturePath(...parts), parts.join('/'));
}

export async function readFixture(...parts: string[]): Promise<Uint8Array> {
  return new Uint8Array(await readFile(fixturePath(...parts)));
}

export async function readFixtureJson<T>(...parts: string[]): Promise<T> {
  return JSON.parse(await readFile(fixturePath(...parts), 'utf8')) as T;
}

export function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}
