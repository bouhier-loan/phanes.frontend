import type { DialogueLine } from '@phanes/core';
import { type ReactNode, useEffect, useId, useMemo, useState } from 'react';
import { workerQueries } from '../../worker/client';
import { CopyIcon, DownloadIcon } from '../components/icons';
import { PageHeader } from '../components/ui';
import { downloadJson, exportJson, reportFileName } from '../export';
import { formatBytes } from '../format';
import { useReport } from '../report';
import { t } from '../strings.fr';

const PREVIEW_LINES = 60;
const TOKEN =
  /("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

/** JSON text with keys, strings, numbers and literals in their own spans. */
function colored(line: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of line.matchAll(TOKEN)) {
    if (m.index > last) out.push(line.slice(last, m.index));
    const [text, str, colon, literal, number] = m;
    const kind =
      str !== undefined
        ? colon
          ? 'json-key'
          : 'json-string'
        : literal
          ? 'json-literal'
          : number
            ? 'json-number'
            : '';
    out.push(
      <span key={m.index} className={kind}>
        {colon && str ? str : text}
      </span>,
    );
    if (colon && str) out.push(colon);
    last = m.index + text.length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

function Check({
  checked,
  onChange,
  children,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
  hint?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="check check-row">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => {
          onChange(e.currentTarget.checked);
        }}
      />
      <label htmlFor={id}>{children}</label>
      {hint}
    </div>
  );
}

export function ExportPage() {
  const r = useReport();
  const e = t.export;
  const keys = Object.keys(r.report.analyses);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set(keys));
  const [diagnostics, setDiagnostics] = useState(true);
  const [withText, setWithText] = useState(false);
  const [indent, setIndent] = useState(true);
  const [dialogue, setDialogue] = useState<DialogueLine[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!withText || dialogue) return;
    let active = true;
    void workerQueries.dialogue().then((lines) => {
      if (active) setDialogue(lines);
    });
    return () => {
      active = false;
    };
  }, [withText, dialogue]);

  const pending = withText && dialogue === null;
  const json = useMemo(
    () =>
      pending
        ? null
        : exportJson(r.report, {
            analyses: selected,
            diagnostics,
            dialogue: withText ? dialogue : null,
            indent,
          }),
    [r.report, selected, diagnostics, withText, dialogue, indent, pending],
  );
  const size = useMemo(() => (json === null ? null : new Blob([json]).size), [json]);
  const preview = useMemo(() => {
    if (json === null) return [];
    const pretty = indent ? json : JSON.stringify(JSON.parse(json) as unknown, null, 2);
    return pretty.split('\n');
  }, [json, indent]);
  const fileName = reportFileName(r.report);

  const toggle = (key: string, on: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  };
  const copy = () => {
    if (json === null) return;
    navigator.clipboard.writeText(json).then(
      () => {
        setStatus(e.copied);
      },
      () => {
        setStatus(e.copyFailed);
      },
    );
  };

  return (
    <>
      <PageHeader crumbs={t.crumbs(r.title, t.groups.report)} title={e.title} lede={e.lede} />
      <div className="split export">
        <form
          className="card card-pad split-aside export-form"
          onSubmit={(ev) => {
            ev.preventDefault();
          }}
        >
          <fieldset>
            <legend>{e.sections}</legend>
            {keys.map((key) => (
              <Check
                key={key}
                checked={selected.has(key)}
                onChange={(on) => {
                  toggle(key, on);
                }}
                hint={<span className="mono small faint key-name">{key}</span>}
              >
                {e.keys[key] ?? key}
              </Check>
            ))}
            <Check
              checked={diagnostics}
              onChange={setDiagnostics}
              hint={<span className="mono small faint key-name">diagnostics</span>}
            >
              {e.diagnosticsList}
            </Check>
          </fieldset>
          <fieldset>
            <legend>{e.options}</legend>
            <Check checked={withText} onChange={setWithText}>
              <span className="check-label">
                <span>{e.includeText}</span>
                <span className="small faint">{e.includeTextNote}</span>
              </span>
            </Check>
            <Check checked={indent} onChange={setIndent}>
              {e.indent}
            </Check>
          </fieldset>
          <div className="export-actions">
            <p className="list-row">
              <span className="muted">{e.size}</span>
              <span className="mono">{size === null ? e.computing : `≈ ${formatBytes(size)}`}</span>
            </p>
            <button
              type="button"
              className="btn"
              disabled={json === null}
              onClick={() => {
                if (json !== null) downloadJson(json, fileName);
              }}
            >
              <DownloadIcon />
              {e.download}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={json === null}
              onClick={copy}
            >
              <CopyIcon />
              {e.copy}
            </button>
            {status && (
              <p role="status" className="small muted">
                {status}
              </p>
            )}
          </div>
        </form>

        <section aria-labelledby="titre-apercu" className="card split-main preview">
          <div className="preview-head">
            <h2 id="titre-apercu">{e.preview}</h2>
            <span className="mono small faint">{fileName}</span>
          </div>
          <pre className="json">
            <code>
              {preview.slice(0, PREVIEW_LINES).map((line, n) => (
                <span key={n} className="json-line">
                  {colored(line)}
                  {'\n'}
                </span>
              ))}
              {preview.length > PREVIEW_LINES && (
                <span className="json-more">{e.moreLines(preview.length - PREVIEW_LINES)}</span>
              )}
            </code>
          </pre>
        </section>
      </div>
    </>
  );
}
