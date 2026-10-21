import type { ArchiveInfo, Diagnostic, FileKind, InventoryEntry } from '@phanes/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useId, useMemo, useRef, useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon } from '../components/icons';
import { ChipGroup, PageHeader, SearchField } from '../components/ui';
import { basename, formatBytes } from '../format';
import { useReport } from '../report';
import { href } from '../route';
import { t } from '../strings.fr';
import { buildTree, flatten, initialExpanded, type Row } from '../sections/tree';

const ROW_HEIGHT = 41;
const MAX_RESULTS = 5000;

type KindFilter = 'all' | keyof typeof t.inventory.kinds;
const FILTER_KINDS: Readonly<Record<Exclude<KindFilter, 'all'>, readonly FileKind[]>> = {
  scripts: ['script', 'compiled-script'],
  image: ['image'],
  audio: ['audio'],
  video: ['video'],
  font: ['font'],
  archive: ['archive'],
  other: ['python', 'text', 'other'],
};

const LIMIT_CODES = new Set(['ZLIB_LIMIT', 'TOO_LARGE', 'PICKLE_LIMIT']);

function mediaTab(kind: FileKind): string | null {
  return kind === 'image'
    ? 'images'
    : kind === 'audio'
      ? 'audio'
      : kind === 'video'
        ? 'video'
        : null;
}

function Badge({
  entry,
  archive,
  problem,
}: {
  entry: InventoryEntry;
  archive: ArchiveInfo | undefined;
  problem: Diagnostic | undefined;
}) {
  const b = t.inventory.badges;
  if (archive?.error)
    return (
      <span className="tag tag-red">
        {archive.error === 'RPA_UNKNOWN_HEADER' ? b.unrecognized : b.unreadable}
      </span>
    );
  if (problem && LIMIT_CODES.has(problem.code))
    return <span className="tag tag-amber">{b.limit}</span>;
  if (problem?.severity === 'error') return <span className="tag tag-red">{b.unreadable}</span>;
  if (entry.shadowedBy)
    return (
      <span className="tag" title={t.inventory.shadowed(entry.shadowedBy)}>
        {b.shadowed}
      </span>
    );
  return null;
}

function Details({
  entry,
  archive,
  scripts,
  failed,
}: {
  entry: InventoryEntry;
  archive: ArchiveInfo | undefined;
  scripts: number;
  failed: number;
}) {
  const i = t.inventory;
  return (
    <section className="card card-raised card-pad" aria-labelledby="titre-selection">
      <div className="selection-head">
        <h2 id="titre-selection" className="mono selection-name">
          {basename(entry.path)}
        </h2>
        {archive?.version && <span className="tag mono">{archive.version}</span>}
      </div>
      <dl className="kv">
        <div>
          <dt>{i.size}</dt>
          <dd className="mono">{i.sizeValue(formatBytes(entry.size), entry.size)}</dd>
        </div>
        {archive ? (
          <>
            {archive.indexOffset !== null && (
              <div>
                <dt>{i.index}</dt>
                <dd className="mono">
                  {i.indexValue(
                    `0x${archive.indexOffset.toString(16).toUpperCase().padStart(8, '0')}`,
                    archive.pickleProtocol,
                  )}
                </dd>
              </div>
            )}
            {archive.key !== null && archive.key !== 0 && (
              <div>
                <dt>{i.key}</dt>
                <dd className="mono">0x{archive.key.toString(16).toUpperCase()}</dd>
              </div>
            )}
            <div>
              <dt>{i.content}</dt>
              <dd>
                {i.entries(archive.entryCount)}
                {archive.skippedEntries > 0 && (
                  <span className="text-amber"> · {i.skipped(archive.skippedEntries)}</span>
                )}
              </dd>
            </div>
            {scripts > 0 && (
              <div>
                <dt>{i.decoding}</dt>
                <dd>{i.decodingValue(scripts - failed, failed)}</dd>
              </div>
            )}
            {archive.error && (
              <div>
                <dt>{i.error}</dt>
                <dd className="mono text-red">{archive.error}</dd>
              </div>
            )}
          </>
        ) : (
          <>
            <div>
              <dt>{i.kind}</dt>
              <dd>{t.kinds[entry.kind]}</dd>
            </div>
            <div>
              <dt>{i.location}</dt>
              <dd className="mono">
                {entry.archive
                  ? `${basename(entry.archive)} › ${entry.gamePath ?? entry.path}`
                  : entry.path}
              </dd>
            </div>
            {entry.shadowedBy && (
              <div>
                <dt>{i.badges.shadowed}</dt>
                <dd className="small">{i.shadowed(entry.shadowedBy)}</dd>
              </div>
            )}
          </>
        )}
      </dl>
      <p className="selection-note">{i.archiveNote}</p>
    </section>
  );
}

