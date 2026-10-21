import {
  AnalysisCancelled,
  type AnalyzeProgress,
  analyzeFiles,
  type DialogueLine,
  dialogueDump,
  type Project,
  readLabel,
  scriptOutline,
  searchText,
} from '@phanes/core';
import * as Comlink from 'comlink';
import { BlobFileSource } from '../adapters/blob-file-source';
import { blobOf } from '../adapters/blob-of';
import type { AnalysisWorkerApi } from './protocol';

/** Progress is sent at most this often, plus on every phase change. */
const PROGRESS_INTERVAL_MS = 100;

let cancelled = false;
/** The last analyzed project, kept for the reader and asset previews. */
let project: Project | null = null;
let dialogue: DialogueLine[] | null = null;

const api: AnalysisWorkerApi = {
  async analyze(files, onProgress, onDiagnostics) {
    cancelled = false;
    project = null;
    dialogue = null;
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
      const result = await analyzeFiles(
        files.map((f) => new BlobFileSource(f.path, f.file)),
        {
          onProgress: report,
          onDiagnostics: (ds) => {
            if (ds.length > 0) onDiagnostics(ds);
          },
          isCancelled: () => cancelled,
        },
      );
      project = result.project;
      return result.report;
    } catch (error) {
      if (error instanceof AnalysisCancelled) throw new Error('cancelled', { cause: error });
      throw error;
    }
  },
  cancel() {
    cancelled = true;
  },
  outline() {
    return project ? scriptOutline(project) : [];
  },
  readLabel(name) {
    return project ? readLabel(project, name) : null;
  },
  dialogue() {
    if (!project) return [];
    dialogue ??= dialogueDump(project);
    return dialogue;
  },
  search(query, limit) {
    return searchText(api.dialogue(), query, limit);
  },
  openAsset(path) {
    const entry = project?.vfs.entries.find((e) => e.path === path);
    return entry ? blobOf(entry.source, path) : null;
  },
};

Comlink.expose(api);
