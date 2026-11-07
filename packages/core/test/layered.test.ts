import { fixturePath, walkDirectory } from '@phanes/testkit';
import { describe, expect, it } from 'vitest';
import {
  analyzeFiles,
  type AssetsResult,
  type CharactersResult,
  characterImages,
  type InventoryResult,
  type VariablesResult,
} from '../src';

/**
 * fixtures/games/phanes_layers (Ren'Py 7+): two layered images, shown by
 * `show` statements and by say attributes. Rules in docs/analyses.md.
 */
for (const sdk of ['7.4.11', '8.3.7', '8.5.3'] as const) {
  for (const layout of ['project', 'dist'] as const) {
    describe(`layered images of the Ren'Py ${sdk} ${layout}`, async () => {
      const { report } = await analyzeFiles(
        await walkDirectory(fixturePath('build', sdk, 'phanes_layers', layout)),
      );
      const assets = report.analyses.assets as AssetsResult;
      const byName = Object.fromEntries(assets.images.entries.map((i) => [i.name, i]));
      const lines = (name: string) => byName[name]?.displays.map((d) => d.loc.line) ?? null;

      it('declares their attributes, explicit, derived and auto', () => {
        expect(byName.eileen).toMatchObject({
          declaration: 'layered',
          tag: 'eileen',
          attributes: [],
          category: 'sprite',
          loc: { file: 'game/script.rpy', line: 7 },
          file: null,
        });
        expect(byName.eileen?.layered).toEqual({
          attributes: [
            {
              name: 'casual',
              group: 'outfit',
              default: true,
              auto: false,
              image: 'eileen_casual',
              found: true,
            },
            {
              name: 'dress',
              group: 'outfit',
              default: false,
              auto: false,
              image: 'eileen_outfit_dress',
              found: true,
            },
            {
              name: 'hat',
              group: 'outfit',
              default: false,
              auto: false,
              image: 'eileen_outfit_hat',
              found: false,
            },
            {
              name: 'happy',
              group: 'face',
              default: true,
              auto: false,
              image: 'eileen_face_happy',
              found: true,
            },
            {
              name: 'sad',
              group: 'face',
              default: false,
              auto: true,
              image: 'eileen_face_sad',
              found: true,
            },
          ],
          always: ['eileen_base'],
          conditions: [{ condition: 'persistent.glasses', image: 'eileen_glasses' }],
          parts: [
            'eileen_base',
            'eileen_casual',
            'eileen_face_happy',
            'eileen_face_sad',
            'eileen_glasses',
            'eileen_outfit_dress',
          ],
        });
        expect(byName['lucy far']).toMatchObject({ tag: 'lucy', attributes: ['far'] });
        expect(byName['lucy far']?.layered?.attributes.map((a) => a.image)).toEqual([
          'lucy_far_smile',
        ]);
      });

      it('shows the layers of the attributes asked for, and the defaults', () => {
        expect(lines('eileen')).toEqual([27, 29, 30]);
        // always and if layers: every time.
        expect(lines('eileen_base')).toEqual([27, 29, 30]);
        expect(lines('eileen_glasses')).toEqual([27, 29, 30]);
        // `show eileen dress` replaces the default of its group only.
        expect(lines('eileen_casual')).toEqual([27, 30]);
        expect(lines('eileen_outfit_dress')).toEqual([29]);
        // `e sad "Oh."`: say attributes of the image tag; sad replaces happy.
        expect(lines('eileen_face_happy')).toEqual([27, 29]);
        expect(lines('eileen_face_sad')).toEqual([30]);
        expect(lines('lucy_far_smile')).toEqual([31]);
        expect(lines('eileen_outfit_swimsuit')).toEqual([]);
      });

      it('reports unknown attributes', () => {
        expect(assets.images.missing).toEqual([
          expect.objectContaining({ name: 'eileen cape', reason: 'undeclared' }),
        ]);
        expect(assets.images.missing[0]?.site.loc.line).toBe(32);
      });

      it('counts the layers as the character’s sprites and reads their conditions', () => {
        const characters = report.analyses.characters as CharactersResult;
        const inventory = report.analyses.inventory as InventoryResult;
        const eileen = characters.characters.find((c) => c.id === 'e');
        if (!eileen) throw new Error('no character e');
        const images = characterImages(eileen, assets.images.entries, inventory.entries);
        expect(images.sprites.map((i) => i.name)).toEqual([
          'eileen',
          'eileen_base',
          'eileen_casual',
          'eileen_face_happy',
          'eileen_face_sad',
          'eileen_glasses',
          'eileen_outfit_dress',
        ]);
        expect(images.portrait?.name).toBe('eileen_base');
        const variables = report.analyses.variables as VariablesResult;
        const glasses = variables.variables.find((v) => v.name === 'persistent.glasses');
        expect(glasses?.reads.map((r) => [r.loc.line, r.context])).toEqual([[7, 'image']]);
      });
    });
  }
}
