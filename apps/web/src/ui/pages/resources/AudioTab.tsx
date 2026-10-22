import type { AudioAsset } from '@phanes/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { mediaType } from '../../../adapters/media-type';
import { useAssetUrl } from '../../assets';
import { MusicIcon } from '../../components/icons';
import { ChipGroup, SearchField, Select, StatCard } from '../../components/ui';
import { basename, formatBytes, formatMediaTime, formatNumber } from '../../format';
import { useReport } from '../../report';
import {
  type AssetSort,
  type AudioStatus,
  filterAudio,
  folderOf,
  groupBy,
  listRows,
  sortAudio,
} from '../../sections/asset-list';
import { t } from '../../strings.fr';
import { fileLabel, GroupHeader, SiteList } from './shared';

const ROW_HEIGHT = 52;
const HEADER_HEIGHT = 44;

function AudioDetail({ asset }: { asset: AudioAsset }) {
  const res = t.resources;
  const url = useAssetUrl(asset.file.path);
  const [duration, setDuration] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const type = mediaType(asset.file.gamePath);
  const playable =
    type !== '' && document.createElement('audio').canPlayType(type) !== '' && !failed;
  return (
    <section aria-labelledby="titre-son" className="card card-pad">
      <h2 id="titre-son" className="mono selection-name">
        {basename(asset.file.gamePath)}
      </h2>
      {playable ? (
        url && (
          <audio
            className="audio-player"
            controls
            preload="metadata"
            src={url}
            onLoadedMetadata={(e) => {
              setDuration(e.currentTarget.duration);
            }}
            onError={() => {
              setFailed(true);
            }}
          />
        )
      ) : (
        <p className="small faint">{res.notPlayableNote}</p>
      )}
      <dl className="kv">
        <div>
          <dt>{res.file}</dt>
          <dd className="mono">{fileLabel(asset.file)}</dd>
        </div>
        <div>
          <dt>{res.format}</dt>
          <dd className="mono">
            {[
              asset.file.gamePath.slice(asset.file.gamePath.lastIndexOf('.') + 1).toUpperCase(),
              duration === null ? null : formatMediaTime(duration),
              formatBytes(asset.file.size),
            ]
              .filter(Boolean)
              .join(' · ')}
          </dd>
        </div>
        <div>
          <dt>{asset.plays.length > 0 ? res.playedIn(asset.plays.length) : res.neverPlayed}</dt>
          <dd>
            {asset.plays.length > 0 ? (
              <SiteList sites={asset.plays} limit={12} />
            ) : (
              <span className="small faint">{res.neverPlayedNote}</span>
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}

/** The game's sounds; `focus` is the VFS path of a file to select. */
export function AudioTab({ focus }: { focus: string | null }) {
  const { assets } = useReport();
  const res = t.resources;
  const groupId = useId();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<AudioStatus>('all');
  const [channel, setChannel] = useState('all');
  const [sort, setSort] = useState<AssetSort>('name');
  const [grouped, setGrouped] = useState(true);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(focus);
  const scroller = useRef<HTMLDivElement>(null);

  const files = useMemo(() => assets?.audio.files ?? [], [assets]);
  const channels = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of files)
      for (const c of new Set(a.plays.map((p) => p.channel)))
        counts.set(c, (counts.get(c) ?? 0) + 1);
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [files]);
  const list = useMemo(
    () => sortAudio(filterAudio(files, { query, status, channel }), sort),
    [files, query, status, channel, sort],
  );
  const groups = useMemo(
    () =>
      groupBy(
        grouped
          ? [...list].sort((a, b) =>
              folderOf(a.file.gamePath).localeCompare(folderOf(b.file.gamePath)),
            )
          : list,
        (a) => (grouped ? folderOf(a.file.gamePath) : ''),
        (a) => a.file.size,
      ),
    [list, grouped],
  );
  const rows = useMemo(
    () => listRows(groups, 1, { grouped, collapsed }),
    [groups, grouped, collapsed],
  );
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: (i) => (rows[i]?.type === 'header' ? HEADER_HEIGHT : ROW_HEIGHT),
    overscan: 12,
  });
  const current = files.find((a) => a.file.path === selected) ?? groups.flatMap((g) => g.items)[0];

  const scrolled = useRef(false);
  useEffect(() => {
    if (scrolled.current || focus === null) return;
    scrolled.current = true;
    const index = rows.findIndex(
      (r) => r.type === 'items' && r.items.some((a) => a.file.path === focus),
    );
    if (index > 0) virtualizer.scrollToIndex(index, { align: 'center' });
  }, [focus, rows, virtualizer]);

  if (!assets) return <p className="empty">{t.unavailable}</p>;
  const a = assets.audio;
  const listBytes = list.reduce((n, x) => n + x.file.size, 0);
  return (
    <>
      <section aria-label={res.summaryLabel} className="stat-grid">
        <StatCard label={res.audioFiles} value={formatNumber(a.totals.files)} />
        <StatCard label={res.audioPlayed} value={formatNumber(a.totals.played)} />
        <StatCard label={res.audioNever} value={formatNumber(a.totals.neverPlayed)} />
        <StatCard
          label={res.audioMissing}
          value={formatNumber(a.totals.missing)}
          detail={res.audioMissingNote}
        />
      </section>
      {files.length === 0 ? (
        <p className="empty">{res.noAudio}</p>
      ) : (
        <section aria-labelledby="titre-sons" className="split gallery-split">
          <div className="card card-pad split-main asset-main">
            <div className="card-title-row">
              <h2 id="titre-sons">{res.audioList}</h2>
              <span className="small muted">
                {res.shown(list.length, files.length, formatBytes(listBytes))}
              </span>
            </div>
            <div className="asset-toolbar">
              <SearchField label={res.search} value={query} onChange={setQuery} />
              <Select
                label={res.statusLabel}
                value={status}
                onChange={setStatus}
                options={(Object.keys(res.audioStatus) as AudioStatus[]).map((v) => ({
                  value: v,
                  label: res.audioStatus[v],
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
                <label htmlFor={groupId}>{res.groupByFolder}</label>
              </div>
            </div>
            {channels.length > 0 && (
              <ChipGroup
                label={res.channelLabel}
                value={channel}
                onChange={setChannel}
                options={[
                  { value: 'all', label: res.allChannels },
                  ...channels.map(([c, n]) => ({ value: c, label: res.channel(c), count: n })),
                ]}
              />
            )}
            <div className="asset-scroller asset-scroller-list" ref={scroller} data-testid="audio">
              {list.length === 0 ? (
                <div className="asset-empty">
                  <p className="muted">{res.noMatch}</p>
                </div>
              ) : (
                <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
                  {virtualizer.getVirtualItems().map((item) => {
                    const row = rows[item.index];
                    if (!row) return null;
                    const style = {
                      transform: `translateY(${item.start}px)`,
                      height: `${row.type === 'header' ? HEADER_HEIGHT : ROW_HEIGHT}px`,
                    };
                    if (row.type === 'header')
                      return (
                        <div key={row.key} className="asset-row" style={style}>
                          <GroupHeader
                            name={row.group.key || res.rootFolder}
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
                        </div>
                      );
                    const asset = row.items[0];
                    if (!asset) return null;
                    return (
                      <div key={row.key} className="asset-row" style={style}>
                        <button
                          type="button"
                          className="audio-item"
                          aria-pressed={asset === current}
                          onClick={() => {
                            setSelected(asset.file.path);
                          }}
                        >
                          <MusicIcon size={16} />
                          <span className="mono audio-name">
                            {grouped ? basename(asset.file.gamePath) : asset.file.gamePath}
                          </span>
                          {asset.plays.length === 0 ? (
                            <span className="tag tag-amber">{res.neverPlayed}</span>
                          ) : (
                            <span className="small muted">{res.playedBy(asset.plays.length)}</span>
                          )}
                          <span className="mono small faint">{formatBytes(asset.file.size)}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <div className="split-aside viewer-column">
            {current ? (
              <AudioDetail key={current.file.path} asset={current} />
            ) : (
              <p className="card card-pad muted">{res.pickAudio}</p>
            )}
          </div>
        </section>
      )}
      {a.missing.length > 0 && (
        <section aria-labelledby="titre-sons-manquants" className="card card-pad">
          <h2 id="titre-sons-manquants">{res.missingAudio}</h2>
          <SiteList sites={a.missing} />
        </section>
      )}
    </>
  );
}
