import type { AnalyzeProgress, Report } from '@phanes/core';
import { useCallback, useState } from 'react';
import type { PickedFile } from '../adapters/collect';
import { analyzeInWorker, cancelAnalysis, isCancellation } from '../worker/client';
import { DropZone } from './DropZone';
import { Progress } from './Progress';
import { ReportView } from './ReportView';
import { t } from './strings.fr';

type State =
  | { step: 'idle'; message: string | null }
  | { step: 'collecting'; found: number }
  | { step: 'analyzing'; fileCount: number; progress: AnalyzeProgress | null }
  | { step: 'done'; report: Report };

export function App() {
  const [state, setState] = useState<State>({ step: 'idle', message: null });

  const onCollecting = useCallback((found: number) => {
    setState({ step: 'collecting', found });
  }, []);

  const onFiles = useCallback(async (files: PickedFile[]) => {
    if (files.length === 0) {
      setState({ step: 'idle', message: t.errors.empty });
      return;
    }
    setState({ step: 'analyzing', fileCount: files.length, progress: null });
    try {
      const report = await analyzeInWorker(files, (progress) => {
        setState((s) => (s.step === 'analyzing' ? { ...s, progress } : s));
      });
      setState({ step: 'done', report });
    } catch (error) {
      const message = isCancellation(error)
        ? t.errors.cancelled
        : t.errors.failed(error instanceof Error ? error.message : String(error));
      setState({ step: 'idle', message });
    }
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>{t.appTitle}</h1>
        <p className="tagline">{t.tagline}</p>
      </header>
      <main>
        {state.step === 'idle' && (
          <DropZone onFiles={onFiles} onCollecting={onCollecting} message={state.message} />
        )}
        {state.step === 'collecting' && <Progress label={t.progress.collecting(state.found)} />}
        {state.step === 'analyzing' && (
          <Progress
            label={
              state.progress ? t.progress.phase[state.progress.phase] : t.progress.phase.archives
            }
            done={state.progress?.done ?? 0}
            total={state.progress?.total ?? 0}
            detail={state.progress?.current ?? null}
            onCancel={cancelAnalysis}
          />
        )}
        {state.step === 'done' && (
          <ReportView
            report={state.report}
            onReset={() => {
              setState({ step: 'idle', message: null });
            }}
          />
        )}
      </main>
      <footer className="app-footer">{t.privacy}</footer>
    </div>
  );
}
