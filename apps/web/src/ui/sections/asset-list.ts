import type { AssetFile, AudioAsset, ImageAsset, ImageCategory, VideoAsset } from '@phanes/core';

export type ImageStatus = 'all' | 'displayed' | 'never' | 'missing-file' | 'no-file';
export type AudioStatus = 'all' | 'played' | 'never';
export type AssetSort = 'name' | 'size' | 'folder' | 'uses';

const collator = new Intl.Collator('fr', { numeric: true });

export function folderOf(gamePath: string): string {
  const slash = gamePath.lastIndexOf('/');
  return slash < 0 ? '' : gamePath.slice(0, slash);
}

function matches(needle: string, ...texts: (string | null | undefined)[]): boolean {
  return needle === '' || texts.some((t) => t?.toLowerCase().includes(needle));
}

/** Images matching a text (name or file), a category and a display status. */
export function filterImages(
  images: readonly ImageAsset[],
  filter: { query: string; category: ImageCategory | 'all'; status: ImageStatus },
): ImageAsset[] {
  const needle = filter.query.trim().toLowerCase();
  return images.filter(
    (i) =>
      (filter.category === 'all' || i.category === filter.category) &&
      (filter.status === 'all' ||
        (filter.status === 'displayed' && i.displays.length > 0) ||
        (filter.status === 'never' && i.displays.length === 0) ||
        (filter.status === 'missing-file' && i.missingFile !== null) ||
        (filter.status === 'no-file' && i.file === null && i.missingFile === null)) &&
      matches(needle, i.name, i.file?.gamePath, i.missingFile),
  );
}

function compare(
  sort: AssetSort,
  a: { name: string; file: AssetFile | null; uses: number },
  b: { name: string; file: AssetFile | null; uses: number },
): number {
  const byName = collator.compare(a.name, b.name);
  switch (sort) {
    case 'size':
      return (b.file?.size ?? 0) - (a.file?.size ?? 0) || byName;
    case 'folder':
      return collator.compare(a.file?.gamePath ?? '', b.file?.gamePath ?? '') || byName;
    case 'uses':
      return b.uses - a.uses || byName;
    default:
      return byName;
  }
}

export function sortImages(images: readonly ImageAsset[], sort: AssetSort): ImageAsset[] {
  const key = (i: ImageAsset) => ({ name: i.name, file: i.file, uses: i.displays.length });
  return [...images].sort((a, b) => compare(sort, key(a), key(b)));
}

/** Audio files matching a text (path), a play status and a channel. */
export function filterAudio(
  files: readonly AudioAsset[],
  filter: { query: string; status: AudioStatus; channel: string },
): AudioAsset[] {
  const needle = filter.query.trim().toLowerCase();
  return files.filter(
    (a) =>
      (filter.status === 'all' ||
        (filter.status === 'played' && a.plays.length > 0) ||
        (filter.status === 'never' && a.plays.length === 0)) &&
      (filter.channel === 'all' || a.plays.some((p) => p.channel === filter.channel)) &&
      matches(needle, a.file.gamePath, a.file.archive),
  );
}

export function sortAudio(files: readonly AudioAsset[], sort: AssetSort): AudioAsset[] {
  const key = (a: AudioAsset) => ({ name: a.file.gamePath, file: a.file, uses: a.plays.length });
  return [...files].sort((a, b) => compare(sort, key(a), key(b)));
}

export function filterVideo(files: readonly VideoAsset[], query: string): VideoAsset[] {
  const needle = query.trim().toLowerCase();
  return files.filter((v) => matches(needle, v.file.gamePath, v.file.archive));
}

export function sortVideo(files: readonly VideoAsset[], sort: AssetSort): VideoAsset[] {
  const key = (v: VideoAsset) => ({ name: v.file.gamePath, file: v.file, uses: v.uses.length });
  return [...files].sort((a, b) => compare(sort, key(a), key(b)));
}

export type Group<T> = { key: string; items: T[]; bytes: number };

/** Groups in order of first appearance, so that a sorted list stays sorted. */
export function groupBy<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  sizeOf: (item: T) => number,
): Group<T>[] {
  const groups = new Map<string, Group<T>>();
  for (const item of items) {
    const key = keyOf(item);
    let group = groups.get(key);
    if (!group) {
      group = { key, items: [], bytes: 0 };
      groups.set(key, group);
    }
    group.items.push(item);
    group.bytes += sizeOf(item);
  }
  return [...groups.values()];
}

export type ListRow<T> =
  | { type: 'header'; key: string; group: Group<T>; open: boolean }
  | { type: 'items'; key: string; items: T[] };

/**
 * Rows of a virtualized list or grid: a header per group (when grouped),
 * then the items of each open group, `columns` per row.
 */
export function listRows<T>(
  groups: readonly Group<T>[],
  columns: number,
  options: { grouped: boolean; collapsed: ReadonlySet<string> },
): ListRow<T>[] {
  const rows: ListRow<T>[] = [];
  const width = Math.max(1, Math.floor(columns));
  for (const group of groups) {
    const open = !options.grouped || !options.collapsed.has(group.key);
    if (options.grouped) rows.push({ type: 'header', key: `h:${group.key}`, group, open });
    if (!open) continue;
    for (let i = 0; i < group.items.length; i += width)
      rows.push({
        type: 'items',
        key: `i:${group.key}:${i}`,
        items: group.items.slice(i, i + width),
      });
  }
  return rows;
}
