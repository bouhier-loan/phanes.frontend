import { describe, expect, it } from 'vitest';
import { detectGameDir, kindOf, zoneOf } from '../src';

describe('kindOf', () => {
  it.each([
    ['game/script.rpy', 'script'],
    ['game/script.RPYC', 'compiled-script'],
    ['game/lib.rpymc', 'compiled-script'],
    ['game/story_ren.py', 'script'],
    ['game/archive.rpa', 'archive'],
    ['game/images/bg room.PNG', 'image'],
    ['game/audio/theme.opus', 'audio'],
    ['game/movie.webm', 'video'],
    ['game/fonts/a.otf', 'font'],
    ['renpy/ast.py', 'python'],
    ['README', 'other'],
    ['.hidden', 'other'],
  ])('%s is %s', (path, kind) => {
    expect(kindOf(path)).toBe(kind);
  });
});

describe('zoneOf', () => {
  it('classifies game, cache, saves, engine and other files', () => {
    expect(zoneOf('script.rpyc', 'game/script.rpyc')).toBe('game');
    expect(zoneOf('cache/bytecode-39.rpyb', 'game/cache/bytecode-39.rpyb')).toBe('cache');
    expect(zoneOf('saves/1-1-LT1.save', 'game/saves/1-1-LT1.save')).toBe('saves');
    expect(zoneOf(null, 'renpy/common/00start.rpy')).toBe('engine');
    expect(zoneOf(null, 'lib/py3-linux-x86_64/python')).toBe('engine');
    expect(zoneOf(null, 'MyGame.exe')).toBe('engine');
    expect(zoneOf(null, 'README.html')).toBe('outside');
  });
});

describe('detectGameDir', () => {
  it('finds the game directory of a distribution', () => {
    const r = detectGameDir([
      'MyGame-1.0-pc/game/scripts.rpa',
      'MyGame-1.0-pc/renpy/common/00start.rpyc',
      'MyGame-1.0-pc/lib/python',
    ]);
    expect(r).toEqual({ gameDir: 'MyGame-1.0-pc/game', ambiguous: [] });
  });

  it('finds the game directory inside a macOS bundle', () => {
    expect(detectGameDir(['X.app/Contents/Resources/autorun/game/script.rpyc']).gameDir).toBe(
      'X.app/Contents/Resources/autorun/game',
    );
  });

  it('prefers the shallowest game directory', () => {
    expect(detectGameDir(['A/game/minigame/game/x.rpyc', 'A/game/y.rpyc']).gameDir).toBe('A/game');
  });

  it('falls back to the drop root for loose files', () => {
    expect(detectGameDir(['script.rpyc', 'images.rpa']).gameDir).toBe('');
  });

  it('reports rival game directories', () => {
    const r = detectGameDir(['A/game/x.rpyc', 'B/game/y.rpyc']);
    expect(r.gameDir).toBe('A/game');
    expect(r.ambiguous).toEqual(['B/game']);
  });
});
