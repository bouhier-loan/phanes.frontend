import type { InventoryEntry } from '@phanes/core';

export interface DirNode {
  readonly name: string;
  readonly path: string;
  readonly dirs: Map<string, DirNode>;
  readonly files: InventoryEntry[];
  /** Entries below, archive entries included. */
  count: number;
  /** Bytes on disk below: archive entries are already counted in their archive. */
  bytes: number;
}

export type Row =
  | { readonly type: 'dir'; readonly key: string; readonly depth: number; readonly node: DirNode }
  | {
      readonly type: 'file';
      readonly key: string;
      readonly depth: number;
      readonly entry: InventoryEntry;
    };

function newDir(name: string, path: string): DirNode {
  return { name, path, dirs: new Map(), files: [], count: 0, bytes: 0 };
}

/** Builds the folder tree of the inventory: disk files and archive entries side by side. */
export function buildTree(entries: readonly InventoryEntry[]): DirNode {
  const root = newDir('', '');
  for (const entry of entries) {
    const parts = entry.path.split('/');
    parts.pop();
    const bytes = entry.archive === null ? entry.size : 0;
    let dir = root;
    dir.count++;
    dir.bytes += bytes;
    let path = '';
    for (const part of parts) {
      path = path ? `${path}/${part}` : part;
      let child = dir.dirs.get(part);
      if (!child) {
        child = newDir(part, path);
        dir.dirs.set(part, child);
      }
      dir = child;
      dir.count++;
      dir.bytes += bytes;
    }
    dir.files.push(entry);
  }
  return root;
}

const collator = new Intl.Collator('fr', { numeric: true });

type Work =
  | { readonly kind: 'dir'; readonly node: DirNode; readonly depth: number }
  | { readonly kind: 'row'; readonly row: Row };

function pushChildren(stack: Work[], node: DirNode, depth: number): void {
  const dirs = [...node.dirs.values()].sort((a, b) => collator.compare(a.name, b.name));
  const files = [...node.files].sort(
    (a, b) => collator.compare(a.path, b.path) || (a.shadowedBy === null ? -1 : 1),
  );
  // The stack pops in reverse: push files then folders, both reversed,
  // so that folders come first, each followed by its own subtree.
  for (let i = files.length - 1; i >= 0; i--) {
    const entry = files[i];
    if (entry)
      stack.push({
        kind: 'row',
        row: { type: 'file', key: `f:${entry.path}:${entry.archive ?? ''}:${i}`, depth, entry },
      });
  }
  for (let i = dirs.length - 1; i >= 0; i--) {
    const dir = dirs[i];
    if (dir) stack.push({ kind: 'dir', node: dir, depth });
  }
}

/** Visible rows for the expanded folders, without recursion (trees can be deep). */
export function flatten(root: DirNode, expanded: ReadonlySet<string>): Row[] {
  const rows: Row[] = [];
  const stack: Work[] = [];
  pushChildren(stack, root, 0);
  while (stack.length > 0) {
    const work = stack.pop();
    if (!work) break;
    if (work.kind === 'row') {
      rows.push(work.row);
      continue;
    }
    rows.push({ type: 'dir', key: `d:${work.node.path}`, depth: work.depth, node: work.node });
    if (expanded.has(work.node.path)) pushChildren(stack, work.node, work.depth + 1);
  }
  return rows;
}

/** Folders open at first: the top levels and the way down to the game directory. */
export function initialExpanded(root: DirNode, gameDir: string): Set<string> {
  const open = new Set<string>();
  for (const dir of root.dirs.values()) open.add(dir.path);
  let path = '';
  for (const part of gameDir.split('/').filter(Boolean)) {
    path = path ? `${path}/${part}` : part;
    open.add(path);
  }
  return open;
}
