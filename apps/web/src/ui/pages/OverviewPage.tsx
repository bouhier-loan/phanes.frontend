import { type FileKind, readingMinutes } from '@phanes/core';
import { useId, useState } from 'react';
import { DownloadIcon } from '../components/icons';
import { Callout, Meter, PageHeader, StatCard } from '../components/ui';
import { formatBytes, formatDuration, formatMinutes, formatNumber, formatPercent } from '../format';
import { useReport } from '../report';
import { href } from '../route';
import { describeDiagnostic, t } from '../strings.fr';
import { characterName } from './characters-shared';

const SPEEDS = [150, 200, 250, 300];

function readingValue(minutes: number): string {
  return minutes < 1 ? t.overview.underAMinute : `≈ ${formatMinutes(minutes)}`;
}

const GROUPS: readonly { key: keyof typeof t.overview.kinds; kinds: FileKind[]; color: string }[] =
  [
    { key: 'image', kinds: ['image'], color: 'var(--amber)' },
    { key: 'audio', kinds: ['audio'], color: 'var(--blue)' },
    { key: 'video', kinds: ['video'], color: 'var(--red)' },
    { key: 'script', kinds: ['script', 'compiled-script'], color: 'var(--teal)' },
    { key: 'font', kinds: ['font'], color: 'var(--violet)' },
    { key: 'other', kinds: ['python', 'text', 'other'], color: 'var(--neutral)' },
  ];

