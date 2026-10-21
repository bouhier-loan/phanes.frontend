import type { InventoryEntry, InventoryResult } from '@phanes/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useMemo, useRef, useState } from 'react';
import { formatBytes, formatNumber } from '../format';
import { t } from '../strings.fr';
import { buildTree, flatten, initialExpanded, type Row } from './tree';

const ROW_HEIGHT = 30;
const MAX_SEARCH_RESULTS = 5000;

function source(entry: InventoryEntry): string {
  return entry.archive === null
    ? t.inventory.onDisk
    : t.inventory.inArchive(entry.archive.split('/').pop() ?? entry.archive);
}

function FileCells({ entry, label }: { entry: InventoryEntry; label: string }) {
  return (
    <>
      <span
        className="cell name"
        title={entry.shadowedBy ? t.inventory.shadowed(entry.shadowedBy) : entry.path}
      >
        {label}
      </span>
      <span className="cell num">{formatBytes(entry.size)}</span>
      <span className="cell">{t.kinds[entry.kind]}</span>
      <span className="cell">{source(entry)}</span>
    </>
  );
}

export function InventorySection({ inventory }: { inventory: InventoryResult }) {
  const tree = useMemo(() => buildTree(inventory.entries), [inventory]);
  const [expanded, setExpanded] = useState(() => initialExpanded(tree, inventory.gameDir));
  const [query, setQuery] = useState('');
  const parent = useRef<HTMLDivElement>(null);

  const needle = query.trim().toLowerCase();
  const matches = useMemo(
    () => (needle ? inventory.entries.filter((e) => e.path.toLowerCase().includes(needle)) : []),
    [inventory, needle],
  );
  const rows: Row[] = useMemo(
    () =>
      needle
        ? matches
            .slice(0, MAX_SEARCH_RESULTS)
            .map((entry, i) => ({ type: 'file', key: `s:${i}`, depth: 0, entry }))
        : flatten(tree, expanded),
    [needle, matches, tree, expanded],
  );
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parent.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  });

  const toggle = (path: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const c = t.inventory.columns;
  return (
    <div className="inventory" data-testid="inventory">
      <p>
        {t.inventory.totals(
          inventory.totals.files,
          inventory.totals.archives,
          inventory.totals.archiveEntries,
        )}
      </p>
      {inventory.archives.length > 0 && (
        <table className="data archives">
          <thead>
            <tr>
              <th>{t.inventory.archiveColumns.path}</th>
              <th>{t.inventory.archiveColumns.version}</th>
              <th className="num">{t.inventory.archiveColumns.entries}</th>
              <th className="num">{t.inventory.archiveColumns.size}</th>
              <th>{t.inventory.archiveColumns.status}</th>
            </tr>
          </thead>
          <tbody>
            {inventory.archives.map((a) => (
              <tr key={a.path} className={a.error ? 'error' : undefined}>
                <td className="mono">{a.path}</td>
                <td>{a.version ?? '?'}</td>
                <td className="num">{formatNumber(a.entryCount)}</td>
                <td className="num">{formatBytes(a.size)}</td>
                <td>{a.error ? `${t.inventory.unreadable} (${a.error})` : t.inventory.readable}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <input
        type="search"
        className="search"
        placeholder={t.inventory.search}
        value={query}
        onChange={(e) => {
          setQuery(e.currentTarget.value);
        }}
      />
      {needle && matches.length > MAX_SEARCH_RESULTS && (
        <p className="note">{t.inventory.tooMany(MAX_SEARCH_RESULTS, matches.length)}</p>
      )}
      <div className="grid-header" role="row">
        <span className="cell name">{c.name}</span>
        <span className="cell num">{c.size}</span>
        <span className="cell">{c.kind}</span>
        <span className="cell">{c.source}</span>
      </div>
      <div className="scroller" ref={parent} role="tree">
        <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index];
            if (!row) return null;
            const style = {
              transform: `translateY(${item.start}px)`,
              height: `${ROW_HEIGHT}px`,
              paddingLeft: `${row.depth * 18 + 8}px`,
            };
            if (row.type === 'dir') {
              const open = expanded.has(row.node.path);
              return (
                <div
                  key={row.key}
                  className="grid-row dir"
                  style={style}
                  role="treeitem"
                  aria-expanded={open}
                >
                  <button
                    type="button"
                    className="cell name link"
                    onClick={() => {
                      toggle(row.node.path);
                    }}
                  >
                    {open ? '▾' : '▸'} {row.node.name}/
                  </button>
                  <span className="cell num">{formatBytes(row.node.bytes)}</span>
                  <span className="cell">{t.inventory.items(row.node.count)}</span>
                  <span className="cell" />
                </div>
              );
            }
            const label = needle
              ? row.entry.path
              : (row.entry.path.split('/').pop() ?? row.entry.path);
            return (
              <div
                key={row.key}
                className={row.entry.shadowedBy ? 'grid-row shadowed' : 'grid-row'}
                style={style}
                role="treeitem"
              >
                <FileCells entry={row.entry} label={label} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
