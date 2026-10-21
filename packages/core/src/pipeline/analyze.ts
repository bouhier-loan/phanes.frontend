import type { FileSource, RpaReadOptions, RpycOptions } from '@phanes/renpy-formats';
import type { Analysis } from '../analyses/analysis';
import { charactersAnalysis } from '../analyses/characters';
import { diagnosticsAnalysis } from '../analyses/diagnostics';
import { inventoryAnalysis } from '../analyses/inventory';
import { labelsAnalysis } from '../analyses/labels';
import { overviewAnalysis } from '../analyses/overview';
import { type Diagnostic, diagnosticFromError } from '../model/diagnostic';
import type { Json } from '../model/json';
import type { Project } from '../model/project';
import { buildVfs } from '../vfs/vfs';
import { hasTranslations, loadScripts, loadTexts, loadTranslationIds } from './scripts';
import { GENERATOR, type Report, REPORT_SCHEMA_VERSION } from './report';

export type AnalyzePhase = 'archives' | 'scripts' | 'translations' | 'analyses' | 'done';

export interface AnalyzeProgress {
  readonly phase: AnalyzePhase;
  readonly done: number;
  readonly total: number;
  readonly current?: string;
}

export interface AnalyzeOptions {
  readonly analyses?: readonly Analysis[];
  readonly rpa?: RpaReadOptions;
  readonly rpyc?: RpycOptions;
  readonly onProgress?: (progress: AnalyzeProgress) => void;
  /** Called with the diagnostics of each loading phase as soon as it ends. */
  readonly onDiagnostics?: (diagnostics: readonly Diagnostic[]) => void;
  /** Clock, injectable for reproducible reports. */
  readonly now?: () => Date;
  /** Polled between files; returning true stops the analysis with an AnalysisCancelled error. */
  readonly isCancelled?: () => boolean;
}

export class AnalysisCancelled extends Error {
  override readonly name = 'AnalysisCancelled';
  constructor() {
    super('analysis cancelled');
  }
}

export const DEFAULT_ANALYSES: readonly Analysis[] = [
  overviewAnalysis,
  inventoryAnalysis,
  charactersAnalysis,
  labelsAnalysis,
  diagnosticsAnalysis,
];

/** Loads the project: file tree, archive indexes, compiled scripts, version files. */
export async function loadProject(
  files: readonly FileSource[],
  options: AnalyzeOptions = {},
): Promise<Project> {
  const progress = (phase: AnalyzePhase) => (p: { done: number; total: number; path: string }) => {
    if (options.isCancelled?.()) throw new AnalysisCancelled();
    options.onProgress?.({ phase, done: p.done, total: p.total, current: p.path });
  };
  const built = await buildVfs(files, {
    ...(options.rpa ? { rpa: options.rpa } : {}),
    onProgress: progress('archives'),
  });
  options.onDiagnostics?.(built.diagnostics);
  const rpyc = options.rpyc ? { rpyc: options.rpyc } : {};
  const loaded = await loadScripts(built.vfs, { ...rpyc, onProgress: progress('scripts') });
  options.onDiagnostics?.(loaded.diagnostics);
  const translations = hasTranslations(loaded.scripts)
    ? await loadTranslationIds(built.vfs, loaded.scripts, {
        ...rpyc,
        onProgress: progress('translations'),
      })
    : null;
  if (translations) options.onDiagnostics?.(translations.diagnostics);
  const texts = await loadTexts(built.vfs);
  return {
    vfs: built.vfs,
    scripts: loaded.scripts,
    texts,
    diagnostics: [
      ...built.diagnostics,
      ...loaded.diagnostics,
      ...(translations?.diagnostics ?? []),
    ],
    translationIds: translations?.translationIds ?? null,
  };
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
  if (diagnostics.length > 0) options.onDiagnostics?.(diagnostics);
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
