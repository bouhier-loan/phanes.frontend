import type {
  AssetFile,
  AssetSite,
  AudioAsset,
  ImageAsset,
  ImageCategory,
  VideoAsset,
} from '@phanes/core';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { mediaType } from '../../adapters/media-type';
import { useAssetUrl } from '../assets';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  FilmIcon,
  ImageIcon,
  MusicIcon,
  PlayIcon,
} from '../components/icons';
import { Callout, ChipGroup, PageHeader, StatCard } from '../components/ui';
import { basename, formatBytes, formatLocation, formatNumber } from '../format';
import { useReport } from '../report';
import { href } from '../route';
import { t } from '../strings.fr';

type Tab = 'images' | 'audio' | 'video';
const GALLERY = 60;
const NEVER = 20;

function fileLabel(file: AssetFile): string {
  return file.archive ? `${basename(file.archive)} › ${file.gamePath}` : file.gamePath;
}

function SiteList({ sites }: { sites: readonly AssetSite[] }) {
  return (
    <ul className="list">
      {sites.map((s, i) => (
        <li key={`${s.loc.file}:${s.loc.line}:${i}`} className="site">
          <code>{s.code}</code>
          <span>
            {formatLocation(s.loc)}
            {s.label && (
              <>
                {' · '}
                <a href={href('lecteur', s.label)}>{s.label}</a>
              </>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** A thumbnail decoded only once scrolled into view. */
function Thumb({
  image,
  selected,
  onSelect,
}: {
  image: ImageAsset;
  selected: boolean;
  onSelect: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || visible) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setVisible(true);
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [visible]);
  const url = useAssetUrl(image.file?.path ?? null, visible);
  return (
    <li>
      <button ref={ref} type="button" className="thumb" aria-pressed={selected} onClick={onSelect}>
        <span className="thumb-frame" aria-hidden="true">
          {url ? <img src={url} alt="" loading="lazy" decoding="async" /> : <ImageIcon size={22} />}
        </span>
        <span className="mono thumb-name">{image.name}</span>
        {image.displays.length === 0 && (
          <span className="tag tag-amber">{t.resources.neverShown}</span>
        )}
      </button>
    </li>
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
            <SiteList sites={image.displays.slice(0, 8)} />
          </dd>
        </div>
      </dl>
      <p className="small faint">{res.localNote}</p>
    </div>
  );
}

function Images({ focus }: { focus: string | null }) {
  const { assets } = useReport();
  const res = t.resources;
  const [category, setCategory] = useState<ImageCategory | 'all'>('all');
  const [selected, setSelected] = useState<string | null>(focus);
  const [shown, setShown] = useState(GALLERY);
  const [sort, setSort] = useState<'size' | 'name' | 'folder'>('size');
  const [neverShown, setNeverShown] = useState(NEVER);
  const sortId = useId();
  const images = useMemo(() => assets?.images.entries ?? [], [assets]);
  const list = useMemo(
    () => images.filter((i) => category === 'all' || i.category === category),
    [images, category],
  );
  const never = useMemo(() => {
    const out = images.filter((i) => i.displays.length === 0);
    return out.sort((a, b) =>
      sort === 'size'
        ? (b.file?.size ?? 0) - (a.file?.size ?? 0)
        : sort === 'name'
          ? a.name.localeCompare(b.name)
          : (a.file?.gamePath ?? '').localeCompare(b.file?.gamePath ?? ''),
    );
  }, [images, sort]);
  if (!assets) return <p className="empty">{t.unavailable}</p>;
  const totals = assets.images.totals;
  const current =
    list.find((i) => i.name === selected) ?? images.find((i) => i.name === selected) ?? list[0];
  const step = (delta: number) => {
    if (!current || list.length === 0) return;
    const index = list.indexOf(current);
    const next = list[(index + delta + list.length) % list.length];
    if (next) setSelected(next.name);
  };
  const count = (c: ImageCategory) => images.filter((i) => i.category === c).length;
  const neverBytes = never.reduce((n, i) => n + (i.file?.size ?? 0), 0);
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
          <div className="card card-pad split-main">
            <h2 id="titre-galerie">{res.gallery}</h2>
            <ChipGroup
              label={res.categoryLabel}
              value={category}
              onChange={(c) => {
                setCategory(c);
                setShown(GALLERY);
              }}
              options={[
                { value: 'all', label: res.categories.all, count: images.length },
                ...(['background', 'sprite', 'cg', 'other'] as const)
                  .map((c) => ({ value: c, label: res.categories[c], count: count(c) }))
                  .filter((o) => o.count > 0),
              ]}
            />
            <ul className="thumbs" data-testid="gallery">
              {list.slice(0, shown).map((image) => (
                <Thumb
                  key={image.name}
                  image={image}
                  selected={image.name === current?.name}
                  onSelect={() => {
                    setSelected(image.name);
                  }}
                />
              ))}
            </ul>
            {list.length > shown && (
              <div className="more">
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  onClick={() => {
                    setShown(shown + GALLERY);
                  }}
                >
                  {t.more(Math.min(GALLERY, list.length - shown))}
                </button>
              </div>
            )}
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

      {assets.images.missing.length > 0 && (
        <section aria-labelledby="titre-manquantes" className="card">
          <h2 id="titre-manquantes" className="card-heading">
            {res.missingTitle}{' '}
            <span className="faint">· {formatNumber(assets.images.missing.length)}</span>
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
                {assets.images.missing.map((m, i) => (
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
      )}

      {never.length > 0 && (
        <section aria-labelledby="titre-inutilisees" className="card">
          <div className="card-heading card-title-row">
            <h2 id="titre-inutilisees">
              {res.neverTitle} <span className="faint">· {formatNumber(never.length)}</span>
            </h2>
            <div className="field">
              <label htmlFor={sortId}>{res.sortLabel}</label>
              <select
                id={sortId}
                className="select"
                value={sort}
                onChange={(e) => {
                  setSort(e.currentTarget.value as typeof sort);
                }}
              >
                <option value="size">{res.sort.size}</option>
                <option value="name">{res.sort.name}</option>
                <option value="folder">{res.sort.folder}</option>
              </select>
            </div>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">{res.neverColumns.image}</th>
                  <th scope="col">{res.neverColumns.declaration}</th>
                  <th scope="col">{res.neverColumns.file}</th>
                  <th scope="col" className="right">
                    {res.neverColumns.size}
                  </th>
                </tr>
              </thead>
              <tbody>
                {never.slice(0, neverShown).map((image) => (
                  <tr key={image.name}>
                    <td className="mono">{image.name}</td>
                    <td className="mono muted">
                      {image.declaration === 'automatic'
                        ? res.automaticShort
                        : image.loc
                          ? formatLocation(image.loc)
                          : ''}
                    </td>
                    <td className="mono muted">{image.file ? fileLabel(image.file) : '—'}</td>
                    <td className="right mono num">
                      {image.file ? formatBytes(image.file.size) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {never.length > neverShown && (
            <div className="more card-foot">
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={() => {
                  setNeverShown(neverShown + NEVER);
                }}
              >
                {t.more(Math.min(NEVER, never.length - neverShown))}
              </button>
            </div>
          )}
        </section>
      )}

      <Callout tone="info">{res.pythonWarning}</Callout>
    </>
  );
}

function AudioRow({ asset }: { asset: AudioAsset }) {
  const res = t.resources;
  const [play, setPlay] = useState(false);
  const url = useAssetUrl(asset.file.path, play);
  return (
    <li className="audio-row">
      <div className="audio-main">
        <MusicIcon />
        <span className="mono">{asset.file.gamePath}</span>
        <span className="mono small faint">{formatBytes(asset.file.size)}</span>
        {asset.plays.length === 0 ? (
          <span className="tag tag-amber">{res.neverPlayed}</span>
        ) : (
          <span className="small muted">{res.playedBy(asset.plays.length)}</span>
        )}
        {!play && (
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={() => {
              setPlay(true);
            }}
            aria-label={res.listen(basename(asset.file.gamePath))}
          >
            <PlayIcon size={14} />
            {t.reader.listenShort}
          </button>
        )}
      </div>
      {play && url && <audio controls autoPlay src={url} className="audio-player" />}
      {asset.plays.length > 0 && <SiteList sites={asset.plays.slice(0, 3)} />}
    </li>
  );
}

function Audio() {
  const { assets } = useReport();
  const res = t.resources;
  if (!assets) return <p className="empty">{t.unavailable}</p>;
  const a = assets.audio;
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
      {a.files.length === 0 ? (
        <p className="empty">{res.noAudio}</p>
      ) : (
        <section aria-labelledby="titre-sons" className="card card-pad">
          <h2 id="titre-sons">{res.audioList}</h2>
          <ul className="audio-list" data-testid="audio">
            {a.files.map((asset) => (
              <AudioRow key={asset.file.path} asset={asset} />
            ))}
          </ul>
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

function VideoPlayer({ video }: { video: VideoAsset }) {
  const res = t.resources;
  const url = useAssetUrl(video.file.path);
  const [meta, setMeta] = useState<{ w: number; h: number; duration: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const type = mediaType(video.file.gamePath);
  const supported =
    typeof document !== 'undefined' &&
    type !== '' &&
    document.createElement('video').canPlayType(type) !== '';
  const playable = supported && !failed;
  const duration = meta
    ? `${Math.floor(meta.duration / 60)}:${String(Math.round(meta.duration % 60)).padStart(2, '0')}`
    : null;
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

function Video() {
  const { assets } = useReport();
  const res = t.resources;
  const [selected, setSelected] = useState<string | null>(null);
  if (!assets) return <p className="empty">{t.unavailable}</p>;
  const videos = assets.video.files;
  const current = videos.find((v) => v.file.path === selected) ?? videos[0];
  const playableCount = videos.filter((v) => {
    const type = mediaType(v.file.gamePath);
    return type !== '' && document.createElement('video').canPlayType(type) !== '';
  }).length;
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
            <ul className="list">
              {videos.map((v) => (
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

export function ResourcesPage({ tab: param }: { tab: string | null }) {
  const r = useReport();
  const res = t.resources;
  const [head, focus = null] = (param ?? 'images').split(/:(.*)/s);
  const tab: Tab = head === 'audio' || head === 'video' ? head : 'images';
  return (
    <>
      <PageHeader
        crumbs={t.crumbs(r.title, t.groups.resources)}
        title={t.sections.ressources}
        lede={res.lede[tab]}
      >
        <nav aria-label={res.tabsLabel} className="chips">
          {(['images', 'audio', 'video'] as const).map((k) => (
            <a
              key={k}
              href={href('ressources', k)}
              className="chip"
              aria-current={k === tab ? 'page' : undefined}
            >
              {res.tabs[k]}
            </a>
          ))}
        </nav>
      </PageHeader>
      {tab === 'images' && <Images key={focus ?? ''} focus={focus} />}
      {tab === 'audio' && <Audio />}
      {tab === 'video' && <Video />}
    </>
  );
}
