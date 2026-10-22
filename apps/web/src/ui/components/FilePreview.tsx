import type { InventoryEntry, ScriptOutline } from '@phanes/core';
import { useEffect, useRef, useState } from 'react';
import { mediaType } from '../../adapters/media-type';
import { workerQueries } from '../../worker/client';
import { useAssetUrl } from '../assets';
import { basename, formatBytes, formatMediaTime } from '../format';
import { href } from '../route';
import { t } from '../strings.fr';

const TEXT_BYTES = 64 * 1024;
const HEX_BYTES = 512;
const FONT_LIMIT = 10 * 1024 * 1024;

type Bytes = { bytes: Uint8Array; total: number } | 'error' | null;

/** The first `limit` bytes of a game file, read from a slice of its lazy Blob. */
function useHead(entry: InventoryEntry, limit: number): Bytes {
  const [head, setHead] = useState<Bytes>(null);
  useEffect(() => {
    let active = true;
    void workerQueries
      .openAsset(entry.path, entry.archive)
      .then(async (blob) => {
        if (!blob) throw new Error('unknown file');
        const bytes = new Uint8Array(await blob.slice(0, limit).arrayBuffer());
        if (active) setHead({ bytes, total: blob.size });
      })
      .catch(() => {
        if (active) setHead('error');
      });
    return () => {
      active = false;
      setHead(null);
    };
  }, [entry.path, entry.archive, limit]);
  return head;
}

/** NUL bytes do not occur in text files. */
function isBinary(bytes: Uint8Array): boolean {
  return bytes.subarray(0, 4096).includes(0);
}

function hexDump(bytes: Uint8Array): string {
  const rows: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 16) {
    const row = bytes.subarray(offset, offset + 16);
    const hex = [...row].map((b) => b.toString(16).padStart(2, '0')).join(' ');
    const ascii = [...row].map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.'));
    rows.push(`${offset.toString(16).padStart(8, '0')}  ${hex.padEnd(47)}  ${ascii.join('')}`);
  }
  return rows.join('\n');
}

function Hex({ bytes }: { bytes: Uint8Array }) {
  const shown = bytes.subarray(0, HEX_BYTES);
  return (
    <>
      <p className="small muted">{t.inventory.preview.binary(shown.length)}</p>
      <pre className="preview-hex mono">{hexDump(shown)}</pre>
    </>
  );
}

function TextOrHex({ entry }: { entry: InventoryEntry }) {
  const p = t.inventory.preview;
  const head = useHead(entry, TEXT_BYTES);
  if (head === null) return <p className="small faint">{p.loading}</p>;
  if (head === 'error') return <p className="small faint">{p.unavailable}</p>;
  if (isBinary(head.bytes)) return <Hex bytes={head.bytes} />;
  const text = new TextDecoder('utf-8').decode(head.bytes).replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  return (
    <>
      <div className="preview-text">
        <pre className="preview-gutter mono" aria-hidden="true">
          {lines.map((_, i) => i + 1).join('\n')}
        </pre>
        <pre className="preview-code mono">{text}</pre>
      </div>
      {head.total > head.bytes.length && (
        <p className="small faint">
          {p.textNote(formatBytes(head.bytes.length), formatBytes(head.total))}
        </p>
      )}
    </>
  );
}

