import type { OverviewResult, Report } from '@phanes/core';

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

/** Saves the report as a JSON file. The blob: URL never leaves the page. */
export function downloadReport(report: Report): void {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = reportFileName(report);
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}