export function InventoryPage() {
  const r = useReport();
  const inventory = r.inventory;
  const i = t.inventory;
  const checkboxId = useId();
  const tree = useMemo(() => buildTree(inventory?.entries ?? []), [inventory]);
  const [expanded, setExpanded] = useState(() => initialExpanded(tree, inventory?.gameDir ?? ''));
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const [withArchives, setWithArchives] = useState(true);
  const [selected, setSelected] = useState<string | null>(
    () => inventory?.archives[0]?.path ?? null,
  );
  const scroller = useRef<HTMLDivElement>(null);

  const archives = useMemo(
    () => new Map((inventory?.archives ?? []).map((a) => [a.path, a])),
    [inventory],
  );
  const problems = useMemo(() => {
    const out = new Map<string, Diagnostic>();
    for (const d of r.diagnostics) if (d.path && !out.has(d.path)) out.set(d.path, d);
    return out;
  }, [r.diagnostics]);
  const visibleTree = useMemo(
    () =>
      withArchives ? tree : buildTree((inventory?.entries ?? []).filter((e) => e.archive === null)),
    [withArchives, tree, inventory],
  );

  const needle = query.trim().toLowerCase();
  const flat = needle !== '' || kind !== 'all';
  const matches = useMemo(() => {
    if (!flat) return [];
    const kinds = kind === 'all' ? null : FILTER_KINDS[kind];
    return (inventory?.entries ?? []).filter(
      (e) =>
        (withArchives || e.archive === null) &&
        (!kinds || kinds.includes(e.kind)) &&
        (!needle || e.path.toLowerCase().includes(needle)),
    );
  }, [flat, inventory, kind, needle, withArchives]);
  const rows: Row[] = useMemo(
    () =>
      flat
        ? matches
            .slice(0, MAX_RESULTS)
            .map((entry, n) => ({ type: 'file', key: `s:${n}`, depth: 0, entry }))
        : flatten(visibleTree, expanded),
    [flat, matches, visibleTree, expanded],
  );
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  });

  if (!inventory) return <p className="empty">{t.unavailable}</p>;
  const toggle = (path: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };
  const countOf = (k: Exclude<KindFilter, 'all'>) =>
    inventory.entries.filter((e) => FILTER_KINDS[k].includes(e.kind)).length;
  const chips = (Object.keys(FILTER_KINDS) as Exclude<KindFilter, 'all'>[])
    .map((k) => ({ value: k, label: i.kinds[k], count: countOf(k) }))
    .filter((c) => c.count > 0);
  const selectedEntry = inventory.entries.find((e) => e.path === selected);
  const selectedArchive = selected ? archives.get(selected) : undefined;
  const inSelected = selectedArchive
    ? inventory.entries.filter(
        (e) => e.archive === selectedArchive.path && e.kind === 'compiled-script',
      )
    : [];
  const failedInSelected = inSelected.filter(
    (e) => problems.get(e.path)?.severity === 'error',
  ).length;
  const heaviest = [...inventory.entries]
    .filter((e) => e.kind !== 'archive')
    .sort((a, b) => b.size - a.size)
    .slice(0, 5);

  const typeOf = (entry: InventoryEntry) => {
    const archive = archives.get(entry.path);
    if (archive) return i.archiveType(archive.version, archive.entryCount);
    return entry.archive ? `${t.kinds[entry.kind]} · ${i.inArchive}` : t.kinds[entry.kind];
  };

  return (
    <>
      <PageHeader
        crumbs={t.crumbs(r.title, t.groups.report)}
        title={t.sections.inventaire}
        lede={i.lede}
      >
        <SearchField label={i.search} value={query} onChange={setQuery} />
      </PageHeader>

      <div className="toolbar">
        <ChipGroup
          label={i.kindsLabel}
          value={kind}
          onChange={setKind}
          options={[{ value: 'all', label: i.all }, ...chips]}
        />
        <div className="check">
          <input
            id={checkboxId}
            type="checkbox"
            checked={withArchives}
            onChange={(e) => {
              setWithArchives(e.currentTarget.checked);
            }}
          />
          <label htmlFor={checkboxId}>{i.showArchives}</label>
        </div>
      </div>

      <div className="split">
        <section aria-label={i.tree} className="card split-main inventory" data-testid="inventory">
          <p className="inventory-totals small muted">
            {i.totals(
              inventory.totals.files,
              inventory.totals.archives,
              inventory.totals.archiveEntries,
            )}
          </p>
          <div className="grid-head" role="presentation">
            <span>{i.columns.name}</span>
            <span>{i.columns.type}</span>
            <span className="right">{i.columns.size}</span>
          </div>
          <div className="scroller" ref={scroller} role="tree" aria-label={i.tree}>
            <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
              {virtualizer.getVirtualItems().map((item) => {
                const row = rows[item.index];
                if (!row) return null;
                const style = {
                  transform: `translateY(${item.start}px)`,
                  height: `${ROW_HEIGHT}px`,
                };
                const indent = { paddingLeft: `${row.depth * 22 + 10}px` };
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
                      <span className="cell name" style={indent}>
                        <button
                          type="button"
                          className="tree-toggle"
                          aria-label={
                            open ? i.collapse(`${row.node.name}/`) : i.expand(`${row.node.name}/`)
                          }
                          onClick={() => {
                            toggle(row.node.path);
                          }}
                        >
                          {open ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
                        </button>
                        <span className="mono">{row.node.name}/</span>
                      </span>
                      <span className="cell muted">{i.dir(row.node.count)}</span>
                      <span className="cell right mono">{formatBytes(row.node.bytes)}</span>
                    </div>
                  );
                }
                const entry = row.entry;
                const label = flat ? entry.path : basename(entry.path);
                const isSelected = entry.path === selected;
                return (
                  <div
                    key={row.key}
                    className={`grid-row${isSelected ? ' selected' : ''}${entry.shadowedBy ? ' shadowed' : ''}`}
                    style={style}
                    role="treeitem"
                    aria-selected={isSelected}
                  >
                    <span className="cell name" style={indent}>
                      <button
                        type="button"
                        className="file-button mono"
                        onClick={() => {
                          setSelected(entry.path);
                        }}
                        title={entry.path}
                      >
                        {label}
                      </button>
                      <Badge
                        entry={entry}
                        archive={archives.get(entry.path)}
                        problem={problems.get(entry.path)}
                      />
                    </span>
                    <span className="cell muted">{typeOf(entry)}</span>
                    <span className="cell right mono">{formatBytes(entry.size)}</span>
                  </div>
                );
              })}
            </div>
          </div>
          {flat && matches.length > MAX_RESULTS && (
            <p className="table-foot">{i.tooMany(MAX_RESULTS, matches.length)}</p>
          )}
        </section>

        <aside aria-label={i.detailsLabel} className="split-aside">
          {selectedEntry ? (
            <Details
              entry={selectedEntry}
              archive={selectedArchive}
              scripts={inSelected.length}
              failed={failedInSelected}
            />
          ) : (
            <p className="card card-pad muted">{i.selectHint}</p>
          )}
          <section className="card card-pad" aria-labelledby="titre-lourds">
            <h2 id="titre-lourds" className="small-title">
              {i.heaviest}
            </h2>
            <ol className="list">
              {heaviest.map((e) => {
                const tab = mediaTab(e.kind);
                const name = e.archive
                  ? `${basename(e.archive)} › ${e.gamePath ?? e.path}`
                  : (e.gamePath ?? e.path);
                return (
                  <li key={`${e.path}:${e.archive ?? ''}`} className="list-row">
                    {tab ? (
                      <a href={href('ressources', tab)} className="mono plain-link">
                        {name}
                      </a>
                    ) : (
                      <span className="mono">{name}</span>
                    )}
                    <span className="mono muted">{formatBytes(e.size)}</span>
                  </li>
                );
              })}
            </ol>
          </section>
        </aside>
      </div>
    </>
  );
}
