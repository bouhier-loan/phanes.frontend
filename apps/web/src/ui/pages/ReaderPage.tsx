import {
  type DialogueLine,
  type ImageAsset,
  type ReaderLabel,
  type ReaderLine,
  type ScriptOutline,
  stageAt,
} from '@phanes/core';
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { workerQueries } from '../../worker/client';
import { useAssetUrl } from '../assets';
import { ChevronDownIcon, ChevronRightIcon, PlayIcon } from '../components/icons';
import { LazyThumb, useImageLookup } from '../components/thumbs';
import { PageHeader, SearchField } from '../components/ui';
import { basename, formatLocation } from '../format';
import { useReport } from '../report';
import { href, navigate } from '../route';
import { ScenePlayer } from '../player/ScenePlayer';
import { t } from '../strings.fr';
import { characterColor } from './characters-shared';

type Mode = 'read' | 'source' | 'play';

const FOLD_AFTER = 150;
const HEAD = 80;
const TAIL = 40;

function Listen({ path, name }: { path: string; name: string }) {
  const [play, setPlay] = useState(false);
  const url = useAssetUrl(path, play);
  if (play && url) return <audio controls autoPlay src={url} className="audio-inline" />;
  return (
    <button
      type="button"
      className="mini-button"
      aria-label={t.reader.listen(name)}
      onClick={() => {
        setPlay(true);
      }}
    >
      <PlayIcon size={11} />
      {t.reader.listenShort}
    </button>
  );
}

