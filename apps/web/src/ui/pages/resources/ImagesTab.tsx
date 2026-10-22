import type { ImageAsset, ImageCategory } from '@phanes/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useAssetUrl } from '../../assets';
import { ChevronLeftIcon, ChevronRightIcon, ImageIcon } from '../../components/icons';
import { Callout, ChipGroup, SearchField, Select, StatCard } from '../../components/ui';
import { formatBytes, formatLocation, formatNumber } from '../../format';
import { useReport } from '../../report';
import { href } from '../../route';
import {
  type AssetSort,
  filterImages,
  groupBy,
  type ImageStatus,
  listRows,
  sortImages,
} from '../../sections/asset-list';
import { t } from '../../strings.fr';
import { fileLabel, GroupHeader, SiteList, useWidth } from './shared';

const MIN_THUMB = 140;
const GAP = 10;
const HEADER_HEIGHT = 44;

function Thumb({
  image,
  selected,
  onSelect,
}: {
  image: ImageAsset;
  selected: boolean;
  onSelect: () => void;
}) {
  const url = useAssetUrl(image.file?.path ?? null);
  return (
    <button
      type="button"
      className="thumb"
      aria-pressed={selected}
      aria-label={t.resources.select(image.name)}
      onClick={onSelect}
    >
      <span className="thumb-frame" aria-hidden="true">
        {url ? <img src={url} alt="" decoding="async" /> : <ImageIcon size={22} />}
      </span>
      <span className="mono thumb-name">{image.name}</span>
      {image.displays.length === 0 && (
        <span className="tag tag-amber">{t.resources.neverShown}</span>
      )}
    </button>
  );
}

function Viewer({
  image,
  onPrevious,
  onNext,
}: {
  image: ImageAsset;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const res = t.resources;
  const [actual, setActual] = useState(false);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const url = useAssetUrl(image.file?.path ?? null);
  const ext = image.file
    ? image.file.gamePath.slice(image.file.gamePath.lastIndexOf('.') + 1).toUpperCase()
    : null;
  return (
    <div className="card viewer">
      <div className="viewer-head">
        <h3 className="mono">{image.name}</h3>
        <div className="viewer-tools">
          <div role="group" aria-label={res.zoomLabel} className="segmented">
            <button
              type="button"
              aria-pressed={!actual}
              onClick={() => {
                setActual(false);
              }}
            >
              {res.fit}
            </button>
            <button
              type="button"
              aria-pressed={actual}
              onClick={() => {
                setActual(true);
              }}
            >
              {res.actual}
            </button>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label={res.previous}
            onClick={onPrevious}
          >
            <ChevronLeftIcon size={16} />
          </button>
          <button type="button" className="icon-button" aria-label={res.next} onClick={onNext}>
            <ChevronRightIcon size={16} />
          </button>
        </div>
      </div>
      <div className={actual ? 'viewer-stage actual' : 'viewer-stage'}>
        {!image.file ? (
          <p className="faint">{res.noFile}</p>
        ) : failed ? (
          <p className="faint">{res.cannotShow}</p>
        ) : url ? (
          <img
            src={url}
            alt={res.preview(image.name)}
            onLoad={(e) => {
              setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight });
            }}
            onError={() => {
              setFailed(true);
            }}
          />
        ) : (
          <p className="faint">{res.loading}</p>
        )}
      </div>
      <dl className="kv viewer-meta">
        {image.file && (
          <>
            <div>
              <dt>{res.file}</dt>
              <dd className="mono">{fileLabel(image.file)}</dd>
            </div>
            <div>
              <dt>{res.format}</dt>
              <dd className="mono">
                {[ext, size ? `${size.w} × ${size.h}` : null, formatBytes(image.file.size)]
                  .filter(Boolean)
                  .join(' · ')}
              </dd>
            </div>
          </>
        )}
        {image.missingFile && (
          <div>
            <dt>{res.file}</dt>
            <dd className="mono text-red">{res.fileMissing(image.missingFile)}</dd>
          </div>
        )}
        <div>
          <dt>{res.declaration}</dt>
          <dd className="mono">
            {image.declaration === 'automatic'
              ? res.automaticDeclaration
              : image.loc
                ? res.statementAt(formatLocation(image.loc))
                : ''}
          </dd>
        </div>
        <div>
          <dt>
            {image.displays.length > 0
              ? res.displayedTimes(image.displays.length)
              : res.notDisplayed}
          </dt>
          <dd>
            <SiteList sites={image.displays} limit={8} />
          </dd>
        </div>
      </dl>
      <p className="small faint">{res.localNote}</p>
    </div>
  );
}

