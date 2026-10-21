import {
  analyzeFiles,
  type CharactersResult,
  type LabelsResult,
  type OverviewResult,
} from '@phanes/core';
import { walkDirectory } from '@phanes/testkit';
import { table } from '../format';

export async function analyzeCommand(path: string, json: boolean): Promise<string> {
  const { report } = await analyzeFiles(await walkDirectory(path));
  if (json) return JSON.stringify(report, null, 2);
  const overview = report.analyses.overview as OverviewResult | undefined;
  const characters = report.analyses.characters as CharactersResult | undefined;
  const labels = report.analyses.labels as LabelsResult | undefined;
  const lines: string[] = [];
  if (overview) {
    const r = overview.renpy;
    lines.push(
      `Title: ${overview.title ?? '?'} ${overview.gameVersion ?? ''}`.trimEnd(),
      `Ren'Py: ${r.version ?? '?'} (${r.confidence ?? 'unknown'}, ${r.source ?? '-'}), Python ${r.python ?? '?'}`,
      `Scripts: ${overview.scripts.decoded}/${overview.scripts.compiled} decoded, ${overview.scripts.sourceOnly} source-only`,
      `Labels: ${overview.labels}, lines: ${overview.dialogue.lines}, words: ${overview.dialogue.words}, menus: ${overview.dialogue.menus}, choices: ${overview.dialogue.choices}`,
      `Reading time: ${overview.readingTimeMinutes} min, languages: ${overview.languages.join(', ') || '-'}`,
    );
  }
  if (characters) {
    lines.push(
      '',
      table([
        ['speaker', 'name', 'origin', 'lines', 'words'],
        ...characters.characters.map((c) => [
          c.id,
          c.name ?? '',
          c.origin + (c.kind === 'nvl' ? ' (nvl)' : ''),
          String(c.lines),
          String(c.words),
        ]),
      ]),
    );
  }
  if (labels) {
    lines.push(
      '',
      table([
        ['label', 'file', 'line', 'lines', 'words'],
        ...labels.labels.map((l) => [
          l.name,
          l.file,
          String(l.line),
          String(l.lines),
          String(l.words),
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
