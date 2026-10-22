import type { VideoAsset } from '@phanes/core';
import { useState } from 'react';
import { canPlayVideo } from '../../../adapters/media-type';
import { useAssetUrl } from '../../assets';
import { FilmIcon } from '../../components/icons';
import { SearchField, Select, StatCard } from '../../components/ui';
import { basename, formatBytes, formatMediaTime, formatNumber } from '../../format';
import { useReport } from '../../report';
import { type AssetSort, filterVideo, sortVideo } from '../../sections/asset-list';
import { t } from '../../strings.fr';
import { SiteList } from './shared';

function VideoPlayer({ video }: { video: VideoAsset }) {
  const res = t.resources;
  const url = useAssetUrl(video.file.path);
  const [meta, setMeta] = useState<{ w: number; h: number; duration: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const playable = canPlayVideo(video.file.gamePath) && !failed;
  const duration = meta ? formatMediaTime(meta.duration) : null;
  return (
    <section aria-labelledby="titre-video" className="card card-pad split-main">
      <div className="card-title-row">
        <h2 id="titre-video" className="mono">
          {video.file.gamePath}
        </h2>
        <span className={playable ? 'tag tag-teal' : 'tag tag-red'}>
          {playable ? res.playableHere : res.notPlayableHere}
        </span>
      </div>
      {playable && url ? (
        <video
          className="video"
          controls
          preload="metadata"
          src={url}
          onLoadedMetadata={(e) => {
            setMeta({
              w: e.currentTarget.videoWidth,
              h: e.currentTarget.videoHeight,
              duration: e.currentTarget.duration,
            });
          }}
          onError={() => {
            setFailed(true);
          }}
        />
      ) : (
        <div className="video-placeholder">
          <FilmIcon size={30} />
          {!playable && <p className="small muted">{res.notPlayableNote}</p>}
        </div>
      )}
      <dl className="kv">
        <div>
          <dt>{res.container}</dt>
          <dd className="mono">
            {video.file.gamePath.slice(video.file.gamePath.lastIndexOf('.') + 1).toUpperCase()}
          </dd>
        </div>
        <div>
          <dt>{res.dimensions}</dt>
          <dd className="mono">
            {[
              meta && meta.w > 0 ? `${meta.w} × ${meta.h}` : null,
              duration,
              formatBytes(video.file.size),
            ]
              .filter(Boolean)
              .join(' · ')}
          </dd>
        </div>
        <div>
          <dt>{res.usedIn}</dt>
          <dd>
            {video.uses.length > 0 ? (
              <SiteList sites={video.uses} />
            ) : (
              <span className="faint">{res.notUsed}</span>
            )}
          </dd>
        </div>
      </dl>
      <p className="small faint">{res.streamNote}</p>
    </section>
  );
}

/** The game's videos; `focus` is the VFS path of a file to select. */
export function VideoTab({ focus }: { focus: string | null }) {
  const { assets } = useReport();
  const res = t.resources;
  const [selected, setSelected] = useState<string | null>(focus);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<AssetSort>('name');
  if (!assets) return <p className="empty">{t.unavailable}</p>;
  const videos = assets.video.files;
  const shown = sortVideo(filterVideo(videos, query), sort);
  const current = videos.find((v) => v.file.path === selected) ?? shown[0] ?? videos[0];
  const playableCount = videos.filter((v) => canPlayVideo(v.file.gamePath)).length;
  const bytes = videos.reduce((n, v) => n + v.file.size, 0);
  return (
    <>
      <section aria-label={res.summaryLabel} className="stat-grid">
        <StatCard
          label={res.videos}
          value={formatNumber(videos.length)}
          detail={res.totalBytes(formatBytes(bytes))}
        />
        <StatCard label={res.playable} value={formatNumber(playableCount)} />
        <StatCard label={res.notPlayable} value={formatNumber(videos.length - playableCount)} />
        <StatCard label={res.usedByScript} value={formatNumber(assets.video.totals.used)} />
      </section>
      {videos.length === 0 || !current ? (
        <p className="empty">{res.noVideo}</p>
      ) : (
        <div className="split">
          <VideoPlayer key={current.file.path} video={current} />
          <aside aria-labelledby="titre-liste" className="card card-pad split-aside">
            <h2 id="titre-liste">{res.videoList}</h2>
            <SearchField label={res.search} value={query} onChange={setQuery} />
            <Select
              label={res.sortLabel}
              value={sort}
              onChange={setSort}
              options={(['name', 'size', 'uses'] as const).map((v) => ({
                value: v,
                label: res.sort[v],
              }))}
            />
            {shown.length === 0 && <p className="small muted">{res.noMatch}</p>}
            <ul className="list">
              {shown.map((v) => (
                <li key={v.file.path}>
                  <button
                    type="button"
                    className="video-item"
                    aria-pressed={v === current}
                    onClick={() => {
                      setSelected(v.file.path);
                    }}
                  >
                    <span className="list-row">
                      <span className="mono">{basename(v.file.gamePath)}</span>
                      <span className="mono small faint">{formatBytes(v.file.size)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      )}
    </>
  );
}