function Outline({ outline, current }: { outline: ScriptOutline; current: string | null }) {
  const initial =
    outline.find((f) => f.labels.some((l) => l.name === current))?.file ?? outline[0]?.file;
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(initial ? [initial] : []));
  return (
    <nav aria-label={t.reader.nav} className="card reader-nav">
      {outline.map((f) => {
        const expanded = open.has(f.file);
        return (
          <div key={f.file}>
            <button
              type="button"
              className="reader-file mono"
              aria-expanded={expanded}
              onClick={() => {
                setOpen((s) => {
                  const next = new Set(s);
                  if (next.has(f.file)) next.delete(f.file);
                  else next.add(f.file);
                  return next;
                });
              }}
            >
              {expanded ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
              {f.file.replace(/^game\//, '')}
            </button>
            {expanded &&
              f.labels.map((l) => (
                <a
                  key={l.name}
                  href={href('lecteur', l.name)}
                  className="reader-label mono"
                  aria-current={l.name === current ? 'page' : undefined}
                >
                  {l.name}
                </a>
              ))}
          </div>
        );
      })}
    </nav>
  );
}

function Line({
  line,
  mode,
  staging,
  thumbs,
  colors,
  image,
  audioPath,
}: {
  line: ReaderLine;
  mode: Mode;
  staging: boolean;
  thumbs: boolean;
  colors: ReadonlyMap<string, string>;
  image: (name: string) => ImageAsset | undefined;
  audioPath: (file: string) => string | null;
}) {
  const indent = { paddingLeft: `${line.depth * 20}px` };
  if (mode === 'source')
    return (
      <li className="reader-line source">
        <span className="line-no">{line.line}</span>
        <code style={indent}>{line.code}</code>
      </li>
    );
  const isStaging =
    line.kind === 'scene' ||
    line.kind === 'show' ||
    line.kind === 'hide' ||
    line.kind === 'with' ||
    line.kind === 'audio';
  if (isStaging && !staging) return null;
  if (line.kind === 'say') {
    const name = line.speaker?.name ?? null;
    const color = line.speaker ? (line.speaker.color ?? colors.get(line.speaker.id)) : undefined;
    return (
      <li className="reader-line say">
        <span className="line-no">{line.line}</span>
        <span className="speaker" style={color ? { color } : undefined}>
          {name ?? ''}
        </span>
        <p style={indent}>{line.text}</p>
      </li>
    );
  }
  if (line.kind === 'menu')
    return (
      <li className="reader-line menu-line">
        <span className="line-no">{line.line}</span>
        <div className="reader-menu" style={indent}>
          <div>
            <code>menu</code>
            {line.prompt && (
              <span>
                <b>{line.prompt.speaker?.name ?? t.reader.narrator}</b> {line.prompt.text}
              </span>
            )}
          </div>
          <ul>
            {line.options.map((o, i) => (
              <li key={`${o.text}:${i}`}>
                <span>{o.text}</span>
                {o.condition && (
                  <code className="code-chip">
                    {t.reader.if} {o.condition}
                  </code>
                )}
                {o.targets.map((target) => (
                  <a
                    key={`${target.kind}:${target.target}`}
                    href={href('lecteur', target.target)}
                    className="mono small"
                  >
                    → {target.target}
                  </a>
                ))}
              </li>
            ))}
          </ul>
        </div>
      </li>
    );
  const img =
    (line.kind === 'scene' || line.kind === 'show') && !line.dynamic
      ? image(line.image)
      : undefined;
  const audioFile = line.kind === 'audio' ? line.file : null;
  const audio = audioFile ? audioPath(audioFile) : null;
  return (
    <li className={`reader-line code-line ${line.kind}`}>
      <span className="line-no">{line.line}</span>
      <span className="code-cell" style={indent}>
        {img && thumbs && (
          <a
            href={href('ressources', `images:${img.name}`)}
            aria-label={t.reader.viewImage(img.name)}
          >
            <LazyThumb path={img.file?.path ?? null} label={img.name} />
          </a>
        )}
        <code>{line.code}</code>
        {audio && audioFile && <Listen path={audio} name={basename(audioFile)} />}
        {(line.kind === 'jump' || line.kind === 'call') && line.resolved !== null && (
          <a href={href('lecteur', line.resolved)} className="small">
            {t.reader.open}
          </a>
        )}
      </span>
    </li>
  );
}

function Stage({
  content,
  image,
  audioPath,
}: {
  content: ReaderLine[];
  image: (name: string) => ImageAsset | undefined;
  audioPath: (file: string) => string | null;
}) {
  const r = t.reader;
  const index = content.findIndex((l) => l.kind === 'say');
  const at = index < 0 ? content.length - 1 : index;
  const stage = stageAt(content, at);
  const background = stage.background ? image(stage.background) : undefined;
  const url = useAssetUrl(background?.file?.path ?? null);
  if (!stage.background && stage.shown.length === 0 && !stage.music) return null;
  const line = content[at]?.line ?? 0;
  return (
    <div className="stage">
      <figure className="stage-figure">
        <div className="stage-frame" aria-hidden="true">
          {url && <img src={url} alt="" />}
          <span className="stage-bg mono">{stage.background}</span>
          <span className="stage-sprites">
            {stage.shown.map((s) => (
              <span key={s.tag} className="mono">
                {s.image}
              </span>
            ))}
          </span>
        </div>
        <figcaption className="small faint">{r.sceneCaption(line)}</figcaption>
      </figure>
      <div className="stage-info">
        <h3>{r.onScreen}</h3>
        <dl className="kv">
          {stage.background && (
            <div>
              <dt>{r.background}</dt>
              <dd>
                <a
                  href={href('ressources', `images:${background?.name ?? stage.background}`)}
                  className="mono"
                >
                  {stage.background}
                </a>
              </dd>
            </div>
          )}
          {stage.shown.length > 0 && (
            <div>
              <dt>{r.characters}</dt>
              <dd className="stage-list">
                {stage.shown.map((s) => (
                  <span key={s.tag}>
                    <span className="mono">{s.image}</span>
                    {s.at.length > 0 && <span className="faint"> · {s.at.join(', ')}</span>}
                  </span>
                ))}
              </dd>
            </div>
          )}
          {stage.music && (
            <div>
              <dt>{r.music}</dt>
              <dd>
                <span className="mono">{basename(stage.music)}</span>{' '}
                {audioPath(stage.music) && (
                  <Listen path={audioPath(stage.music) ?? ''} name={basename(stage.music)} />
                )}
              </dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}

function Results({ query, results }: { query: string; results: DialogueLine[] | null }) {
  const r = t.reader;
  if (results === null) return <p className="muted">{r.loading}</p>;
  if (results.length === 0) return <p className="muted">{r.noResults(query)}</p>;
  return (
    <section className="card card-pad" aria-live="polite">
      <h2>{r.results(results.length, query)}</h2>
      <ul className="list">
        {results.map((line, i) => (
          <li key={`${line.file}:${line.line}:${i}`} className="site">
            <span className="result-text">
              {line.speaker && <b>{line.speaker} </b>}
              {line.text}
            </span>
            <span>
              {formatLocation(line)}
              {line.label && (
                <>
                  {' · '}
                  <a href={href('lecteur', line.label)}>{line.label}</a>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ReaderPage({ label }: { label: string | null }) {
  const r = useReport();
  const rd = t.reader;
  const [outline, setOutline] = useState<ScriptOutline | null>(null);
  const [data, setData] = useState<{ name: string; label: ReaderLabel | null } | null>(null);
  const [mode, setMode] = useState<Mode>('read');
  const [staging, setStaging] = useState(true);
  const [thumbs, setThumbs] = useState(true);
  const [unfolded, setUnfolded] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DialogueLine[] | null>(null);
  const stagingId = useId();
  const thumbsId = useId();
  const image = useImageLookup();
  const audioPaths = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of r.assets?.audio.files ?? []) map.set(a.file.gamePath, a.file.path);
    return map;
  }, [r.assets]);
  const audioPath = useCallback(
    (file: string) => audioPaths.get(file) ?? audioPaths.get(`audio/${file}`) ?? null,
    [audioPaths],
  );
  // Ren'Py finds movies relative to game/, like the assets analysis (any case).
  const videoPaths = useMemo(() => {
    const map = new Map<string, string>();
    for (const v of r.assets?.video.files ?? []) {
      map.set(v.file.gamePath, v.file.path);
      if (!map.has(v.file.gamePath.toLowerCase()))
        map.set(v.file.gamePath.toLowerCase(), v.file.path);
    }
    return map;
  }, [r.assets]);
  const videoPath = useCallback(
    (file: string) => videoPaths.get(file) ?? videoPaths.get(file.toLowerCase()) ?? null,
    [videoPaths],
  );
  const colors = useMemo(
    () => new Map((r.characters?.characters ?? []).map((c, i) => [c.id, characterColor(c, i)])),
    [r.characters],
  );
  const current = label ?? r.graph?.entry ?? outline?.[0]?.labels[0]?.name ?? null;

  useEffect(() => {
    let active = true;
    void workerQueries.outline().then((o) => {
      if (active) setOutline(o);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!current) return;
    let active = true;
    void workerQueries.readLabel(current).then((result) => {
      if (active) setData({ name: current, label: result });
    });
    return () => {
      active = false;
    };
  }, [current]);

  const needle = query.trim();
  useEffect(() => {
    if (!needle) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void workerQueries.search(needle).then((found) => {
        if (active) setResults(found);
      });
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(timer);
      setResults(null);
    };
  }, [needle]);

  const content = data?.name === current ? (data.label?.content ?? []) : [];
  const folded = content.length > FOLD_AFTER && unfolded !== current;
  const visible = folded
    ? [...content.slice(0, HEAD), ...content.slice(content.length - TAIL)]
    : content;
  const hidden = folded ? content.slice(HEAD, content.length - TAIL) : [];
  const article = data?.name === current ? data.label : undefined;

  const renderLine = (line: ReaderLine, i: number) => (
    <Line
      key={i}
      line={line}
      mode={mode}
      staging={staging}
      thumbs={thumbs}
      colors={colors}
      image={image}
      audioPath={audioPath}
    />
  );

  return (
    <>
      <PageHeader
        crumbs={t.crumbs(r.title, t.groups.story)}
        title={t.sections.lecteur}
        lede={rd.lede}
      >
        <SearchField label={rd.search} value={query} onChange={setQuery} />
      </PageHeader>

      <div className="toolbar">
        <div role="group" aria-label={rd.modeLabel} className="segmented">
          {(['read', 'source', 'play'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => {
                setMode(m);
              }}
            >
              {rd.modes[m]}
            </button>
          ))}
        </div>
        {mode !== 'play' && (
          <div className="toolbar-checks">
            <div className="check">
              <input
                id={stagingId}
                type="checkbox"
                checked={staging}
                onChange={(e) => {
                  setStaging(e.currentTarget.checked);
                }}
              />
              <label htmlFor={stagingId}>{rd.staging}</label>
            </div>
            <div className="check">
              <input
                id={thumbsId}
                type="checkbox"
                checked={thumbs}
                onChange={(e) => {
                  setThumbs(e.currentTarget.checked);
                }}
              />
              <label htmlFor={thumbsId}>{rd.thumbs}</label>
            </div>
          </div>
        )}
      </div>

      <div className="split reader">
        <div className="reader-side">
          {outline ? (
            <Outline outline={outline} current={current} />
          ) : (
            <p className="muted">{rd.loading}</p>
          )}
        </div>
        <div className="reader-main">
          {needle ? (
            <Results query={needle} results={results} />
          ) : !current ? (
            <p className="muted">{rd.choose}</p>
          ) : article === undefined ? (
            <p className="muted">{rd.loading}</p>
          ) : article === null ? (
            <p className="muted">{rd.notFound(current)}</p>
          ) : mode === 'play' ? (
            <ScenePlayer
              key={current}
              start={current}
              colors={colors}
              audioPath={audioPath}
              videoPath={videoPath}
              onRead={(name) => {
                setMode('read');
                navigate('lecteur', name);
              }}
            />
          ) : (
            <article
              aria-labelledby="titre-label"
              className="card reader-article"
              data-testid="reader"
            >
              <header className="reader-head">
                <div>
                  <h2 id="titre-label" className="mono">
                    {article.name}
                  </h2>
                  <span className="mono small muted">
                    {rd.header(formatLocation(article), article.lines)}
                  </span>
                </div>
                <div className="reader-steps">
                  <button
                    type="button"
                    className="btn btn-outline btn-small"
                    onClick={() => {
                      setMode('play');
                    }}
                  >
                    <PlayIcon size={12} />
                    {rd.playFrom}
                  </button>
                  {article.previous && (
                    <a href={href('lecteur', article.previous)} className="mono small">
                      ‹ {article.previous}
                    </a>
                  )}
                  {article.next && (
                    <a href={href('lecteur', article.next)} className="mono small">
                      {article.next} ›
                    </a>
                  )}
                </div>
              </header>
              <p className="small faint reader-note">{rd.note}</p>
              {mode === 'read' && staging && thumbs && (
                <Stage content={content} image={image} audioPath={audioPath} />
              )}
              <ol className={mode === 'source' ? 'reader-lines source-lines' : 'reader-lines'}>
                {visible.slice(0, folded ? HEAD : visible.length).map(renderLine)}
                {folded && (
                  <li className="reader-line">
                    <span className="line-no" />
                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      onClick={() => {
                        setUnfolded(current);
                      }}
                    >
                      {rd.fold(
                        hidden[0]?.line ?? 0,
                        hidden[hidden.length - 1]?.line ?? 0,
                        hidden.filter((l) => l.kind === 'say').length,
                      )}
                    </button>
                  </li>
                )}
                {folded &&
                  visible.slice(HEAD).map((line, i) => renderLine(line, HEAD + hidden.length + i))}
              </ol>
            </article>
          )}
        </div>
      </div>
    </>
  );
}
