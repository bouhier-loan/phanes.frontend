import { performance } from 'node:perf_hooks';
import {
  buildVfs,
  DEFAULT_ANALYSES,
  dialogueIndex,
  hasTranslations,
  loadScripts,
  loadTexts,
  loadTranslationIds,
  type Project,
  walkStatements,
} from '@phanes/core';
import type { FileSource } from '@phanes/renpy-formats';
import { walkDirectory } from '@phanes/testkit';
import { formatBytes, table } from '../format';

export type BenchStep = {
  /** "vfs", "scripts", "translation ids", "version files", "dialogue index", "analysis <id>". */
  name: string;
  /** Median and fastest time over the runs, in milliseconds. */
  medianMs: number;
  minMs: number;
};

export type BenchResult = {
  files: number;
  bytes: number;
  /** Compiled scripts decoded, their total size, and their statements. */
  scripts: { count: number; bytes: number; statements: number };
  runs: number;
  steps: BenchStep[];
  total: { medianMs: number; minMs: number };
};

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] ?? 0)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/**
 * Times each step of the pipeline (loading, then every analysis on its own)
 * over `runs` fresh runs. The dialogue index, shared by most analyses, is
 * built and timed before them.
 */
export async function bench(files: readonly FileSource[], runs: number): Promise<BenchResult> {
  const times = new Map<string, number[]>();
  const totals: number[] = [];
  let scripts = { count: 0, bytes: 0, statements: 0 };
  const timed = async <T>(name: string, fn: () => T | Promise<T>): Promise<T> => {
    const start = performance.now();
    const value = await fn();
    times.set(name, [...(times.get(name) ?? []), performance.now() - start]);
    return value;
  };
  for (let run = 0; run < runs; run++) {
    const start = performance.now();
    const built = await timed('vfs', () => buildVfs(files));
    const loaded = await timed('scripts', () => loadScripts(built.vfs));
    const translations = hasTranslations(loaded.scripts)
      ? await timed('translation ids', () => loadTranslationIds(built.vfs, loaded.scripts))
      : null;
    const texts = await timed('version files', () => loadTexts(built.vfs));
    const project: Project = {
      vfs: built.vfs,
      scripts: loaded.scripts,
      texts,
      diagnostics: [],
      translationIds: translations?.translationIds ?? null,
    };
    await timed('dialogue index', () => dialogueIndex(project));
    for (const analysis of DEFAULT_ANALYSES)
      await timed(`analysis ${analysis.id}`, () => analysis.run(project));
    totals.push(performance.now() - start);
    if (run === 0) {
      const sizes = new Map(built.vfs.entries.map((e) => [e.path, e.size]));
      let statements = 0;
      walkStatements(loaded.scripts, () => statements++);
      scripts = {
        count: loaded.scripts.length,
        bytes: loaded.scripts.reduce((sum, s) => sum + (sizes.get(s.path) ?? 0), 0),
        statements,
      };
    }
  }
  return {
    files: files.length,
    bytes: files.reduce((sum, f) => sum + f.size, 0),
    scripts,
    runs,
    steps: [...times.entries()].map(([name, values]) => ({
      name,
      medianMs: median(values),
      minMs: Math.min(...values),
    })),
    total: { medianMs: median(totals), minMs: Math.min(...totals) },
  };
}

const ms = (value: number) => `${value.toFixed(1)} ms`;

export async function benchCommand(path: string, json: boolean, runs: number): Promise<string> {
  const result = await bench(await walkDirectory(path), runs);
  if (json) return JSON.stringify(result, null, 2);
  const s = result.scripts;
  return [
    `Files: ${result.files} (${formatBytes(result.bytes)}), scripts: ${s.count} (${formatBytes(s.bytes)}), statements: ${s.statements}`,
    `Runs: ${result.runs}, total: ${ms(result.total.medianMs)} median, ${ms(result.total.minMs)} min`,
    '',
    table([
      ['step', 'median', 'min', 'share'],
      ...result.steps.map((step) => [
        step.name,
        ms(step.medianMs),
        ms(step.minMs),
        `${((step.medianMs / result.total.medianMs) * 100).toFixed(1)} %`,
      ]),
    ]),
  ].join('\n');
}
