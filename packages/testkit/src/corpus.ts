import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import type { FileSource } from '@phanes/renpy-formats';
import { fixturePath } from './fixtures';
import { walkDirectory } from './node-file-source';
import { VirtualFileSource } from './virtual-file-source';

/**
 * Games shipped with the pinned Ren'Py SDKs, kept by tools/fixtures/build.sh
 * under fixtures/corpus/<sdk>/<game>/: the compiled scripts as the SDK ships
 * them, the renpy/ version files, and files.json listing every other file.
 */
export const CORPUS = [
  { sdk: '6.99.14.3', game: 'the_question' },
  { sdk: '7.4.11', game: 'the_question' },
  { sdk: '8.3.7', game: 'the_question' },
  { sdk: '8.5.3', game: 'the_question' },
  { sdk: '8.5.3', game: 'tutorial' },
] as const;

export type CorpusGame = (typeof CORPUS)[number];

const MANIFEST = 'files.json';

/**
 * The files of a corpus game, as a folder drop of `<game>/`: real files for
 * what is committed, empty virtual files of the right size for the rest
 * (images, sounds, sources), which no analysis reads.
 */
export async function openCorpus(sdk: string, game: string): Promise<FileSource[]> {
  const root = fixturePath('corpus', sdk, game);
  const real = (await walkDirectory(root)).filter((f) => f.path !== `${game}/${MANIFEST}`);
  const manifest = JSON.parse(
    await readFile(fixturePath('corpus', sdk, game, MANIFEST), 'utf8'),
  ) as [string, number][];
  const virtual = manifest.map(([path, size]) => new VirtualFileSource(`${game}/${path}`, size));
  return [...real, ...virtual].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** A gzipped JSON fixture, such as the corpus oracle bundles. */
export async function readGzipJson<T>(...parts: string[]): Promise<T> {
  return JSON.parse(gunzipSync(await readFile(fixturePath(...parts))).toString('utf8')) as T;
}
