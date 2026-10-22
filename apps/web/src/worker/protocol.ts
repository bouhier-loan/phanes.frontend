import type {
  AnalyzeProgress,
  Diagnostic,
  DialogueLine,
  ReaderLabel,
  Report,
  ScreenSize,
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
  /** The game's screen size, when the scripts set it. */
  screenSize(): ScreenSize | null;
  /**
   * A lazy Blob over a game file (VFS path), or null if unknown. `archive`
   * (an archive path, or null for a file on disk) picks one of two entries
   * that share a path.
   */
  openAsset(path: string, archive?: string | null): Blob | null;
}
