import { analyzeFiles, FILE_KINDS, inventoryAnalysis, type InventoryResult } from '@phanes/core';
import { walkDirectory } from '@phanes/testkit';
import { formatBytes, table } from '../format';

export async function inventoryCommand(path: string, json: boolean): Promise<string> {
  const { report } = await analyzeFiles(await walkDirectory(path), {
    analyses: [inventoryAnalysis],
  });
  if (json) return JSON.stringify(report, null, 2);
  const inv = report.analyses.inventory as InventoryResult;
  const lines = [
    `Game directory: ${inv.gameDir || '(root)'}`,
    `Files on disk: ${inv.totals.files} (${formatBytes(inv.totals.bytes)}), archives: ${inv.totals.archives}, archive entries: ${inv.totals.archiveEntries}, shadowed: ${inv.totals.shadowed}`,
    '',
    table([
      ['kind', 'count', 'size'],
      ...FILE_KINDS.filter((k) => inv.byKind[k].count > 0).map((k) => [
        k,
        String(inv.byKind[k].count),
        formatBytes(inv.byKind[k].bytes),
      ]),
    ]),
  ];
  if (inv.archives.length > 0) {
    lines.push(
      '',
      table([
        ['archive', 'version', 'entries', 'size', 'error'],
        ...inv.archives.map((a) => [
          a.path,
          a.version ?? '?',
          String(a.entryCount),
          formatBytes(a.size),
          a.error ?? '',
        ]),
      ]),
    );
  }
  if (report.diagnostics.length > 0) {
    lines.push(
      '',
      'Diagnostics:',
      ...report.diagnostics.map((d) => `  [${d.severity}] ${d.code} ${d.path ?? ''}: ${d.message}`),
    );
  }
  return lines.join('\n');
}
