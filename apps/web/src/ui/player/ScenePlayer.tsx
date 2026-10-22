import {
  applyStage,
  continueAt,
  EMPTY_STAGE,
  enterBlock,
  nextStop,
  type PlayBranch,
  type PlayChoice,
  type PlayStop,
  type ReaderLabel,
  type ReaderLine,
  type ScreenSize,
  type Stage,
} from '@phanes/core';
import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { workerQueries } from '../../worker/client';
import { useAssetUrl, useAssetUrls } from '../assets';
import { ChevronLeftIcon, ChevronRightIcon, PlayIcon } from '../components/icons';
import { useImageLookup } from '../components/thumbs';
import { formatLocation } from '../format';
import { useReport } from '../report';
import { t } from '../strings.fr';
import { parseRenpyText, plainText } from './text';

type SayLine = Extract<ReaderLine, { kind: 'say' }>;
type MenuLine = Extract<ReaderLine, { kind: 'menu' }>;
type BranchStop = Extract<PlayStop, { kind: 'branch' }>;

/** Where a `call` returns: the label and the line after the call. */
type Frame = { label: string; resume: number | null };

type View =
  | { kind: 'say'; line: SayLine; text: string }
  | { kind: 'menu'; line: MenuLine; choices: PlayChoice[] }
  | { kind: 'branch'; stop: BranchStop }
  | { kind: 'dynamic'; expression: string; call: boolean; resume: number | null }
  | { kind: 'missing'; target: string }
  | { kind: 'end' }
  | { kind: 'loop' };

/** Everything needed to show a stop, and to go back to it. */
type Snapshot = {
  id: number;
  at: ReaderLabel;
  /** Line of `at` where playing stopped. */
  index: number | null;
  view: View;
  stage: Stage;
  stack: Frame[];
  /** NVL page: lines shown together until `nvl clear`. */
  nvl: { line: SayLine; text: string }[];
  /** Voices and sounds started on the way to this stop. */
  sounds: string[];
};

type Cursor = Omit<Snapshot, 'id' | 'index' | 'view' | 'sounds'> & {
  from: number | null;
  /** Text of the previous line, continued by `extend`. */
  previous: string | null;
};

/** Label changes without a stop, at most, before giving up (`label a: jump a`). */
const MAX_HOPS = 500;

/** Horizontal and vertical alignment of Ren'Py's standard transforms (renpy/common/00definitions.rpy). */
const POSITIONS: Readonly<Record<string, readonly [number, number] | null>> = {
  left: [0, 1],
  right: [1, 1],
  center: [0.5, 1],
  default: [0.5, 1],
  truecenter: [0.5, 0.5],
  topleft: [0, 0],
  topright: [1, 0],
  top: [0.5, 0],
  offscreenleft: null,
  offscreenright: null,
};

function position(at: readonly string[]): readonly [number, number] | null {
  for (const name of at) {
    const known = POSITIONS[name.trim()];
    if (known !== undefined) return known;
  }
  const custom = at.join(' ');
  if (/left/i.test(custom)) return [0.15, 1];
  if (/right/i.test(custom)) return [0.85, 1];
  return [0.5, 1];
}

function isNvlClear(line: ReaderLine): boolean {
  return line.kind === 'other' && /^nvl\s+clear\b/.test(line.code);
}

function RenpyText({ text }: { text: string }) {
  return (
    <>
      {parseRenpyText(text).map((run, i) => {
        const classes = [
          run.bold && 'vn-b',
          run.italic && 'vn-i',
          run.underline && 'vn-u',
          run.strike && 'vn-s',
          run.variable && 'vn-var',
        ].filter(Boolean);
        return (
          <span
            key={i}
            className={classes.length > 0 ? classes.join(' ') : undefined}
            style={run.color ? { color: run.color } : undefined}
          >
            {run.text}
          </span>
        );
      })}
    </>
  );
}

/** Plays one sound once, while the stop that started it is shown. */
function OneShot({ path, volume }: { path: string; volume: boolean }) {
  const url = useAssetUrl(path, volume);
  return url ? <audio src={url} autoPlay /> : null;
}

function Music({ path, volume }: { path: string; volume: boolean }) {
  const url = useAssetUrl(path, volume);
  return url ? <audio src={url} autoPlay loop /> : null;
}

