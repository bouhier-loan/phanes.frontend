import type {
  AnalyzeProgress,
  Diagnostic,
  DialogueLine,
  ReaderLabel,
  Report,
  ScriptOutline,
} from '@phanes/core';
import type { PickedFile } from '../adapters/collect';

/** API exposed by the analysis worker (through Comlink). */
export interface AnalysisWorkerApi {
  analyze(
    files: readonly PickedFile[],
    onProgress: (progress: AnalyzeProgress) => void,
    onDiagnostics: (diagnostics: readonly Diagnostic[]) => void,
  ): Promise<Report>;
  /** Stops the running analysis at the next file; analyze() then rejects with "cancelled". */
  cancel(): void;
  /** Script reader queries on the last analyzed project. */
  outline(): ScriptOutline;
  readLabel(name: string): ReaderLabel | null;
  dialogue(): DialogueLine[];
  search(query: string, limit: number): DialogueLine[];
  /** A lazy Blob over a game file (VFS path), or null if unknown. */
  openAsset(path: string): Blob | null;
}
