import type { AnalyzeProgress, Diagnostic, Report } from '@phanes/core';
import * as Comlink from 'comlink';
import type { PickedFile } from '../adapters/collect';
import type { AnalysisWorkerApi } from './protocol';

/**
 * The worker is created once, when the app starts: all the analysis code is
 * loaded before the user drops anything, so analyzing makes no request.
 */
const worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), {
  type: 'module',
  name: 'phanes-analysis',
});
const remote = Comlink.wrap<AnalysisWorkerApi>(worker);

export function analyzeInWorker(
  files: readonly PickedFile[],
  onProgress: (p: AnalyzeProgress) => void,
  onDiagnostics: (d: readonly Diagnostic[]) => void,
): Promise<Report> {
  return remote.analyze(files, Comlink.proxy(onProgress), Comlink.proxy(onDiagnostics));
}

export function cancelAnalysis(): void {
  void remote.cancel();
}

export function isCancellation(error: unknown): boolean {
  return error instanceof Error && error.message === 'cancelled';
}

/** Queries on the last analyzed project (reader, dialogue, assets). */
export const workerQueries = {
  outline: () => remote.outline(),
  readLabel: (name: string) => remote.readLabel(name),
  dialogue: () => remote.dialogue(),
  search: (query: string, limit = 200) => remote.search(query, limit),
  openAsset: (path: string) => remote.openAsset(path),
};
