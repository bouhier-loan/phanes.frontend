import type { FileSource, RpaReadOptions } from '@phanes/renpy-formats';
import type { Analysis } from '../analyses/analysis';
import { inventoryAnalysis } from '../analyses/inventory';
import { type Diagnostic, diagnosticFromError } from '../model/diagnostic';
import type { Json } from '../model/json';
import type { Project } from '../model/project';
import { buildVfs } from '../vfs/vfs';
import { GENERATOR, type Report, REPORT_SCHEMA_VERSION } from './report';

export type AnalyzePhase = 'archives' | 'analyses' | 'done';

export interface AnalyzeProgress {
  readonly phase: AnalyzePhase;
  readonly done: number;
  readonly total: number;
  readonly current?: string;
}

export interface AnalyzeOptions {
  readonly analyses?: readonly Analysis[];
  readonly rpa?: RpaReadOptions;
  readonly onProgress?: (progress: AnalyzeProgress) => void;
  /** Clock, injectable for reproducible reports. */
  readonly now?: () => Date;
}

export const DEFAULT_ANALYSES: readonly Analysis[] = [inventoryAnalysis];

/** Loads the project (file tree, archives) without running analyses. */
export async function loadProject(
  files: readonly FileSource[],
  options: AnalyzeOptions = {},
): Promise<Project> {
  const { vfs, diagnostics } = await buildVfs(files, {
    ...(options.rpa ? { rpa: options.rpa } : {}),
    onProgress: (p) =>
      options.onProgress?.({ phase: 'archives', done: p.done, total: p.total, current: p.path }),
  });
  return { vfs, diagnostics };
}

/** Runs analyses; each failure is isolated and reported as a diagnostic. */
export function runAnalyses(
  project: Project,
  analyses: readonly Analysis[],
  onProgress?: (progress: AnalyzeProgress) => void,
): { results: Record<string, Json>; diagnostics: Diagnostic[] } {
  const results: Record<string, Json> = {};
  const diagnostics: Diagnostic[] = [];
  analyses.forEach((analysis, i) => {
    onProgress?.({ phase: 'analyses', done: i, total: analyses.length, current: analysis.id });
    try {
      results[analysis.id] = analysis.run(project);
    } catch (error) {
      const d = diagnosticFromError(error, analysis.id);
      diagnostics.push({
        ...d,
        code: 'ANALYSIS_FAILED',
        details: { analysis: analysis.id, cause: d.code },
      });
    }
  });
  return { results, diagnostics };
}

/** Full pipeline: load, analyze, build the report. */
export async function analyzeFiles(
  files: readonly FileSource[],
  options: AnalyzeOptions = {},
): Promise<{ report: Report; project: Project }> {
  const project = await loadProject(files, options);
  const analyses = options.analyses ?? DEFAULT_ANALYSES;
  const { results, diagnostics } = runAnalyses(project, analyses, options.onProgress);
  options.onProgress?.({ phase: 'done', done: analyses.length, total: analyses.length });
  const report: Report = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    generator: { ...GENERATOR },
    generatedAt: (options.now?.() ?? new Date()).toISOString(),
    input: {
      rootName: project.vfs.rootName,
      gameDir: project.vfs.gameDir,
      fileCount: files.length,
      totalBytes: files.reduce((sum, f) => sum + f.size, 0),
    },
    analyses: results,
    diagnostics: [...project.diagnostics, ...diagnostics],
  };
  return { report, project };
}
