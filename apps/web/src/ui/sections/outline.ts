import type { ScriptOutline } from '@phanes/core';

export interface OutlineFolder {
  /** Folder relative to game/, '' for game/ itself. */
  readonly dir: string;
  readonly files: ScriptOutline;
}

/** Script files by folder: files of game/ itself first, then each folder, in outline order. */
export function outlineFolders(outline: ScriptOutline): OutlineFolder[] {
  const folders = new Map<string, ScriptOutline>();
  for (const file of outline) {
    const path = file.file.replace(/^game\//, '');
    const dir = path.slice(0, Math.max(0, path.lastIndexOf('/')));
    const files = folders.get(dir) ?? [];
    files.push(file);
    folders.set(dir, files);
  }
  return [...folders.entries()]
    .map(([dir, files]) => ({ dir, files }))
    .sort((a, b) => Number(b.dir === '') - Number(a.dir === ''));
}
