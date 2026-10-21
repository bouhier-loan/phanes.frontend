import {
  analyzeFiles,
  type AssetsResult,
  type CharactersResult,
  type LabelsResult,
  type MenusResult,
  type OverviewResult,
  type StoryGraphResult,
  type TranslationsResult,
  type VariablesResult,
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
  const graph = report.analyses.storyGraph as StoryGraphResult | undefined;
  const menus = report.analyses.menus as MenusResult | undefined;
  const variables = report.analyses.variables as VariablesResult | undefined;
  const assets = report.analyses.assets as AssetsResult | undefined;
  const translations = report.analyses.translations as TranslationsResult | undefined;
  if (graph)
    lines.push(
      `Graph: entry ${graph.entry ?? '-'}, endings: ${graph.endings.join(', ') || '-'}, unreachable: ${graph.unreachable.join(', ') || '-'}, broken: ${graph.broken.map((b) => b.target).join(', ') || '-'}`,
    );
  if (menus)
    lines.push(
      `Menus: ${menus.totals.menus}, options: ${menus.totals.options}, conditional: ${menus.totals.conditional}`,
    );
  if (variables)
    lines.push(
      `Variables: ${variables.totals.variables} (${variables.totals.default} default, ${variables.totals.define} define), never read: ${variables.totals.neverRead}, never written: ${variables.totals.neverWritten}`,
    );
  if (assets) {
    const i = assets.images.totals;
    const a = assets.audio.totals;
    lines.push(
      `Images: ${i.declared} declared (${i.automatic} automatic), ${i.displayed} displayed, ${i.neverDisplayed} never, ${i.missing} missing; audio: ${a.files} files, ${a.played} played, ${a.missing} missing; video: ${assets.video.totals.files}`,
    );
  }
  if (translations)
    for (const l of translations.languages)
      lines.push(
        `Translation ${l.language}: ${l.dialogue.translated}/${l.dialogue.total} lines, ${l.strings.translated}/${l.strings.total} strings, ${l.orphans.length} orphans`,
      );
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
