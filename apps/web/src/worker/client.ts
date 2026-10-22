import type { AnalyzeProgress, Diagnostic, Report } from '@phanes/core';
import * as Comlink from 'comlink';
import type { PickedFile } from '../adapters/collect';
import type { AnalysisWorkerApi } from './protocol';

let remote: Comlink.Remote<AnalysisWorkerApi> | null = null;

/**
 * Creates the worker, once: AuthGate calls this as soon as the user is
 * signed in, before the app renders, so all the analysis code is loaded
 * before the user drops anything and analyzing makes no request. Not
 * earlier: the sign-in redirect would abort the download of its script.
 */
export function startWorker(): Comlink.Remote<AnalysisWorkerApi> {
  remote ??= Comlink.wrap<AnalysisWorkerApi>(
    new Worker(new URL('./analysis.worker.ts', import.meta.url), {
      type: 'module',
      name: 'phanes-analysis',
    }),
  );
  return remote;
}

export function analyzeInWorker(
  files: readonly PickedFile[],
  onProgress: (p: AnalyzeProgress) => void,
  onDiagnostics: (d: readonly Diagnostic[]) => void,
): Promise<Report> {
  return startWorker().analyze(files, Comlink.proxy(onProgress), Comlink.proxy(onDiagnostics));
}

export function cancelAnalysis(): void {
  void startWorker().cancel();
}

export function isCancellation(error: unknown): boolean {
  return error instanceof Error && error.message === 'cancelled';
}

/** Queries on the last analyzed project (reader, dialogue, assets). */
export const workerQueries = {
  outline: () => startWorker().outline(),
  readLabel: (name: string) => startWorker().readLabel(name),
  dialogue: () => startWorker().dialogue(),
  search: (query: string, limit = 200) => startWorker().search(query, limit),
  screenSize: () => startWorker().screenSize(),
  openAsset: (path: string, archive?: string | null) => startWorker().openAsset(path, archive),
};
