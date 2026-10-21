import {
  type FileSource,
  openRpaEntry,
  readRpaIndex,
  readRpycPayload,
  toCanonicalJson,
} from '@phanes/renpy-formats';
import { NodeFileSource } from '@phanes/testkit';

/** Opens `file.rpyc`, or `archive.rpa:entry/name.rpyc`. */
async function openTarget(target: string): Promise<FileSource> {
  const match = /^(.*\.rpa):(.+)$/i.exec(target);
  if (!match?.[1] || !match[2]) return NodeFileSource.open(target);
  const [, archivePath, entryName] = match;
  const archive = await NodeFileSource.open(archivePath);
  const index = await readRpaIndex(archive);
  const entry = index.entries.find((e) => e.name === entryName);
  if (!entry) {
    throw new Error(
      `${entryName} is not in ${archivePath} (${index.entries.map((e) => e.name).join(', ')})`,
    );
  }
  return openRpaEntry(archive, entry, target);
}

/** Canonical JSON dump of a compiled script (see renpy-formats/src/dump/canonical.ts). */
export async function dumpCommand(target: string): Promise<string> {
  const payload = await readRpycPayload(await openTarget(target));
  return JSON.stringify(
    {
      format: payload.format,
      slot: payload.slot,
      pickleProtocol: payload.pickleProtocol,
      python2: payload.python2,
      warnings: payload.warnings,
      payload: toCanonicalJson(payload.value),
    },
    null,
    2,
  );
}