export function ScenePlayer({
  start,
  colors,
  audioPath,
  onRead,
}: {
  start: string;
  colors: ReadonlyMap<string, string>;
  audioPath: (file: string) => string | null;
  onRead: (label: string) => void;
}) {
  const p = t.reader.play;
  const r = useReport();
  const image = useImageLookup();
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [busy, setBusy] = useState(true);
  const [sound, setSound] = useState(true);
  const [history, setHistory] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [screen, setScreen] = useState<ScreenSize | null>(null);
  const [sizes, setSizes] = useState<ReadonlyMap<string, { w: number; h: number }>>(new Map());
  const [dynamicTarget, setDynamicTarget] = useState('');
  const pickId = useId();
  const root = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const labels = useRef(new Map<string, Promise<ReaderLabel | null>>());
  const nextId = useRef(0);
  const running = useRef(false);

  const fallthrough = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of r.graph?.edges ?? [])
      if (e.kind === 'fallthrough' && e.from !== null && !map.has(e.from)) map.set(e.from, e.to);
    return map;
  }, [r.graph]);
  const labelNames = useMemo(
    () => (r.graph?.nodes ?? []).map((n) => n.name).sort((a, b) => a.localeCompare(b)),
    [r.graph],
  );

  const load = useCallback((name: string) => {
    let pending = labels.current.get(name);
    if (!pending) {
      pending = workerQueries.readLabel(name);
      labels.current.set(name, pending);
    }
    return pending;
  }, []);

  /** Plays from the cursor up to the next stop, following jumps, calls and returns. */
  const run = useCallback(
    async (cursor: Cursor): Promise<Snapshot> => {
      let { at, from, stage, stack, nvl } = cursor;
      const sounds: string[] = [];
      const snapshot = (index: number | null, view: View): Snapshot => ({
        id: nextId.current++,
        at,
        index,
        view,
        stage,
        stack,
        nvl,
        sounds,
      });
      const enter = async (name: string): Promise<boolean> => {
        const next = await load(name);
        if (!next) return false;
        at = next;
        from = 0;
        return true;
      };
      for (let hops = 0; hops < MAX_HOPS; hops++) {
        const content = at.content;
        const { stop, passed } = nextStop(content, from);
        for (const line of passed) {
          stage = applyStage(stage, line);
          if (isNvlClear(line)) nvl = [];
          if (line.kind === 'audio' && line.channel !== 'music' && line.action !== 'stop') {
            const path = line.file ? audioPath(line.file) : null;
            if (path) sounds.push(path);
          }
        }
        switch (stop.kind) {
          case 'say': {
            const line = content[stop.index];
            if (line?.kind !== 'say') return snapshot(null, { kind: 'end' });
            stage = applyStage(stage, line);
            const text =
              line.extend && cursor.previous !== null ? cursor.previous + line.text : line.text;
            if (line.speaker?.kind === 'nvl')
              nvl = line.extend ? [...nvl.slice(0, -1), { line, text }] : [...nvl, { line, text }];
            return snapshot(stop.index, { kind: 'say', line, text });
          }
          case 'menu': {
            const line = content[stop.index];
            if (line?.kind !== 'menu') return snapshot(null, { kind: 'end' });
            return snapshot(stop.index, { kind: 'menu', line, choices: stop.choices });
          }
          case 'branch':
            return snapshot(stop.index, { kind: 'branch', stop });
          case 'jump':
          case 'call': {
            const line = content[stop.index];
            const resume = continueAt(content, stop.index);
            if (stop.target === null)
              return snapshot(stop.index, {
                kind: 'dynamic',
                expression: line && 'target' in line ? line.target : '',
                call: stop.kind === 'call',
                resume,
              });
            const caller = at.name;
            if (!(await enter(stop.target)))
              return snapshot(stop.index, { kind: 'missing', target: stop.target });
            if (stop.kind === 'call') stack = [...stack, { label: caller, resume }];
            break;
          }
          case 'end':
          case 'return': {
            // The end of a label runs into the next one in its file (storyGraph's fallthrough).
            const next = stop.kind === 'end' ? fallthrough.get(at.name) : undefined;
            if (next !== undefined) {
              if (!(await enter(next))) return snapshot(null, { kind: 'missing', target: next });
              break;
            }
            const frame = stack[stack.length - 1];
            if (!frame) return snapshot(null, { kind: 'end' });
            stack = stack.slice(0, -1);
            if (!(await enter(frame.label)))
              return snapshot(null, { kind: 'missing', target: frame.label });
            from = frame.resume;
            break;
          }
        }
      }
      return snapshot(null, { kind: 'loop' });
    },
    [audioPath, fallthrough, load],
  );

  /** Plays on from the current stop, to a cursor `make` derives from it. */
  const go = useCallback(
    (make: (current: Snapshot) => Cursor | null | Promise<Cursor | null>) => {
      const current = snapshots[snapshots.length - 1];
      if (running.current || !current) return;
      running.current = true;
      setBusy(true);
      void (async () => {
        try {
          const cursor = await make(current);
          if (!cursor) return;
          const next = await run(cursor);
          setSnapshots((list) => [...list, next]);
        } finally {
          running.current = false;
          setBusy(false);
        }
      })();
    },
    [run, snapshots],
  );

  const begin = useCallback(async (): Promise<Snapshot | null> => {
    const first = await load(start);
    if (!first) return null;
    return run({ at: first, from: 0, stage: EMPTY_STAGE, stack: [], nvl: [], previous: null });
  }, [load, run, start]);

  useEffect(() => {
    let active = true;
    running.current = true;
    void begin().then((first) => {
      running.current = false;
      if (!active) return;
      setBusy(false);
      setSnapshots(
        first
          ? [first]
          : [
              {
                id: nextId.current++,
                at: {
                  name: start,
                  file: '',
                  line: 0,
                  lines: 0,
                  previous: null,
                  next: null,
                  content: [],
                },
                index: null,
                view: { kind: 'missing', target: start },
                stage: EMPTY_STAGE,
                stack: [],
                nvl: [],
                sounds: [],
              },
            ],
      );
    });
    return () => {
      active = false;
    };
  }, [begin, start]);

  useEffect(() => {
    let active = true;
    void workerQueries.screenSize().then((size) => {
      if (active) setScreen(size);
    });
    const onChange = () => {
      setFullscreen(document.fullscreenElement === root.current);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      active = false;
      document.removeEventListener('fullscreenchange', onChange);
    };
  }, []);

  const current = snapshots[snapshots.length - 1];
  // Keeps the keyboard on the scene: at start, and when the clicked choice disappears.
  const currentId = current?.id;
  useEffect(() => {
    const active = document.activeElement;
    if (active === null || active === document.body || active.closest('.segmented'))
      screenRef.current?.focus({ preventScroll: true });
  }, [currentId]);

  const cursorAt = (s: Snapshot, index: number | null, previous: string | null = null): Cursor => ({
    at: s.at,
    from: index,
    stage: s.stage,
    stack: s.stack,
    nvl: s.nvl,
    previous,
  });

  const advance = () => {
    go((s) =>
      s.view.kind === 'say' && s.index !== null
        ? cursorAt(s, continueAt(s.at.content, s.index), s.view.text)
        : null,
    );
  };
  const choose = (index: number) => {
    go((s) => cursorAt(s, enterBlock(s.at.content, index)));
  };
  const skipBranch = () => {
    go((s) => (s.index === null ? null : cursorAt(s, continueAt(s.at.content, s.index))));
  };
  const jumpTo = (name: string) => {
    go(async (s) => {
      if (s.view.kind !== 'dynamic') return null;
      const target = await load(name);
      if (!target) return null;
      const stack = s.view.call
        ? [...s.stack, { label: s.at.name, resume: s.view.resume }]
        : s.stack;
      return { ...cursorAt(s, 0), at: target, stack };
    });
  };
  const back = () => {
    if (running.current) return;
    setSnapshots((list) => (list.length > 1 ? list.slice(0, -1) : list));
  };
  const restart = () => {
    if (running.current) return;
    setSnapshots((list) => list.slice(0, 1));
  };
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void root.current?.requestFullscreen();
  };

  const options: (() => void)[] =
    current?.view.kind === 'menu'
      ? current.view.choices.map((c) => () => {
          choose(c.index);
        })
      : current?.view.kind === 'branch'
        ? [
            ...current.view.stop.branches.map((b) => () => {
              choose(b.index);
            }),
            ...(current.view.stop.hasElse ? [] : [skipBranch]),
          ]
        : [];

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const control = target.closest('button, select, input, a, audio') !== null;
    if ((event.key === ' ' || event.key === 'Enter' || event.key === 'ArrowRight') && !control) {
      event.preventDefault();
      advance();
    } else if ((event.key === 'ArrowLeft' || event.key === 'Backspace') && !control) {
      event.preventDefault();
      back();
    } else if (/^[1-9]$/.test(event.key)) {
      const option = options[Number(event.key) - 1];
      if (option) {
        event.preventDefault();
        option();
      }
    }
  };

  // Images on screen, and the side image of the speaker.
  const stage = current?.stage ?? EMPTY_STAGE;
  const background = stage.background ? image(stage.background) : undefined;
  const sprites = stage.shown.map((s) => ({ ...s, asset: image(s.image) }));
  const say = current?.view.kind === 'say' ? current.view : null;
  const speakerTag = say?.line.speaker?.image ?? null;
  const shownName = speakerTag ? stage.shown.find((s) => s.tag === speakerTag)?.image : undefined;
  const side = speakerTag
    ? (image(`side ${shownName ?? speakerTag}`) ?? image(`side ${speakerTag}`))
    : undefined;
  const urls = useAssetUrls(
    [background?.file?.path, side?.file?.path, ...sprites.map((s) => s.asset?.file?.path)].filter(
      (x): x is string => !!x,
    ),
  );
  const backgroundUrl = background?.file ? urls.get(background.file.path) : undefined;
  const backgroundSize = background?.file ? sizes.get(background.file.path) : undefined;
  const reference = screen?.height ?? backgroundSize?.h ?? 1080;
  const ratio = screen ? screen.width / screen.height : 16 / 9;
  const remember = (path: string, img: HTMLImageElement) => {
    if (sizes.has(path)) return;
    setSizes((m) => new Map(m).set(path, { w: img.naturalWidth, h: img.naturalHeight }));
  };
  const musicPath = stage.music ? audioPath(stage.music) : null;
  const centered =
    say !== null && (say.line.speaker?.id === 'centered' || say.line.speaker?.id === 'vcentered');
  const nvlMode = say?.line.speaker?.kind === 'nvl';

  const color = (id: string | undefined, own: string | null | undefined) =>
    own ?? (id ? colors.get(id) : undefined);
  const nameBox = (line: SayLine): ReactNode =>
    line.speaker?.name ? (
      <span className="vn-name" style={{ color: color(line.speaker.id, line.speaker.color) }}>
        <RenpyText text={line.speaker.name} />
      </span>
    ) : null;
  const sourceLine = current && current.index !== null ? current.at.content[current.index] : null;
  // The history, as in Ren'Py: an `extend` completes the line before it.
  const says: { line: SayLine; text: string }[] = [];
  for (const s of snapshots) {
    if (s.view.kind !== 'say') continue;
    if (s.view.line.extend && says.length > 0) says[says.length - 1] = s.view;
    else says.push(s.view);
  }

  return (
    <div
      ref={root}
      className={fullscreen ? 'vn vn-fullscreen' : 'vn'}
      style={{ '--vn-ratio': ratio } as CSSProperties}
      onKeyDown={onKeyDown}
      data-testid="player"
    >
      <div
        ref={screenRef}
        className="vn-screen"
        role="group"
        aria-label={p.screen}
        tabIndex={0}
        style={{ aspectRatio: `${ratio}` }}
        onClick={(e) => {
          if (e.target === e.currentTarget || (e.target as HTMLElement).closest('.vn-clickable'))
            advance();
        }}
      >
        <div className="vn-layer vn-clickable">
          {background && backgroundUrl ? (
            <img
              key={background.name}
              className="vn-bg"
              src={backgroundUrl}
              alt=""
              onLoad={(e) => {
                if (background.file) remember(background.file.path, e.currentTarget);
              }}
            />
          ) : stage.background ? (
            <span key={stage.background} className="vn-bg-name mono">
              {stage.background}
            </span>
          ) : null}
          {sprites.map((s) => {
            const pos = position(s.at);
            if (!pos) return null;
            const path = s.asset?.file?.path;
            const url = path ? urls.get(path) : undefined;
            const size = path ? sizes.get(path) : undefined;
            const height = size ? Math.min(1, Math.max(0.05, size.h / reference)) : null;
            const style = {
              left: `${pos[0] * 100}%`,
              transform: `translate(${-pos[0] * 100}%, ${pos[1] === 1 ? 0 : -pos[1] * 100}%)`,
              ...(pos[1] === 1 ? { bottom: 0 } : { top: `${pos[1] * 100}%` }),
              height: height === null ? '100%' : `${height * 100}%`,
            };
            return url && path ? (
              <img
                key={s.tag}
                className={size ? 'vn-sprite' : 'vn-sprite vn-loading'}
                src={url}
                alt=""
                style={style}
                onLoad={(e) => {
                  remember(path, e.currentTarget);
                }}
              />
            ) : (
              <span
                key={s.tag}
                className="vn-sprite-name mono"
                style={{ left: `${pos[0] * 100}%`, transform: `translateX(${-pos[0] * 100}%)` }}
              >
                {s.image}
              </span>
            );
          })}
        </div>

        {say && centered && (
          <div className="vn-centered vn-clickable" aria-live="polite">
            <p>
              <RenpyText text={say.text} />
            </p>
          </div>
        )}
        {say && nvlMode && current && (
          <div className="vn-nvl vn-clickable" aria-live="polite">
            {current.nvl.map(({ line, text }, i) => (
              <p key={i}>
                {nameBox(line)}
                <RenpyText text={text} />
              </p>
            ))}
          </div>
        )}
        {say && !centered && !nvlMode && (
          <div className="vn-textbox vn-clickable" aria-live="polite">
            {side?.file && urls.get(side.file.path) && (
              <img className="vn-side" src={urls.get(side.file.path)} alt="" />
            )}
            <div className="vn-say">
              {nameBox(say.line)}
              <p className="vn-text">
                <RenpyText text={say.text} />
                <span className="vn-caret" aria-hidden="true">
                  ▼
                </span>
              </p>
            </div>
          </div>
        )}

        {current?.view.kind === 'menu' && (
          <div className="vn-overlay">
            {current.view.line.prompt && (
              <p className="vn-prompt">
                {current.view.line.prompt.speaker?.name && (
                  <b>
                    <RenpyText text={current.view.line.prompt.speaker.name} />{' '}
                  </b>
                )}
                <RenpyText text={current.view.line.prompt.text} />
              </p>
            )}
            {current.view.choices.map((c, i) => (
              <button
                key={`${c.index}`}
                type="button"
                className="vn-choice"
                onClick={() => {
                  choose(c.index);
                }}
              >
                <span className="vn-key mono">{i + 1}</span>
                <span>
                  <RenpyText text={c.text} />
                </span>
                {c.condition && (
                  <code className="code-chip">
                    {t.reader.if} {c.condition}
                  </code>
                )}
              </button>
            ))}
          </div>
        )}

        {current?.view.kind === 'branch' && (
          <div className="vn-overlay vn-branch">
            <p className="vn-overlay-title">{p.branchTitle}</p>
            <p className="vn-overlay-note">{p.branchNote}</p>
            {current.view.stop.branches.map((b: PlayBranch, i) => (
              <button
                key={b.index}
                type="button"
                className="vn-choice"
                onClick={() => {
                  choose(b.index);
                }}
              >
                <span className="vn-key mono">{i + 1}</span>
                {b.keyword === 'while' ? (
                  <span>{p.whileEnter}</span>
                ) : (
                  <span>{p.keywords[b.keyword]}</span>
                )}
                {b.condition && <code className="code-chip">{b.condition}</code>}
              </button>
            ))}
            {!current.view.stop.hasElse && (
              <button type="button" className="vn-choice" onClick={skipBranch}>
                <span className="vn-key mono">{current.view.stop.branches.length + 1}</span>
                <span>
                  {current.view.stop.branches[0]?.keyword === 'while' ? p.whileSkip : p.noBranch}
                </span>
              </button>
            )}
          </div>
        )}

        {current?.view.kind === 'dynamic' && (
          <div className="vn-overlay vn-branch">
            <p className="vn-overlay-title">{p.dynamicTitle}</p>
            <code className="code-chip">
              {current.view.call ? 'call' : 'jump'} expression {current.view.expression}
            </code>
            <p className="vn-overlay-note">{p.dynamicNote}</p>
            <form
              className="vn-pick"
              onSubmit={(e) => {
                e.preventDefault();
                const name = dynamicTarget || labelNames[0];
                if (name) jumpTo(name);
              }}
            >
              <label htmlFor={pickId}>{p.dynamicPick}</label>
              <select
                id={pickId}
                value={dynamicTarget || (labelNames[0] ?? '')}
                onChange={(e) => {
                  setDynamicTarget(e.currentTarget.value);
                }}
              >
                {labelNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn btn-small">
                {p.go}
              </button>
            </form>
          </div>
        )}

        {(current?.view.kind === 'missing' ||
          current?.view.kind === 'end' ||
          current?.view.kind === 'loop') && (
          <div className="vn-overlay">
            <p className="vn-overlay-title">
              {current.view.kind === 'end'
                ? p.end
                : current.view.kind === 'loop'
                  ? p.loop
                  : p.missing(current.view.target)}
            </p>
            {current.view.kind === 'end' && <p className="vn-overlay-note">{p.endNote}</p>}
            <div className="vn-overlay-actions">
              <button type="button" className="btn btn-small" onClick={restart}>
                {p.restart}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={() => {
                  onRead(current.at.name);
                }}
              >
                {p.backToReading}
              </button>
            </div>
          </div>
        )}

        {!current && <p className="vn-loading">{p.loading}</p>}
      </div>

      {musicPath && <Music key={musicPath} path={musicPath} volume={sound} />}
      {sound &&
        current?.sounds.map((path, i) => (
          <OneShot key={`${current.id}:${i}`} path={path} volume={sound} />
        ))}

      <div className="vn-controls" role="toolbar" aria-label={p.controls}>
        <button
          type="button"
          className="btn btn-secondary btn-small"
          onClick={restart}
          disabled={busy || snapshots.length <= 1}
        >
          {p.restart}
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-small"
          onClick={back}
          disabled={busy || snapshots.length <= 1}
        >
          <ChevronLeftIcon size={14} />
          {p.back}
        </button>
        <button
          type="button"
          className="btn btn-small"
          onClick={advance}
          disabled={busy || current?.view.kind !== 'say'}
        >
          {p.next}
          <ChevronRightIcon size={14} />
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-small"
          aria-pressed={sound}
          onClick={() => {
            setSound(!sound);
          }}
        >
          <PlayIcon size={12} />
          {p.sound}
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-small"
          aria-pressed={history}
          onClick={() => {
            setHistory(!history);
          }}
        >
          {p.history}
        </button>
        <button type="button" className="btn btn-secondary btn-small" onClick={toggleFullscreen}>
          {fullscreen ? p.exitFullscreen : p.fullscreen}
        </button>
        {current && (
          <span className="vn-position small muted">
            <span className="mono">{current.at.name}</span>
            {sourceLine && current.at.file && (
              <span className="mono">
                {' '}
                · {formatLocation({ file: current.at.file, line: sourceLine.line })}
              </span>
            )}
            {current.stack.length > 0 && <span> · {p.calls(current.stack.length)}</span>}{' '}
            <button
              type="button"
              className="link-button"
              onClick={() => {
                onRead(current.at.name);
              }}
            >
              {p.seeLine}
            </button>
          </span>
        )}
      </div>
      <p className="small faint">{p.keys}</p>

      {history && (
        <section className="card card-pad vn-history" aria-label={p.history}>
          {says.length === 0 ? (
            <p className="small faint">{p.historyEmpty}</p>
          ) : (
            <ol className="list">
              {says.map((v, i) => (
                <li key={i} className="vn-history-line">
                  <span
                    className="vn-history-name"
                    style={{ color: color(v.line.speaker?.id, v.line.speaker?.color) }}
                  >
                    {v.line.speaker?.name ? plainText(v.line.speaker.name) : t.reader.narrator}
                  </span>
                  <span>
                    <RenpyText text={v.text} />
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
      <p className="small faint">{p.note}</p>
    </div>
  );
}
