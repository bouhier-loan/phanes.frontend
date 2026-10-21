import { fixturePath, readFixtureJson, walkDirectory } from '@phanes/testkit';
import { describe, expect, it } from 'vitest';
import {
  analyzeFiles,
  type CharactersResult,
  type LabelsResult,
  type OverviewResult,
} from '../src';

interface ExpectedStats {
  title: string;
  gameVersion: string;
  labels: number;
  dialogue: OverviewResult['dialogue'];
  readingTimeMinutes: number;
  languages: string[];
  characters: Record<
    string,
    {
      name: string | null;
      origin: string;
      kind?: string;
      dynamic?: boolean;
      lines: number;
      words: number;
      color?: string;
      imageTag?: string;
      labels?: number;
      linesByFile?: { file: string; lines: number }[];
      firstText?: string;
    }
  >;
  labelStats: Record<string, { line: number; lines: number; words: number }>;
}

const expected = await readFixtureJson<ExpectedStats>('expected', 'phanes_demo.stats.json');

const VERSIONS: Record<string, { dist: string; project: string; python: 2 | 3 }> = {
  '6.99.14.3': { dist: '6.99.14.3.3347', project: '6.99.14.3.3347', python: 2 },
  '7.4.11': { dist: '7.4.11.2266', project: '7.4.11.2266', python: 2 },
  '8.3.7': { dist: '8.3.7.25031702', project: '8.3.7.25031702', python: 3 },
  '8.5.3': { dist: '8.5.3.26051504', project: '8.5.3.26051504', python: 3 },
};

for (const [sdk, version] of Object.entries(VERSIONS)) {
  for (const layout of ['project', 'dist'] as const) {
    describe(`statistics of the Ren'Py ${sdk} ${layout}`, async () => {
      const { report } = await analyzeFiles(
        await walkDirectory(fixturePath('build', sdk, 'phanes_demo', layout)),
      );
      const overview = report.analyses.overview as OverviewResult;
      const characters = report.analyses.characters as CharactersResult;
      const labels = report.analyses.labels as LabelsResult;

      it('has no diagnostics', () => {
        expect(report.diagnostics).toEqual([]);
      });

      it('overview matches the hand count', () => {
        expect(overview.title).toBe(expected.title);
        expect(overview.gameVersion).toBe(expected.gameVersion);
        expect(overview.labels).toBe(expected.labels);
        expect(overview.dialogue).toEqual(expected.dialogue);
        expect(overview.readingTimeMinutes).toBe(expected.readingTimeMinutes);
        expect(overview.languages).toEqual(expected.languages);
        expect(overview.scripts).toEqual({ compiled: 6, decoded: 6, failed: 0, sourceOnly: 0 });
      });

      it('detects the Ren’Py version', () => {
        expect(overview.renpy.version).toBe(version[layout]);
        expect(overview.renpy.confidence).toBe('exact');
        expect(overview.renpy.source).toBe(
          layout === 'project' ? 'log' : sdk.startsWith('8') ? 'vc_version' : 'version_tuple',
        );
        expect(overview.renpy.python).toBe(version.python);
      });

      it('characters match the hand count', () => {
        const byId = Object.fromEntries(characters.characters.map((c) => [c.id, c]));
        expect(Object.keys(byId).sort()).toEqual(Object.keys(expected.characters).sort());
        for (const [id, want] of Object.entries(expected.characters)) {
          expect(byId[id], id).toMatchObject(want);
        }
        expect(characters.totals.lines).toBe(expected.dialogue.lines);
        expect(characters.totals.words).toBe(expected.dialogue.words);
      });

      it('labels match the hand count', () => {
        const byName = Object.fromEntries(labels.labels.map((l) => [l.name, l]));
        expect(Object.keys(byName).sort()).toEqual(Object.keys(expected.labelStats).sort());
        for (const [name, want] of Object.entries(expected.labelStats)) {
          expect(byName[name], name).toMatchObject(want);
        }
        expect(byName['park.bench']).toMatchObject({ local: true, parent: 'park' });
        expect(labels.duplicates).toEqual([]);
      });
    });
  }
}
