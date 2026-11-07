import { CORPUS, fixturePath, openCorpus } from '@phanes/testkit';
import { describe, expect, it } from 'vitest';
import {
  analyzeFiles,
  type AssetsResult,
  type CharactersResult,
  type Location,
  type MenusResult,
  type OverviewResult,
  type Report,
  type StoryGraphResult,
  type TranslationsResult,
  type VariablesResult,
} from '../src';

/**
 * Full analyses of the games shipped with the pinned SDKs (fixtures/corpus).
 * Nothing may fail, and a summary of what they find is kept next to the
 * corpus: a reviewable record of false positives and of the improvements
 * that remove them (`pnpm test -u` rewrites it after a deliberate change).
 */
const at = (loc: Location) => `${loc.file}:${loc.line}`;
const sorted = (values: Iterable<string>) => [...values].sort();

function countBy(values: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of [...values].sort()) out[v] = (out[v] ?? 0) + 1;
  return out;
}

function summary(report: Report) {
  const a = report.analyses;
  const overview = a.overview as OverviewResult;
  const characters = a.characters as CharactersResult;
  const graph = a.storyGraph as StoryGraphResult;
  const menus = a.menus as MenusResult;
  const variables = a.variables as VariablesResult;
  const assets = a.assets as AssetsResult;
  const translations = a.translations as TranslationsResult;
  const plain = variables.variables.filter((v) => !v.character && !v.engine);
  const unknown = new Map<string, number>();
  for (const d of report.diagnostics)
    if (d.code === 'AST_UNKNOWN_NODE') {
      const name = String(d.details?.className);
      unknown.set(name, (unknown.get(name) ?? 0) + Number(d.details?.count ?? 0));
    }
  const unknownNodes = Object.fromEntries([...unknown].sort(([x], [y]) => (x < y ? -1 : 1)));
  return {
    renpy: {
      version: overview.renpy.version,
      confidence: overview.renpy.confidence,
      python: overview.renpy.python,
    },
    title: overview.title,
    scripts: overview.scripts,
    labels: overview.labels,
    dialogue: overview.dialogue,
    languages: overview.languages,
    diagnostics: countBy(report.diagnostics.map((d) => `${d.severity} ${d.code}`)),
    unknownNodes,
    characters: characters.characters.map((c) => `${c.id} ${c.origin} ${c.lines}`),
    graph: {
      endings: graph.endings,
      unreachable: graph.unreachable,
      broken: graph.broken.map((b) => `${b.target} @ ${at(b.loc)}`),
      dynamic: graph.dynamic.map((d) => `${d.expression} @ ${at(d.loc)}`),
    },
    menus: menus.totals,
    variables: {
      totals: variables.totals,
      neverRead: sorted(plain.filter((v) => v.reads.length === 0).map((v) => v.name)),
      neverWritten: sorted(
        variables.variables
          .filter((v) => v.kind === 'default' && !v.character && v.writes.length === 0)
          .map((v) => v.name),
      ),
    },
    images: {
      totals: assets.images.totals,
      neverDisplayed: assets.images.entries
        .filter((i) => i.displays.length === 0)
        .map((i) => i.name),
      missing: assets.images.missing.map((m) => `${m.name} (${m.reason}) @ ${at(m.site.loc)}`),
      dynamic: assets.images.dynamic.length,
    },
    audio: {
      totals: assets.audio.totals,
      neverPlayed: assets.audio.files
        .filter((f) => f.plays.length === 0)
        .map((f) => f.file.gamePath),
      missing: assets.audio.missing.map((m) => `${m.file ?? '?'} @ ${at(m.loc)}`),
    },
    video: assets.video.totals,
    translations: translations.languages.map(
      (l) =>
        `${l.language}: ${l.dialogue.translated}/${l.dialogue.total} lines, ` +
        `${l.strings.translated}/${l.strings.total} strings (+${l.strings.extra}), ` +
        `${l.orphans.length} orphans`,
    ),
  };
}

for (const { sdk, game } of CORPUS) {
  describe(`analyses of ${game} (Ren'Py ${sdk})`, async () => {
    const { report } = await analyzeFiles(await openCorpus(sdk, game), {
      now: () => new Date(0),
    });

    it('decodes every script and runs every analysis', () => {
      expect(report.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      expect(report.diagnostics.filter((d) => d.code === 'ANALYSIS_FAILED')).toEqual([]);
      const overview = report.analyses.overview as OverviewResult;
      expect(overview.scripts.failed).toBe(0);
    });

    it('finds the exact Ren’Py version', () => {
      const overview = report.analyses.overview as OverviewResult;
      expect(overview.renpy.version?.startsWith(sdk)).toBe(true);
      expect(overview.renpy.confidence).toBe('exact');
    });

    it('matches the recorded summary', async () => {
      await expect(`${JSON.stringify(summary(report), null, 2)}\n`).toMatchFileSnapshot(
        fixturePath('expected', 'corpus', sdk, game, 'summary.json'),
      );
    });
  });
}
