import { useEffect, useState } from 'react';
import type { Analyzing, Phase } from '../App';
import { DoneIcon, Logo, RunningIcon, WaitingIcon } from '../components/icons';
import { formatBytes, formatClock } from '../format';
import { useNetworkRequests } from '../network';
import { t } from '../strings.fr';

export interface JournalEntry {
  /** Milliseconds since the analysis started. */
  readonly at: number;
  readonly kind: 'info' | 'warning' | 'error';
  readonly path: string | null;
  readonly note: string | null;
}

type Step = Exclude<Phase, 'done'>;

/** Share of the global progress bar given to each phase. */
const WEIGHTS: Readonly<Record<Step, number>> = {
  collecting: 5,
  archives: 15,
  scripts: 60,
  translations: 10,
  analyses: 10,
};
const ORDER: readonly Step[] = ['collecting', 'archives', 'scripts', 'translations', 'analyses'];

function ratioOf(a: Analyzing): number {
  if (a.phase === 'done') return 1;
  const steps = ORDER.filter((s) => s !== 'translations' || a.phases.includes('translations'));
  const total = steps.reduce((sum, s) => sum + WEIGHTS[s], 0);
  let done = 0;
  for (const step of steps) {
    if (step === a.phase) {
      const p = a.progress;
      const fraction = p?.phase === step && p.total > 0 ? p.done / p.total : 0;
      done += WEIGHTS[step] * fraction;
      break;
    }
    done += WEIGHTS[step];
  }
  return Math.min(1, done / total);
}

function useClock(startedAt: number): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(performance.now());
    }, 1000);
    return () => {
      window.clearInterval(id);
    };
  }, []);
  return now - startedAt;
}

export function AnalysisPage({
  analyzing: a,
  onCancel,
}: {
  analyzing: Analyzing;
  onCancel: () => void;
}) {
  const elapsed = useClock(a.startedAt);
  const requests = useNetworkRequests();
  const ratio = ratioOf(a);
  const percent = Math.round(ratio * 100);
  const steps = ORDER.filter((s) => s !== 'translations' || a.phases.includes('translations'));
  const current = a.phase === 'done' ? null : a.phase;
  const currentIndex = current === null ? steps.length : steps.indexOf(current);
  const s = t.analysis;

  const detailOf = (step: Step, index: number): string => {
    if (step === 'collecting')
      return a.fileCount === null
        ? s.found(a.found)
        : s.dropped(a.fileCount, formatBytes(a.totalBytes));
    if (step === 'analyses') {
      const p = a.progress;
      if (index === currentIndex && p?.phase === 'analyses' && p.current)
        return `${s.count(p.done, p.total)} · ${s.analysisNames[p.current] ?? p.current}`;
      return s.analysesDetail;
    }
    if (step === 'translations' && index !== currentIndex) return s.translationsDetail;
    const p = a.progress;
    if (index === currentIndex && p?.phase === step && p.total > 0)
      return `${s.count(p.done, p.total)}${p.current ? ` · ${p.current}` : ''}`;
    return '';
  };

  return (
    <div className="home">
      <header className="topbar">
        <div className="wrap">
          <div className="topbar-start">
            <span className="brand">
              <Logo size={26} />
              {t.appName}
            </span>
            {a.rootName && (
              <>
                <span className="divider" aria-hidden="true" />
                <span className="root-name">{a.rootName}</span>
              </>
            )}
          </div>
          <div className="home-header-end">
            <p className="pill">
              <span className="dot" aria-hidden="true" />
              {s.networkPill(requests)}
            </p>
            <button type="button" className="btn btn-secondary btn-small" onClick={onCancel}>
              {s.cancel}
            </button>
          </div>
        </div>
      </header>

      <main className="wrap analysis" data-testid="progress" aria-busy="true">
        <section aria-labelledby="titre-analyse" className="analysis-main">
          <div className="analysis-head">
            <p className="eyebrow">{s.eyebrow(formatClock(elapsed))}</p>
            <h1 id="titre-analyse">{s.title[a.phase]}</h1>
            <p>{s.lede}</p>
          </div>

          <div className="progress-global">
            <div className="progress-head">
              <span>{s.progress}</span>
              <span className="progress-percent">{percent} %</span>
            </div>
            <div
              className="bar"
              role="progressbar"
              aria-label={s.progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
            >
              <span style={{ width: `${percent}%` }} />
            </div>
          </div>

          <ol aria-label={s.stepsLabel} className="card steps">
            {steps.map((step, i) => {
              const state = i < currentIndex ? 'done' : i === currentIndex ? 'running' : 'waiting';
              const errors = a.errors[step] ?? 0;
              const p = a.progress;
              const inner =
                state === 'running' && p?.phase === step && p.total > 0 ? p.done / p.total : null;
              return (
                <li key={step} className={state === 'running' ? 'current' : state}>
                  {state === 'done' ? (
                    <DoneIcon size={24} />
                  ) : state === 'running' ? (
                    <RunningIcon size={24} />
                  ) : (
                    <WaitingIcon size={24} />
                  )}
                  <div className="step-body">
                    <span className="step-name">{s.steps[step]}</span>
                    {detailOf(step, i) && <span className="step-detail">{detailOf(step, i)}</span>}
                    {inner !== null && (
                      <div className="bar bar-small" aria-hidden="true">
                        <span style={{ width: `${inner * 100}%` }} />
                      </div>
                    )}
                  </div>
                  <span className={errors > 0 ? 'step-status error' : 'step-status'}>
                    {errors > 0 ? s.errors(errors) : s.status[state]}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>

        <aside aria-label={s.asideLabel} className="analysis-aside">
          <div className="card card-raised network-card">
            <h2>{s.networkTitle}</h2>
            <p className="network-count">{requests}</p>
            <p>{s.networkText}</p>
          </div>
          <div className="card journal">
            <h2>{s.journal}</h2>
            <ul aria-live="off">
              {a.journal.map((entry, i) => (
                <li
                  key={`${a.journal.length - i}`}
                  className={entry.kind === 'error' ? 'error' : undefined}
                >
                  <time>{formatClock(entry.at)}</time>
                  <span className="entry">
                    {entry.path && <span className="mono">{entry.path}</span>}
                    {entry.path && entry.note && ' '}
                    {entry.note && <span className="note">{entry.note}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </main>
    </div>
  );
}
