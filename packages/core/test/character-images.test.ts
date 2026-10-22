import { fixturePath, walkDirectory } from '@phanes/testkit';
import { describe, expect, it } from 'vitest';
import {
  analyzeFiles,
  type AssetsResult,
  type CharactersResult,
  characterImageKeys,
  characterImages,
  type ImageAsset,
  type InventoryEntry,
  type InventoryResult,
} from '../src';

const { report } = await analyzeFiles(
  await walkDirectory(fixturePath('build', '8.5.3', 'phanes_demo', 'dist')),
);
const assets = report.analyses.assets as AssetsResult;
const inventory = report.analyses.inventory as InventoryResult;
const characters = report.analyses.characters as CharactersResult;

function imagesOf(id: string) {
  const character = characters.characters.find((c) => c.id === id);
  if (!character) throw new Error(`no character ${id}`);
  return characterImages(character, assets.images.entries, inventory.entries);
}

function image(name: string, displays = 0, file: string | null = `images/${name}.png`): ImageAsset {
  const [tag = '', ...attributes] = name.split(' ');
  return {
    name,
    tag,
    attributes,
    category: 'other',
    declaration: 'automatic',
    loc: null,
    value: null,
    file: file === null ? null : { path: `G/game/${file}`, gamePath: file, size: 1, archive: null },
    missingFile: null,
    movie: null,
    displays: Array.from({ length: displays }, () => ({
      loc: { file: 'game/script.rpy', line: 1 },
      label: null,
      code: `show ${name}`,
    })),
  };
}

function file(gamePath: string): InventoryEntry {
  return {
    path: `G/game/${gamePath}`,
    gamePath,
    size: 1,
    kind: 'image',
    zone: 'game',
    archive: null,
    shadowedBy: null,
  };
}

describe('character images', () => {
  it('derives image tags from the definition', () => {
    expect(
      characterImageKeys({ imageTag: 'Lucy', name: 'Lucy', dynamic: false, variable: 'l' }),
    ).toEqual([{ key: 'lucy', match: 'image' }]);
    expect(
      characterImageKeys({ imageTag: null, name: 'Éloïse Marie', dynamic: false, variable: 'em' }),
    ).toEqual([
      { key: 'eloise_marie', match: 'name' },
      { key: 'eloisemarie', match: 'name' },
      { key: 'eloise', match: 'name' },
      { key: 'em', match: 'variable' },
    ]);
    expect(
      characterImageKeys({ imageTag: null, name: '[player]', dynamic: true, variable: 'p' }),
    ).toEqual([]);
  });

  it('finds the sprites of the demo characters', () => {
    const eileen = imagesOf('e');
    expect(eileen.sprites.map((i) => i.name)).toEqual(['eileen happy']);
    expect(eileen.matched).toEqual([{ key: 'eileen', match: 'name' }]);
    expect(eileen.portrait?.name).toBe('eileen happy');
    const lucy = imagesOf('l');
    expect(lucy.sprites.map((i) => i.name)).toEqual(['lucy smile']);
    expect(lucy.matched).toEqual([{ key: 'lucy', match: 'image' }]);
    expect(lucy.portrait?.path).toMatch(/images\/lucy smile\.png$/);
    const sylvie = imagesOf('s');
    expect([sylvie.sprites, sylvie.side, sylvie.files, sylvie.portrait]).toEqual([
      [],
      [],
      [],
      null,
    ]);
  });

  it('adds side images and files named after the character', () => {
    const images = [
      image('mc happy', 1),
      image('mc sad', 3),
      image('side mc', 0),
      image('bg mcroom', 2, 'images/mc/bg mcroom.png'),
      image('e smile', 1),
    ];
    const files = [
      file('images/mc happy.png'),
      file('images/mc/bg mcroom.png'),
      file('images/characters/mc/base.png'),
      file('images/layers/mc_outfit_red.png'),
      file('images/mcdonald.png'),
      file('images/e_smile.png'),
    ];
    const found = characterImages(
      { imageTag: null, name: null, dynamic: false, variable: 'mc' },
      images,
      files,
    );
    expect(found.sprites.map((i) => i.name)).toEqual(['mc happy', 'mc sad']);
    expect(found.side.map((i) => i.name)).toEqual(['side mc']);
    expect(found.files.map((f) => f.gamePath)).toEqual([
      'images/characters/mc/base.png',
      'images/layers/mc_outfit_red.png',
    ]);
    expect(found.portrait).toEqual({ path: 'G/game/images/mc sad.png', name: 'mc sad' });
    // A one-letter variable is not a key: `e smile` is not the character's.
    expect(
      characterImages({ imageTag: null, name: null, dynamic: false, variable: 'e' }, images, files)
        .portrait,
    ).toBeNull();
  });
});
