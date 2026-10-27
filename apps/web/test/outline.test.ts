import type { ScriptOutline } from '@phanes/core';
import { describe, expect, it } from 'vitest';
import { outlineFolders } from '../src/ui/sections/outline';

function file(path: string): ScriptOutline[number] {
  return { file: path, labels: [] };
}

describe('script outline folders', () => {
  it('groups files by folder, game/ itself first, in outline order', () => {
    const folders = outlineFolders([
      file('game/code/2_priority_code/main.rpy'),
      file('game/code/2_priority_code/prologue.rpy'),
      file('game/code/3_rpg_system/-card_battle-/card_battle.rpy'),
      file('game/script.rpy'),
      file('game/story/extra.rpy'),
      file('game/zz.rpy'),
    ]);
    expect(folders.map((f) => [f.dir, f.files.map((x) => x.file)])).toEqual([
      ['', ['game/script.rpy', 'game/zz.rpy']],
      [
        'code/2_priority_code',
        ['game/code/2_priority_code/main.rpy', 'game/code/2_priority_code/prologue.rpy'],
      ],
      ['code/3_rpg_system/-card_battle-', ['game/code/3_rpg_system/-card_battle-/card_battle.rpy']],
      ['story', ['game/story/extra.rpy']],
    ]);
  });

  it('keeps folders outside game/ as they are', () => {
    expect(outlineFolders([file('other/a.rpy')]).map((f) => f.dir)).toEqual(['other']);
  });
});
