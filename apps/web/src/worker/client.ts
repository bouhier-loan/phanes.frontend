import type { AnalyzeProgress, Report } from '@phanes/core';
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
): Promise<Report> {
  return remote.analyze(files, Comlink.proxy(onProgress));
}

export function cancelAnalysis(): void {
  void remote.cancel();
}

export function isCancellation(error: unknown): boolean {
  return error instanceof Error && error.message === 'cancelled';
}
