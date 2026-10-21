import type { Analysis } from './analysis';
import { FILE_KINDS, FILE_ZONES, type FileKind, type FileZone } from '../vfs/classify';
import type { ArchiveInfo } from '../vfs/vfs';

export type SizeStats = { count: number; bytes: number };

export type InventoryEntry = {
  path: string;
  gamePath: string | null;
  size: number;
  kind: FileKind;
  zone: FileZone;
  /** Archive the entry comes from, or null for a file on disk. */
  archive: string | null;
  shadowedBy: string | null;
};

export type InventoryResult = {
  rootName: string | null;
  gameDir: string;
  totals: {
    /** Files on disk. */
    files: number;
    /** Bytes on disk. */
    bytes: number;
    archives: number;
    archiveEntries: number;
    shadowed: number;
  };
  /** Game content Ren'Py would load: loose files and archive entries, without archives themselves. */
  byKind: Record<FileKind, SizeStats>;
  /** Files on disk, by location. */
  byZone: Record<FileZone, SizeStats>;
  archives: ArchiveInfo[];
  entries: InventoryEntry[];
};

function emptyStats<K extends string>(keys: readonly K[]): Record<K, SizeStats> {
  const out = {} as Record<K, SizeStats>;
  for (const key of keys) out[key] = { count: 0, bytes: 0 };
  return out;
}

export const inventoryAnalysis: Analysis<InventoryResult> = {
  id: 'inventory',
  run({ vfs }) {
    const byKind = emptyStats(FILE_KINDS);
    const byZone = emptyStats(FILE_ZONES);
    let files = 0;
    let bytes = 0;
    let archiveEntries = 0;
    let shadowed = 0;
    for (const entry of vfs.entries) {
      if (entry.origin.type === 'file') {
        files++;
        bytes += entry.size;
        byZone[entry.zone].count++;
        byZone[entry.zone].bytes += entry.size;
      } else {
        archiveEntries++;
      }
      if (entry.shadowedBy !== null) shadowed++;
      else if (entry.zone === 'game' && entry.kind !== 'archive') {
        byKind[entry.kind].count++;
        byKind[entry.kind].bytes += entry.size;
      }
    }
    return {
      rootName: vfs.rootName,
      gameDir: vfs.gameDir,
      totals: { files, bytes, archives: vfs.archives.length, archiveEntries, shadowed },
      byKind,
      byZone,
      archives: [...vfs.archives],
      entries: vfs.entries.map((e) => ({
        path: e.path,
        gamePath: e.gamePath,
        size: e.size,
        kind: e.kind,
        zone: e.zone,
        archive: e.origin.type === 'archive' ? e.origin.archive : null,
        shadowedBy: e.shadowedBy,
      })),
    };
  },
};