/** Labels of the script a `.rpy` or `.rpyc` file compiles to. */
function ScriptLabels({ entry }: { entry: InventoryEntry }) {
  const [outline, setOutline] = useState<ScriptOutline | null>(null);
  useEffect(() => {
    let active = true;
    void workerQueries.outline().then((o) => {
      if (active) setOutline(o);
    });
    return () => {
      active = false;
    };
  }, []);
  const source = (entry.gamePath ?? entry.path).replace(/c$/, '');
  const file = outline?.find((f) => f.file === source || f.file.replace(/^game\//, '') === source);
  if (!file || file.labels.length === 0) return null;
  return (
    <div className="preview-labels">
      <h3 className="small-title">{t.inventory.preview.labels(file.labels.length)}</h3>
      <ul className="chips">
        {file.labels.map((l) => (
          <li key={l.name}>
            <a href={href('lecteur', l.name)} className="chip mono">
              {l.name}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Lightbox({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  const p = t.inventory.preview;
  const ref = useRef<HTMLDialogElement>(null);
  const [actual, setActual] = useState(false);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="lightbox"
      aria-label={p.imageAlt(name)}
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop lands on the dialog itself.
        if (e.target === e.currentTarget) ref.current?.close();
      }}
    >
      <div className="lightbox-head">
        <span className="mono">{name}</span>
        <div role="group" aria-label={p.zoomLabel} className="segmented">
          <button
            type="button"
            aria-pressed={!actual}
            onClick={() => {
              setActual(false);
            }}
          >
            {p.fit}
          </button>
          <button
            type="button"
            aria-pressed={actual}
            onClick={() => {
              setActual(true);
            }}
          >
            {p.actual}
          </button>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-small"
          onClick={() => ref.current?.close()}
        >
          {p.close}
        </button>
      </div>
      <div className={actual ? 'lightbox-stage actual' : 'lightbox-stage'}>
        <img src={url} alt={p.imageAlt(name)} />
      </div>
    </dialog>
  );
}

function ImagePreview({ entry }: { entry: InventoryEntry }) {
  const p = t.inventory.preview;
  const url = useAssetUrl(entry.path, true, entry.archive);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const name = basename(entry.path);
  return (
    <>
      <div className="preview-frame">
        {failed ? (
          <p className="faint">{p.cannotShow}</p>
        ) : url ? (
          <img
            src={url}
            alt={p.imageAlt(name)}
            onLoad={(e) => {
              setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight });
            }}
            onError={() => {
              setFailed(true);
            }}
          />
        ) : (
          <p className="faint">{p.loading}</p>
        )}
      </div>
      <div className="preview-meta">
        <span className="mono small muted">{size ? p.pixels(size.w, size.h) : ''}</span>
        {url && !failed && (
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={() => {
              setOpen(true);
            }}
          >
            {p.enlarge}
          </button>
        )}
      </div>
      {open && url && (
        <Lightbox
          url={url}
          name={name}
          onClose={() => {
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function MediaPreview({ entry, video }: { entry: InventoryEntry; video: boolean }) {
  const p = t.inventory.preview;
  const url = useAssetUrl(entry.path, true, entry.archive);
  const [duration, setDuration] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const type = mediaType(entry.path);
  const supported =
    type !== '' && document.createElement(video ? 'video' : 'audio').canPlayType(type) !== '';
  if (!supported || failed) return <p className="small faint">{p.cannotPlay}</p>;
  if (!url) return <p className="small faint">{p.loading}</p>;
  const props = {
    controls: true,
    preload: 'metadata',
    src: url,
    onLoadedMetadata: (e: { currentTarget: HTMLMediaElement }) => {
      setDuration(e.currentTarget.duration);
    },
    onError: () => {
      setFailed(true);
    },
  } as const;
  return (
    <>
      {video ? (
        <video className="preview-video" {...props} />
      ) : (
        <audio className="preview-audio" {...props} />
      )}
      {duration !== null && formatMediaTime(duration) !== '' && (
        <p className="small muted">{p.duration(formatMediaTime(duration))}</p>
      )}
    </>
  );
}

let fontCounter = 0;

function FontPreview({ entry }: { entry: InventoryEntry }) {
  const p = t.inventory.preview;
  const [state, setState] = useState<
    { kind: 'loading' } | { kind: 'large' } | { kind: 'failed' } | { kind: 'ready'; family: string }
  >({ kind: 'loading' });
  useEffect(() => {
    let active = true;
    let face: FontFace | null = null;
    void workerQueries
      .openAsset(entry.path, entry.archive)
      .then(async (blob) => {
        if (!blob) throw new Error('unknown file');
        if (blob.size > FONT_LIMIT) {
          if (active) setState({ kind: 'large' });
          return;
        }
        // An ArrayBuffer source: nothing is fetched, the CSP's font-src does not apply.
        const family = `phanes-preview-${++fontCounter}`;
        const loaded = await new FontFace(family, await blob.arrayBuffer()).load();
        if (!active) return;
        face = loaded;
        document.fonts.add(loaded);
        setState({ kind: 'ready', family });
      })
      .catch(() => {
        if (active) setState({ kind: 'failed' });
      });
    return () => {
      active = false;
      if (face) document.fonts.delete(face);
    };
  }, [entry.path, entry.archive]);
  if (state.kind === 'loading') return <p className="small faint">{p.loading}</p>;
  if (state.kind === 'large')
    return <p className="small faint">{p.fontTooLarge(formatBytes(FONT_LIMIT))}</p>;
  if (state.kind === 'failed')
    return (
      <>
        <p className="small faint">{p.fontFailed}</p>
        <TextOrHex entry={entry} />
      </>
    );
  return (
    <div
      className="preview-font"
      style={{ fontFamily: `"${state.family}", var(--mono)` }}
      data-testid="font-preview"
    >
      <p className="preview-font-large">{p.fontSample}</p>
      <p>{p.fontAlphabet}</p>
    </div>
  );
}

/** A preview of any game file, read from the dropped files on this machine. */
export function FilePreview({ entry }: { entry: InventoryEntry }) {
  const p = t.inventory.preview;
  let body;
  switch (entry.kind) {
    case 'archive':
      return <p className="small faint">{p.archive}</p>;
    case 'image':
      body = <ImagePreview entry={entry} />;
      break;
    case 'audio':
      body = <MediaPreview entry={entry} video={false} />;
      break;
    case 'video':
      body = <MediaPreview entry={entry} video />;
      break;
    case 'font':
      body = <FontPreview entry={entry} />;
      break;
    case 'script':
    case 'compiled-script':
      body = (
        <>
          <TextOrHex entry={entry} />
          <ScriptLabels entry={entry} />
        </>
      );
      break;
    default:
      body = <TextOrHex entry={entry} />;
  }
  return (
    <div className="preview" data-testid="file-preview">
      {body}
      <p className="small faint">{p.localNote}</p>
    </div>
  );
}
