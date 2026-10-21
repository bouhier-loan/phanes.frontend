import type { AnalyzeProgress, Report } from '@phanes/core';
import type { PickedFile } from '../adapters/collect';

/** API exposed by the analysis worker (through Comlink). */
export interface AnalysisWorkerApi {
  analyze(
    files: readonly PickedFile[],
    onProgress: (progress: AnalyzeProgress) => void,
  ): Promise<Report>;
  /** Stops the running analysis at the next file; analyze() then rejects with "cancelled". */
  cancel(): void;
}
