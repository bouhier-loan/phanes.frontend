import type { InventoryEntry } from '@phanes/core';
import { describe, expect, it } from 'vitest';
import { buildTree, flatten, initialExpanded } from '../src/ui/sections/tree';

function entry(path: string, size = 1, archive: string | null = null): InventoryEntry {
  return { path, gamePath: null, size, kind: 'other', zone: 'game', archive, shadowedBy: null };
}

describe('inventory tree', () => {
  const entries = [
    entry('G/game/script.rpyc', 10),
    entry('G/game/images/b.png', 5, 'G/game/images.rpa'),
    entry('G/game/images/a.png', 5, 'G/game/images.rpa'),
    entry('G/game/images.rpa', 100),
    entry('G/renpy/ast.py', 1),
  ];

  it('aggregates counts per folder, and bytes on disk only', () => {
    const root = buildTree(entries);
    const game = root.dirs.get('G')?.dirs.get('game');
    expect(game?.count).toBe(4);
    expect(game?.bytes).toBe(110);
  });

  it('lists folders first, then files, honoring expansion', () => {
    const root = buildTree(entries);
    const rows = flatten(root, initialExpanded(root, 'G/game'));
    const labels = rows.map((r) =>
      r.type === 'dir'
        ? `${'  '.repeat(r.depth)}${r.node.name}/`
        : `${'  '.repeat(r.depth)}${r.entry.path.split('/').pop() ?? ''}`,
    );
    expect(labels).toEqual([
      'G/',
      '  game/',
      '    images/',
      '    images.rpa',
      '    script.rpyc',
      '  renpy/',
    ]);
    const expanded = flatten(root, new Set(['G', 'G/game', 'G/game/images']));
    expect(expanded.filter((r) => r.type === 'file' && r.depth === 3)).toHaveLength(2);
  });

  it('handles deep trees without recursion', () => {
    const deep = `${Array.from({ length: 5000 }, (_, i) => `d${i}`).join('/')}/file.txt`;
    const root = buildTree([entry(deep)]);
    const all = new Set<string>();
    let path = '';
    for (const part of deep.split('/').slice(0, -1)) {
      path = path ? `${path}/${part}` : part;
      all.add(path);
    }
    expect(flatten(root, all)).toHaveLength(5001);
  });
});