function Breakdown() {
  const { inventory } = useReport();
  if (!inventory) return null;
  const o = t.overview;
  const rows = GROUPS.map((g) => ({
    ...g,
    count: g.kinds.reduce((n, k) => n + inventory.byKind[k].count, 0),
    bytes: g.kinds.reduce((n, k) => n + inventory.byKind[k].bytes, 0),
  })).filter((r) => r.count > 0);
  const bytes = rows.reduce((n, r) => n + r.bytes, 0);
  const files = rows.reduce((n, r) => n + r.count, 0);
  return (
    <section aria-labelledby="titre-repartition" className="card card-pad">
      <div className="card-title-row">
        <h2 id="titre-repartition">{o.breakdown}</h2>
        <span className="mono small muted">{o.breakdownTotal(formatBytes(bytes), files)}</span>
      </div>
      <div className="stacked" aria-hidden="true">
        {rows.map((r) => (
          <span
            key={r.key}
            style={{ width: `${bytes === 0 ? 0 : (r.bytes / bytes) * 100}%`, background: r.color }}
          />
        ))}
      </div>
      <ul className="legend-grid">
        {rows.map((r) => (
          <li key={r.key}>
            <span className="swatch" aria-hidden="true" style={{ background: r.color }} />
            <span className="legend-name">{o.kinds[r.key]}</span>
            <span className="mono small muted">
              {o.breakdownRow(r.count, formatBytes(r.bytes), formatPercent(r.bytes, bytes))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Voices() {
  const { characters } = useReport();
  if (!characters) return null;
  const top = characters.characters.filter((c) => c.words > 0).slice(0, 5);
  const max = Math.max(1, ...top.map((c) => c.words));
  const o = t.overview;
  return (
    <section aria-labelledby="titre-voix" className="card card-pad">
      <h2 id="titre-voix">{o.voices}</h2>
      <ul className="voices">
        {top.map((c) => (
          <li key={c.id}>
            <div className="list-row">
              <span>{characterName(c)}</span>
              <span className="mono small muted">
                {formatPercent(c.words, characters.totals.words)}
              </span>
            </div>
            <Meter ratio={c.words / max} />
          </li>
        ))}
      </ul>
      <p className="small faint">{o.voicesNote}</p>
      <a href={href('personnages')} className="card-link">
        {o.allCharacters(characters.characters.length)}
      </a>
    </section>
  );
}

function DiagnosticsPanel() {
  const { diagnostics } = useReport();
  const o = t.overview;
  const count = (s: 'error' | 'warning' | 'info') =>
    diagnostics.filter((d) => d.severity === s).length;
  const errors = diagnostics.filter((d) => d.severity === 'error').slice(0, 2);
  return (
    <section aria-labelledby="titre-diag" className="card card-pad">
      <h2 id="titre-diag">{o.diagnostics}</h2>
      {diagnostics.length === 0 ? (
        <p className="muted">{o.noDiagnostics}</p>
      ) : (
        <>
          <div className="severity-grid">
            {(['error', 'warning', 'info'] as const).map((s) => (
              <div key={s} className={`severity-box severity-${s}`}>
                <span className="severity-count">{formatNumber(count(s))}</span>
                <span>{o.severities(count(s))[s]}</span>
              </div>
            ))}
          </div>
          <ul className="list">
            {errors.map((d, i) => (
              <li key={i} className="site">
                {d.path && <span className="error-path">{d.path}</span>}
                <span className="text-2">{describeDiagnostic(d)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <a href={href('diagnostics')} className="card-link">
        {o.allDiagnostics}
      </a>
    </section>
  );
}

function EnginePanel() {
  const { overview, inventory } = useReport();
  if (!overview) return null;
  const o = t.overview;
  const r = overview.renpy;
  const archives = inventory?.archives ?? [];
  const byVersion = new Map<string, number>();
  for (const a of archives)
    if (a.version && !a.error) byVersion.set(a.version, (byVersion.get(a.version) ?? 0) + 1);
  const unreadable = archives.filter((a) => a.error !== null).length;
  const exts = new Map<string, number>();
  for (const e of inventory?.entries ?? []) {
    if (e.kind !== 'script' && e.kind !== 'compiled-script') continue;
    if (e.zone !== 'game' || e.shadowedBy !== null) continue;
    const ext = e.path.slice(e.path.lastIndexOf('.'));
    exts.set(ext, (exts.get(ext) ?? 0) + 1);
  }
  const detail = [
    r.confidence ? o.confidence[r.confidence] : null,
    r.source ? o.fromSource(o.source[r.source]) : null,
    r.python ? o.python(r.python) : null,
  ].filter(Boolean);
  return (
    <section aria-labelledby="titre-moteur" className="card card-pad">
      <h2 id="titre-moteur">{o.engine}</h2>
      <dl className="kv">
        <div>
          <dt>{o.renpyVersion}</dt>
          <dd>
            {r.version ?? o.unknown}{' '}
            {detail.length > 0 && <span className="mono small faint">· {detail.join(' · ')}</span>}
          </dd>
        </div>
        <div>
          <dt>{o.archives}</dt>
          <dd>
            {archives.length === 0
              ? o.noArchives
              : [...byVersion.entries()].map(([v, n]) => `${formatNumber(n)} × ${v}`).join(', ')}
            {unreadable > 0 && <span className="text-red"> · {o.unrecognized(unreadable)}</span>}
          </dd>
        </div>
        <div>
          <dt>{o.scripts}</dt>
          <dd className="mono">
            {[...exts.entries()]
              .sort(([a], [b]) => (a < b ? 1 : -1))
              .map(([ext, n]) => `${formatNumber(n)} ${ext}`)
              .join(' · ') || '—'}
          </dd>
          {overview.scripts.sourceOnly > 0 && (
            <dd className="small faint">{o.sourceOnly(overview.scripts.sourceOnly)}</dd>
          )}
        </div>
        <div>
          <dt>{o.languages}</dt>
          <dd>
            {o.languagesValue(overview.languages.length)}{' '}
            {overview.languages.length > 0 && (
              <span className="mono small faint">{overview.languages.join(', ')}</span>
            )}
          </dd>
        </div>
      </dl>
      <a href={href('inventaire')} className="card-link">
        {o.openInventory}
      </a>
    </section>
  );
}

export function OverviewPage() {
  const r = useReport();
  const [wpm, setWpm] = useState(200);
  const speedId = useId();
  const o = t.overview;
  const overview = r.overview;
  return (
    <>
      <PageHeader
        crumbs={t.crumbs(r.title, t.groups.report)}
        title={t.sections['vue-ensemble']}
        lede={
          overview
            ? o.lede(
                r.durationMs === null ? null : formatDuration(r.durationMs),
                overview.scripts.decoded,
                overview.scripts.compiled,
              )
            : undefined
        }
      >
        <a href={href('export')} className="btn btn-outline">
          <DownloadIcon />
          {t.sections.export}
        </a>
      </PageHeader>

      {overview && overview.scripts.failed > 0 && (
        <Callout tone="error" action={<a href={href('diagnostics')}>{o.seeDiagnostics}</a>}>
          {o.failed(overview.scripts.failed)}
        </Callout>
      )}

      {overview ? (
        <section aria-label={o.keyFigures} className="key-figures">
          <div className="reading-card">
            <span className="stat-label">{o.readingTime}</span>
            <span className="reading-value">
              {readingValue(readingMinutes(overview.dialogue, wpm))}
            </span>
            <p className="muted small">{o.readingNote}</p>
            <div className="field reading-speed">
              <label htmlFor={speedId}>{o.speed}</label>
              <select
                id={speedId}
                className="select"
                value={wpm}
                onChange={(e) => {
                  setWpm(Number(e.currentTarget.value));
                }}
              >
                {SPEEDS.map((n) => (
                  <option key={n} value={n}>
                    {o.wpm(n)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="stat-grid key-stats">
            <StatCard label={o.labels} value={formatNumber(overview.labels)} />
            <StatCard label={o.lines} value={formatNumber(overview.dialogue.lines)} />
            <StatCard
              label={o.words}
              value={formatNumber(overview.dialogue.words)}
              {...(overview.dialogue.cjkChars > 0
                ? { detail: o.cjk(overview.dialogue.cjkChars) }
                : {})}
            />
            <StatCard
              label={o.characters}
              value={formatNumber(r.characters?.characters.length ?? 0)}
            />
            <StatCard
              label={o.menus}
              value={formatNumber(overview.dialogue.menus)}
              detail={o.options(overview.dialogue.choices)}
            />
            {r.graph && (
              <StatCard label={o.endings} value={formatNumber(r.graph.endings.length)}>
                <a href={href('graphe')} className="small">
                  {o.seeGraph}
                </a>
              </StatCard>
            )}
          </div>
        </section>
      ) : (
        <p className="empty">{t.unavailable}</p>
      )}

      <Breakdown />

      <div className="grid-3">
        <Voices />
        <DiagnosticsPanel />
        <EnginePanel />
      </div>
    </>
  );
}
