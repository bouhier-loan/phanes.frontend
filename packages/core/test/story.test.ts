import { fixturePath, readFixtureJson, walkDirectory } from '@phanes/testkit';
import { describe, expect, it } from 'vitest';
import {
  analyzeFiles,
  type AssetsResult,
  type Location,
  type MenusResult,
  type StoryGraphResult,
  type TranslationsResult,
  type VariablesResult,
} from '../src';

interface ExpectedStory {
  storyGraph: {
    entry: string;
    edges: [string | null, string, string, string | null, boolean][];
    dynamic: { expression: string; resolved: string; line: number }[];
    broken: { target: string; file: string; line: number; label: string }[];
    unreachable: string[];
    endings: string[];
    returns: string[];
    speakers: Record<string, string[]>;
  };
  menus: {
    totals: MenusResult['totals'];
    menu: {
      id: string;
      label: string;
      prompt: { who: string | null; text: string };
      options: { text: string; condition: string | null; targets: string[]; lines: number }[];
    };
  };
  variables: {
    totals: VariablesResult['totals'];
    sites: Record<string, { writes: string[]; reads: string[] }>;
  };
  assets: {
    images: {
      totals: AssetsResult['images']['totals'];
      entries: Record<string, [string, string, number]>;
    };
    audio: { totals: AssetsResult['audio']['totals']; plays: Record<string, string[]> };
    video: { totals: AssetsResult['video']['totals'] };
  };
  translations: Pick<TranslationsResult, 'default' | 'languages'>;
}

const expected = await readFixtureJson<ExpectedStory>('expected', 'phanes_demo.story.json');
const SDKS = ['6.99.14.3', '7.4.11', '8.3.7', '8.5.3'] as const;
const at = (loc: Location) => `${loc.file}:${loc.line}`;

for (const sdk of SDKS) {
  for (const layout of ['project', 'dist'] as const) {
    describe(`story analyses of the Ren'Py ${sdk} ${layout}`, async () => {
      const { report } = await analyzeFiles(
        await walkDirectory(fixturePath('build', sdk, 'phanes_demo', layout)),
      );
      const graph = report.analyses.storyGraph as StoryGraphResult;
      const menus = report.analyses.menus as MenusResult;
      const variables = report.analyses.variables as VariablesResult;
      const assets = report.analyses.assets as AssetsResult;
      const translations = report.analyses.translations as TranslationsResult;

      it('runs every analysis without diagnostics', () => {
        expect(report.diagnostics).toEqual([]);
      });

      it('builds the story graph', () => {
        const want = expected.storyGraph;
        expect(graph.entry).toBe(want.entry);
        expect(
          graph.edges.map((e) => [e.from, e.to, e.kind, e.choice?.text ?? null, e.conditional]),
        ).toEqual(want.edges);
        expect(graph.edges.find((e) => e.dynamic)?.to).toBe('bad_ending');
        expect(
          graph.dynamic.map((d) => ({
            expression: d.expression,
            resolved: d.resolved,
            line: d.loc.line,
          })),
        ).toEqual(want.dynamic);
        expect(
          graph.broken.map((b) => ({
            target: b.target,
            file: b.loc.file,
            line: b.loc.line,
            label: b.label,
          })),
        ).toEqual(want.broken);
        expect(graph.unreachable).toEqual(want.unreachable);
        expect(graph.endings).toEqual(want.endings);
        expect(graph.nodes.filter((n) => n.returns).map((n) => n.name)).toEqual(want.returns);
        const byName = Object.fromEntries(graph.nodes.map((n) => [n.name, n]));
        for (const [label, speakers] of Object.entries(want.speakers))
          expect(byName[label]?.speakers, label).toEqual(speakers);
      });

      it('lists the menus', () => {
        const want = expected.menus;
        expect(menus.totals).toEqual(want.totals);
        const [menu] = menus.menus;
        expect(menu).toMatchObject({
          id: want.menu.id,
          label: want.menu.label,
          prompt: want.menu.prompt,
        });
        expect(
          menu?.options.map((o) => ({
            text: o.text,
            condition: o.condition,
            targets: o.targets.map((t) => `${t.kind} ${t.target}`),
            lines: o.lines,
          })),
        ).toEqual(want.menu.options);
      });

      it('finds where variables are modified and read', () => {
        const want = expected.variables;
        expect(variables.totals).toEqual(want.totals);
        const byName = Object.fromEntries(variables.variables.map((v) => [v.name, v]));
        for (const [name, sites] of Object.entries(want.sites)) {
          expect(
            byName[name]?.writes.map((s) => at(s.loc)),
            name,
          ).toEqual(sites.writes);
          expect(
            byName[name]?.reads.map((s) => at(s.loc)),
            name,
          ).toEqual(sites.reads);
        }
      });

      it('compares declared and displayed assets', () => {
        const want = expected.assets;
        expect(assets.images.totals).toEqual(want.images.totals);
        expect(
          Object.fromEntries(
            assets.images.entries.map((i) => [
              i.name,
              [i.declaration, i.category, i.displays.length],
            ]),
          ),
        ).toEqual(want.images.entries);
        for (const image of assets.images.entries) expect(image.file, image.name).not.toBeNull();
        expect(assets.audio.totals).toEqual(want.audio.totals);
        expect(
          Object.fromEntries(
            assets.audio.files.map((f) => [f.file.gamePath, f.plays.map((p) => p.channel)]),
          ),
        ).toEqual(want.audio.plays);
        expect(assets.video.totals).toEqual(want.video.totals);
      });

      it('measures translation coverage', () => {
        expect(translations.available).toBe(true);
        expect(translations.partial).toBe(false);
        expect(translations.default).toEqual(expected.translations.default);
        expect(translations.languages).toEqual(expected.translations.languages);
      });
    });
  }
}
