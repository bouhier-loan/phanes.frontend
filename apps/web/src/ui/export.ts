import type { DialogueLine, OverviewResult, Report } from '@phanes/core';

function slug(text: string): string {
  return (
    text
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase() || 'jeu'
  );
}

export function reportFileName(report: Report): string {
  const overview = report.analyses.overview as OverviewResult | undefined;
  const name = overview?.title ?? report.input.rootName ?? 'jeu';
  return `phanes-${slug(name)}-${report.generatedAt.slice(0, 10)}.json`;
}

export interface ExportOptions {
  /** Analysis keys to keep. */
  readonly analyses: ReadonlySet<string>;
  readonly diagnostics: boolean;
  /** Dialogue lines to add under "dialogue", or null. */
  readonly dialogue: readonly DialogueLine[] | null;
  readonly indent: boolean;
}

/** The exported JSON: the report with the chosen sections (docs/report-schema.md). */
export function exportJson(report: Report, options: ExportOptions): string {
  const analyses = Object.fromEntries(
    Object.entries(report.analyses).filter(([key]) => options.analyses.has(key)),
  );
  const value = {
    schemaVersion: report.schemaVersion,
    generator: report.generator,
    generatedAt: report.generatedAt,
    input: report.input,
    analyses,
    ...(options.diagnostics ? { diagnostics: report.diagnostics } : {}),
    ...(options.dialogue ? { dialogue: options.dialogue } : {}),
  };
  return JSON.stringify(value, null, options.indent ? 2 : undefined);
}

/** Saves text as a JSON file. The blob: URL never leaves the page. */
export function downloadJson(text: string, fileName: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}
