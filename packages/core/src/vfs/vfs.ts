import {
  type FileSource,
  openRpaEntry,
  readRpaIndex,
  readRpiIndex,
  type RpaIndex,
  type RpaReadOptions,
  type RpaVersion,
} from '@phanes/renpy-formats';
import { type Diagnostic, diagnosticFromError } from '../model/diagnostic';
import { extensionOf, type FileKind, type FileZone, kindOf, zoneOf } from './classify';

export type VfsOrigin =
  { readonly type: 'file' } | { readonly type: 'archive'; readonly archive: string };

export interface VfsEntry {
  /** Path from the root of what the user dropped; archive entries sit under the game directory. */
  readonly path: string;
  /** Path relative to the game directory, as Ren'Py names it; null outside the game directory. */
  readonly gamePath: string | null;
  readonly size: number;
  readonly kind: FileKind;
  readonly zone: FileZone;
  readonly origin: VfsOrigin;
  /** Path of the file or archive that Ren'Py would load instead of this one. */
  shadowedBy: string | null;
  readonly source: FileSource;
}

// A type alias (not an interface) so it stays assignable to Json.
export type ArchiveInfo = {
  readonly path: string;
  /** The .rpi index of an RPA-1.0 archive. */
  readonly indexPath: string | null;
  readonly size: number;
  readonly version: RpaVersion | null;
  readonly key: number | null;
  readonly indexOffset: number | null;
  readonly pickleProtocol: number | null;
  readonly entryCount: number;
  readonly skippedEntries: number;
  /** Code of the error that made the archive unreadable, if any. */
  readonly error: string | null;
};

export interface Vfs {
  /** First path segment shared by every dropped file, if any. */
  readonly rootName: string | null;
  /** Path of the game directory ('' when the drop itself is the game directory). */
  readonly gameDir: string;
  readonly entries: readonly VfsEntry[];
  readonly archives: readonly ArchiveInfo[];
}

export interface VfsProgress {
  readonly done: number;
  readonly total: number;
  readonly path: string;
}

export interface BuildVfsOptions {
  readonly rpa?: RpaReadOptions;
  readonly onProgress?: (progress: VfsProgress) => void;
}

const RELEVANT: ReadonlySet<FileKind> = new Set(['script', 'compiled-script', 'archive']);

function parentOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? '' : path.slice(0, slash);
}

function join(dir: string, name: string): string {
  return dir === '' ? name : `${dir}/${name}`;
}

function under(dir: string, path: string): boolean {
  return dir === '' || path.startsWith(`${dir}/`);
}

function relativeTo(dir: string, path: string): string {
  return dir === '' ? path : path.slice(dir.length + 1);
}

/**
 * Finds the game directory: the shallowest directory named "game" that holds
 * scripts or archives, else the drop root.
 */
export function detectGameDir(paths: readonly string[]): { gameDir: string; ambiguous: string[] } {
  const candidates = new Map<string, number>();
  for (const path of paths) {
    const relevant = RELEVANT.has(kindOf(path));
    const parts = path.split('/');
    for (let i = parts.length - 2; i >= 0; i--) {
      if (parts[i]?.toLowerCase() !== 'game') continue;
      const dir = parts.slice(0, i + 1).join('/');
      candidates.set(dir, (candidates.get(dir) ?? 0) + (relevant ? 1 : 0));
    }
  }
  const ranked = [...candidates.entries()]
    .filter(([, relevant]) => relevant > 0)
    .map(([dir]) => dir)
    .sort((a, b) => a.split('/').length - b.split('/').length || (a < b ? -1 : a > b ? 1 : 0));
  const best = ranked[0];
  if (best === undefined) return { gameDir: '', ambiguous: [] };
  const depth = best.split('/').length;
  // Directories nested in the chosen one (e.g. game/minigame/game) are not rivals.
  const rivals = ranked.filter((dir) => dir.split('/').length === depth && dir !== best);
  return { gameDir: best, ambiguous: rivals };
}

function commonRoot(paths: readonly string[]): string | null {
  let root: string | null = null;
  for (const path of paths) {
    const slash = path.indexOf('/');
    if (slash < 0) return null;
    const first = path.slice(0, slash);
    if (root === null) root = first;
    else if (root !== first) return null;
  }
  return root;
}

function stemOf(path: string): string {
  const ext = extensionOf(path);
  return ext === '' ? path : path.slice(0, path.length - ext.length - 1);
}

/** Ren'Py's archive order: sorted by (stem, extension, path), reversed (renpy/loader.py). */
function compareArchivesForRenpy(a: ArchiveInfo, b: ArchiveInfo, gameDir: string): number {
  const ka = [stemOf(relativeTo(gameDir, a.path)), extensionOf(a.path), a.path];
  const kb = [stemOf(relativeTo(gameDir, b.path)), extensionOf(b.path), b.path];
  for (let i = 0; i < 3; i++) {
    const x = ka[i] ?? '';
    const y = kb[i] ?? '';
    if (x !== y) return x < y ? 1 : -1;
  }
  return 0;
}

/**
 * Builds the unified file tree: dropped files plus the content of every RPA
 * archive in the game directory. Only archive indexes are read.
 */