function MissingTable() {
  const { assets } = useReport();
  const res = t.resources;
  const missing = assets?.images.missing ?? [];
  if (missing.length === 0) return null;
  return (
    <section aria-labelledby="titre-manquantes" className="card">
      <h2 id="titre-manquantes" className="card-heading">
        {res.missingTitle} <span className="faint">· {formatNumber(missing.length)}</span>
      </h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">{res.missingColumns.statement}</th>
              <th scope="col">{res.missingColumns.location}</th>
              <th scope="col">{res.missingColumns.problem}</th>
            </tr>
          </thead>
          <tbody>
            {missing.map((m, i) => (
              <tr key={`${m.name}:${m.site.loc.line}:${i}`}>
                <td>
                  <code className="mono">{m.site.code}</code>
                </td>
                <td className="mono muted">
                  {m.site.label ? (
                    <a href={href('lecteur', m.site.label)}>{formatLocation(m.site.loc)}</a>
                  ) : (
                    formatLocation(m.site.loc)
                  )}
                </td>
                <td className="small">
                  {m.reason === 'file-missing' && m.file ? (
                    res.fileMissing(m.file)
                  ) : (
                    <>
                      {res.undeclared}
                      {m.suggestion && (
                        <>
                          {' '}
                          {res.suggestion}
                          <code className="code-chip">{m.suggestion}</code>
                        </>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * The image gallery: `focus` is an image name to select, or `?text` to
 * search for (links from the reader and the character sheets).
 */
export function ImagesTab({ focus }: { focus: string | null }) {
  const { assets } = useReport();
  const res = t.resources;
  const groupId = useId();
  const search = focus?.startsWith('?') ? focus.slice(1) : null;
  const [query, setQuery] = useState(search ?? '');
  const [category, setCategory] = useState<ImageCategory | 'all'>('all');
  const [status, setStatus] = useState<ImageStatus>('all');
  const [sort, setSort] = useState<AssetSort>('name');
  const [grouped, setGrouped] = useState(true);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(search === null ? focus : null);
  const scroller = useRef<HTMLDivElement>(null);
  const width = useWidth(scroller);
  const columns = Math.max(1, Math.floor((width - 4 + GAP) / (MIN_THUMB + GAP)));
  const cell = width > 0 ? (width - 4 - GAP * (columns - 1)) / columns : MIN_THUMB;

  const images = useMemo(() => assets?.images.entries ?? [], [assets]);
  const list = useMemo(
    () => sortImages(filterImages(images, { query, category, status }), sort),
    [images, query, category, status, sort],
  );
  const groups = useMemo(
    () =>
      grouped
        ? groupBy(
            // A stable sort: each tag keeps the order chosen by the user.
            [...list].sort((a, b) => a.tag.localeCompare(b.tag)),
            (i) => i.tag,
            (i) => i.file?.size ?? 0,
          )
        : groupBy(
            list,
            () => '',
            (i) => i.file?.size ?? 0,
          ),
    [list, grouped],
  );
  // The order shown on screen, for previous / next.
  const ordered = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const rows = useMemo(
    () => listRows(groups, columns, { grouped, collapsed }),
    [groups, columns, grouped, collapsed],
  );
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: (i) =>
      rows[i]?.type === 'header' ? HEADER_HEIGHT : Math.round(cell * 0.625) + 72,
    overscan: 4,
  });

  const current =
    ordered.find((i) => i.name === selected) ??
    images.find((i) => i.name === selected) ??
    ordered[0];

  // Brings a focused image into view once the gallery knows its width.
  const scrolled = useRef(false);
  useEffect(() => {
    if (scrolled.current || width === 0 || selected === null) return;
    scrolled.current = true;
    const index = rows.findIndex(
      (r) => r.type === 'items' && r.items.some((i) => i.name === selected),
    );
    if (index > 0) virtualizer.scrollToIndex(index, { align: 'center' });
  }, [rows, selected, virtualizer, width]);

  if (!assets) return <p className="empty">{t.unavailable}</p>;
  const totals = assets.images.totals;
  const step = (delta: number) => {
    if (!current || ordered.length === 0) return;
    const index = ordered.indexOf(current);
    const next = ordered[(index + delta + ordered.length) % ordered.length];
    if (next) setSelected(next.name);
  };
  const count = (c: ImageCategory) => images.filter((i) => i.category === c).length;
  const neverBytes = images
    .filter((i) => i.displays.length === 0)
    .reduce((n, i) => n + (i.file?.size ?? 0), 0);
  const listBytes = list.reduce((n, i) => n + (i.file?.size ?? 0), 0);
  const filtered = query !== '' || category !== 'all' || status !== 'all';

  return (
    <>
      <section aria-label={res.summaryLabel} className="stat-grid">
        <StatCard
          label={res.declared}
          value={formatNumber(totals.declared)}
          detail={res.automatic(totals.automatic)}
        />
        <StatCard label={res.displayed} value={formatNumber(totals.displayed)} />
        <StatCard
          label={res.neverDisplayed}
          value={formatNumber(totals.neverDisplayed)}
          detail={res.neverBytes(formatBytes(neverBytes))}
        />
        <StatCard
          label={res.missing}
          value={formatNumber(totals.missing)}
          detail={res.missingNote}
        />
      </section>

      {images.length === 0 ? (
        <p className="empty">{res.noImages}</p>
      ) : (
        <section aria-labelledby="titre-galerie" className="split gallery-split">
          <div className="card card-pad split-main asset-main">
            <div className="card-title-row">
              <h2 id="titre-galerie">{res.gallery}</h2>
              <span className="small muted">
                {res.shown(list.length, images.length, formatBytes(listBytes))}
              </span>
            </div>
            <div className="asset-toolbar">
              <SearchField label={res.search} value={query} onChange={setQuery} />
              <Select
                label={res.statusLabel}
                value={status}
                onChange={setStatus}
                options={(Object.keys(res.imageStatus) as ImageStatus[]).map((v) => ({
                  value: v,
                  label: res.imageStatus[v],
                }))}
              />
              <Select
                label={res.sortLabel}
                value={sort}
                onChange={setSort}
                options={(['name', 'size', 'folder', 'uses'] as const).map((v) => ({
                  value: v,
                  label: res.sort[v],
                }))}
              />
              <div className="check">
                <input
                  id={groupId}
                  type="checkbox"
                  checked={grouped}
                  onChange={(e) => {
                    setGrouped(e.currentTarget.checked);
                  }}
                />
                <label htmlFor={groupId}>{res.groupByTag}</label>
              </div>
            </div>
            <ChipGroup
              label={res.categoryLabel}
              value={category}
              onChange={setCategory}
              options={[
                { value: 'all', label: res.categories.all, count: images.length },
                ...(['background', 'sprite', 'cg', 'other'] as const)
                  .map((c) => ({ value: c, label: res.categories[c], count: count(c) }))
                  .filter((o) => o.count > 0),
              ]}
            />
            <div className="asset-scroller" ref={scroller} data-testid="gallery">
              {list.length === 0 ? (
                <div className="asset-empty">
                  <p className="muted">{res.noMatch}</p>
                  {filtered && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      onClick={() => {
                        setQuery('');
                        setCategory('all');
                        setStatus('all');
                      }}
                    >
                      {res.resetFilters}
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
                  {virtualizer.getVirtualItems().map((item) => {
                    const row = rows[item.index];
                    if (!row) return null;
                    return (
                      <div
                        key={row.key}
                        ref={virtualizer.measureElement}
                        data-index={item.index}
                        className="asset-row"
                        style={{ transform: `translateY(${item.start}px)` }}
                      >
                        {row.type === 'header' ? (
                          <GroupHeader
                            name={row.group.key}
                            summary={res.groupSummary(
                              row.group.items.length,
                              formatBytes(row.group.bytes),
                            )}
                            open={row.open}
                            onToggle={() => {
                              setCollapsed((c) => {
                                const next = new Set(c);
                                if (next.has(row.group.key)) next.delete(row.group.key);
                                else next.add(row.group.key);
                                return next;
                              });
                            }}
                          />
                        ) : (
                          <ul
                            className="thumbs"
                            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
                          >
                            {row.items.map((image) => (
                              <li key={image.name}>
                                <Thumb
                                  image={image}
                                  selected={image.name === current?.name}
                                  onSelect={() => {
                                    setSelected(image.name);
                                  }}
                                />
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <p className="small faint">{res.thumbsNote}</p>
          </div>
          <div className="split-aside viewer-column">
            {current && (
              <Viewer
                key={current.name}
                image={current}
                onPrevious={() => {
                  step(-1);
                }}
                onNext={() => {
                  step(1);
                }}
              />
            )}
          </div>
        </section>
      )}

      <MissingTable />
      <Callout tone="info">{res.pythonWarning}</Callout>
    </>
  );
}
