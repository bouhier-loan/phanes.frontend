import { AnalysisCancelled, type AnalyzeProgress, analyzeFiles } from '@phanes/core';
import * as Comlink from 'comlink';
import { BlobFileSource } from '../adapters/blob-file-source';
import type { AnalysisWorkerApi } from './protocol';

/** Progress is sent at most this often, plus on every phase change. */
const PROGRESS_INTERVAL_MS = 100;

let cancelled = false;

const api: AnalysisWorkerApi = {
  async analyze(files, onProgress) {
    cancelled = false;
    let last = 0;
    let lastPhase = '';
    const report = (p: AnalyzeProgress) => {
      const now = performance.now();
      if (p.phase === lastPhase && now - last < PROGRESS_INTERVAL_MS) return;
      last = now;
      lastPhase = p.phase;
      onProgress(p);
    };
    try {
      const { report: result } = await analyzeFiles(
        files.map((f) => new BlobFileSource(f.path, f.file)),
        { onProgress: report, isCancelled: () => cancelled },
      );
      return result;
    } catch (error) {
      if (error instanceof AnalysisCancelled) throw new Error('cancelled', { cause: error });
      throw error;
    }
  },
  cancel() {
    cancelled = true;
  },
};

Comlink.expose(api);