export async function buildVfs(
  files: readonly FileSource[],
  options: BuildVfsOptions = {},
): Promise<{ vfs: Vfs; diagnostics: Diagnostic[] }> {
  const diagnostics: Diagnostic[] = [];
  const paths = files.map((f) => f.path);
  const { gameDir, ambiguous } = detectGameDir(paths);
  if (ambiguous.length > 0) {
    diagnostics.push({
      severity: 'warning',
      code: 'MULTIPLE_GAME_DIRS',
      message: `several game directories found; analyzing ${gameDir}`,
      details: { chosen: gameDir, others: ambiguous.join(', ') },
    });
  }
  const outerRoot = parentOf(gameDir);

  const loose: VfsEntry[] = files.map((source) => {
    const inGame = under(gameDir, source.path);
    const gamePath = inGame ? relativeTo(gameDir, source.path) : null;
    const outerPath = under(outerRoot, source.path)
      ? relativeTo(outerRoot, source.path)
      : source.path;
    return {
      path: source.path,
      gamePath,
      size: source.size,
      kind: kindOf(source.path),
      zone: zoneOf(gamePath, outerPath),
      origin: { type: 'file' },
      shadowedBy: null,
      source,
    };
  });

  const byLowerPath = new Map(loose.map((e) => [e.path.toLowerCase(), e]));
  const archiveFiles = loose.filter(
    (e) => e.kind === 'archive' && (e.zone === 'game' || e.zone === 'cache'),
  );
  const archives: ArchiveInfo[] = [];
  const archiveEntries = new Map<string, VfsEntry[]>();
  let done = 0;
  for (const file of archiveFiles) {
    options.onProgress?.({ done, total: archiveFiles.length, path: file.path });
    done++;
    const ext = extensionOf(file.path);
    const stem = file.path.slice(0, file.path.length - ext.length - 1);
    const rpi = ext === 'rpa' ? byLowerPath.get(`${stem}.rpi`.toLowerCase()) : undefined;
    if (rpi) continue; // RPA-1.0: handled with its .rpi index
    const data = ext === 'rpi' ? byLowerPath.get(`${stem}.rpa`.toLowerCase()) : file;
    if (!data) {
      diagnostics.push({
        severity: 'error',
        code: 'RPA_MISSING_DATA',
        message: 'RPA-1.0 index without its .rpa data file',
        path: file.path,
      });
      continue;
    }
    let index: RpaIndex | null = null;
    let error: string | null = null;
    try {
      index =
        ext === 'rpi'
          ? await readRpiIndex(file.source, data.source, options.rpa)
          : await readRpaIndex(file.source, options.rpa);
    } catch (e) {
      const diagnostic = diagnosticFromError(e, data.path);
      diagnostics.push(diagnostic);
      error = diagnostic.code;
    }
    archives.push({
      path: data.path,
      indexPath: ext === 'rpi' ? file.path : null,
      size: data.size,
      version: index?.version ?? null,
      key: index?.key ?? null,
      indexOffset: index?.indexOffset ?? null,
      pickleProtocol: index?.pickleProtocol ?? null,
      entryCount: index?.entries.length ?? 0,
      skippedEntries: index?.problems.length ?? 0,
      error,
    });
    if (!index) continue;
    for (const problem of index.problems) {
      diagnostics.push({
        severity: 'warning',
        code: 'RPA_ENTRY_SKIPPED',
        message: problem.message,
        path: data.path,
        details: { entry: problem.name },
      });
    }
    const archiveDir = gameDir;
    archiveEntries.set(
      data.path,
      index.entries.map((entry) => {
        const path = join(archiveDir, entry.name);
        return {
          path,
          gamePath: entry.name,
          size: entry.size,
          kind: kindOf(entry.name),
          zone: zoneOf(entry.name, entry.name),
          origin: { type: 'archive', archive: data.path },
          shadowedBy: null,
          source: openRpaEntry(data.source, entry, path),
        };
      }),
    );
  }

  // Precedence: loose files first, then archives in Ren'Py's order.
  const ordered = [...archives].sort((a, b) => compareArchivesForRenpy(a, b, gameDir));
  const fromArchives = ordered.flatMap((a) => archiveEntries.get(a.path) ?? []);
  const winners = new Map<string, VfsEntry>();
  for (const entry of [...loose, ...fromArchives]) {
    if (entry.gamePath === null) continue;
    const winner = winners.get(entry.gamePath);
    if (!winner) winners.set(entry.gamePath, entry);
    else entry.shadowedBy = winner.origin.type === 'archive' ? winner.origin.archive : winner.path;
  }

  return {
    vfs: {
      rootName: commonRoot(paths),
      gameDir,
      entries: [...loose, ...archives.flatMap((a) => archiveEntries.get(a.path) ?? [])],
      archives,
    },
    diagnostics,
  };
}

/** Entries Ren'Py would actually load from the game directory. */
export function effectiveGameEntries(vfs: Vfs): VfsEntry[] {
  return vfs.entries.filter((e) => e.gamePath !== null && e.shadowedBy === null);
}
