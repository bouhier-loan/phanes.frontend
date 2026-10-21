import type { AnalyzePhase, AnalyzeProgress, Diagnostic } from '@phanes/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PickedFile } from '../adapters/collect';
import { analyzeInWorker, cancelAnalysis, isCancellation } from '../worker/client';
import { startNetworkWatch } from './network';
import { AnalysisPage, type JournalEntry } from './pages/AnalysisPage';
import { HomePage } from './pages/HomePage';
import { ReportContext, reportData, type ReportData } from './report';
import { ReportShell } from './shell/ReportShell';
import { describeDiagnostic, t } from './strings.fr';

export type Phase = AnalyzePhase | 'collecting';

export interface Analyzing {
  readonly phase: Phase;
  readonly progress: AnalyzeProgress | null;
  readonly startedAt: number;
  /** Files found so far while reading a dropped folder. */
  readonly found: number;
  readonly fileCount: number | null;
  readonly totalBytes: number;
  readonly rootName: string | null;
  /** Newest first. */
  readonly journal: readonly JournalEntry[];
  /** Phases seen so far, in order (translations only appear when needed). */
  readonly phases: readonly Phase[];
  readonly errors: Readonly<Partial<Record<Phase, number>>>;
}

type State =
  | { step: 'idle'; message: string | null }
  | { step: 'analyzing'; analyzing: Analyzing }
  | { step: 'done'; data: ReportData };

const MAX_JOURNAL = 300;

function initial(startedAt: number): Analyzing {
  return {
    phase: 'collecting',
    progress: null,
    startedAt,
    found: 0,
    fileCount: null,
    totalBytes: 0,
    rootName: null,
    journal: [],
    phases: ['collecting'],
    errors: {},
  };
}

function rootNameOf(files: readonly PickedFile[]): string | null {
  const first = files[0]?.path ?? '';
  const slash = first.indexOf('/');
  return slash > 0 ? first.slice(0, slash) : null;
}

function log(a: Analyzing, entry: Omit<JournalEntry, 'at'>): Analyzing {
  const at = performance.now() - a.startedAt;
  return { ...a, journal: [{ at, ...entry }, ...a.journal].slice(0, MAX_JOURNAL) };
}

function withProgress(a: Analyzing, progress: AnalyzeProgress): Analyzing {
  let next: Analyzing = { ...a, progress };
  if (progress.phase !== a.phase) {
    next = {
      ...next,
      phase: progress.phase,
      phases: a.phases.includes(progress.phase) ? a.phases : [...a.phases, progress.phase],
    };
    if (progress.phase !== 'done')
      next = log(next, {
        kind: 'info',
        path: null,
        note: t.analysis.journalPhase(t.analysis.steps[progress.phase]),
      });
  } else if (
    progress.phase !== 'analyses' &&
    progress.current &&
    progress.current !== a.progress?.current
  ) {
    next = log(next, { kind: 'info', path: progress.current, note: null });
  }
  return next;
}

function withDiagnostics(a: Analyzing, diagnostics: readonly Diagnostic[]): Analyzing {
  let next = a;
  for (const d of diagnostics) {
    if (d.severity === 'info') continue;
    next = log(next, {
      kind: d.severity === 'error' ? 'error' : 'warning',
      path: d.path ?? null,
      note: describeDiagnostic(d),
    });
  }
  const errors = diagnostics.filter((d) => d.severity === 'error').length;
  if (errors === 0) return next;
  return { ...next, errors: { ...next.errors, [a.phase]: (next.errors[a.phase] ?? 0) + errors } };
}

export function App() {
  const [state, setState] = useState<State>({ step: 'idle', message: null });
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    startNetworkWatch();
  }, []);

  const update = useCallback((fn: (a: Analyzing) => Analyzing) => {
    setState((s) => (s.step === 'analyzing' ? { ...s, analyzing: fn(s.analyzing) } : s));
  }, []);

  /** Enters the analysis page (first call) and returns when it started. */
  const enter = useCallback((): number => {
    if (startedAt.current === null) {
      const now = performance.now();
      startedAt.current = now;
      setState({ step: 'analyzing', analyzing: initial(now) });
    }
    return startedAt.current;
  }, []);

  const onCollecting = useCallback(
    (found: number) => {
      enter();
      update((a) => ({ ...a, found }));
    },
    [enter, update],
  );

  const onFiles = useCallback(
    async (files: PickedFile[]) => {
      if (files.length === 0) {
        startedAt.current = null;
        setState({ step: 'idle', message: t.errors.empty });
        return;
      }
      const start = enter();
      update((a) =>
        log(
          {
            ...a,
            found: files.length,
            fileCount: files.length,
            totalBytes: files.reduce((sum, f) => sum + f.file.size, 0),
            rootName: rootNameOf(files),
          },
          { kind: 'info', path: null, note: t.analysis.journalCollected(files.length) },
        ),
      );
      try {
        const report = await analyzeInWorker(
          files,
          (p) => {
            update((a) => withProgress(a, p));
          },
          (ds) => {
            update((a) => withDiagnostics(a, ds));
          },
        );
        startedAt.current = null;
        window.location.hash = '#/vue-ensemble';
        setState({ step: 'done', data: reportData(report, performance.now() - start) });
      } catch (error) {
        startedAt.current = null;
        const message = isCancellation(error)
          ? t.errors.cancelled
          : t.errors.failed(error instanceof Error ? error.message : String(error));
        setState({ step: 'idle', message });
      }
    },
    [enter, update],
  );

  const reset = useCallback(() => {
    startedAt.current = null;
    history.replaceState(null, '', window.location.pathname);
    setState({ step: 'idle', message: null });
  }, []);

  if (state.step === 'idle')
    return <HomePage onFiles={onFiles} onCollecting={onCollecting} message={state.message} />;
  if (state.step === 'analyzing')
    return <AnalysisPage analyzing={state.analyzing} onCancel={cancelAnalysis} />;
  return (
    <ReportContext.Provider value={state.data}>
      <ReportShell onReset={reset} />
    </ReportContext.Provider>
  );
}
