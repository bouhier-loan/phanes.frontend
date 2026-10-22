import { describe, expect, it } from 'vitest';
import {
  assets,
  foldStringExpression,
  interpolatedNames,
  menus,
  pythonNames,
  storyGraph,
  translatableStrings,
  translations,
  variables,
} from '../src';
import { project, s, script } from './synthetic';

describe('python names', () => {
  const names = (code: string) => {
    const { reads, writes } = pythonNames(code);
    return { reads: reads.map((r) => r.name), writes: writes.map((w) => w.name) };
  };

  it('tells assignment targets from reads', () => {
    expect(names('a += b')).toEqual({ reads: ['b'], writes: ['a'] });
    expect(names('a, b = c, d')).toEqual({ reads: ['c', 'd'], writes: ['a', 'b'] });
    expect(names('x = y = z')).toEqual({ reads: ['z'], writes: ['x', 'y'] });
    expect(names('persistent.seen[i] = True')).toEqual({
      reads: ['i'],
      writes: ['persistent.seen'],
    });
    expect(names('for k in items: pass')).toEqual({ reads: ['items'], writes: ['k'] });
  });

  it('ignores strings, comments, keyword arguments and attribute tails', () => {
    expect(names('f("a + b", key=value) # c')).toEqual({ reads: ['f', 'value'], writes: [] });
    expect(names('x == 1 and not y')).toEqual({ reads: ['x', 'y'], writes: [] });
    expect(names('g().attr')).toEqual({ reads: ['g'], writes: [] });
  });

  it('numbers lines in multi-line code', () => {
    expect(pythonNames('a = 1\nb = a').reads).toEqual([{ name: 'a', line: 1 }]);
  });

  it('finds interpolations, constant strings and translation markers', () => {
    expect(interpolatedNames('Hi [name], [[not] [obj.attr!t]')).toEqual(['name', 'obj.attr']);
    expect(foldStringExpression('"bad" + "_ending"')).toBe('bad_ending');
    expect(foldStringExpression('"a" "b"')).toBe('ab');
    expect(foldStringExpression('"a" + x')).toBeNull();
    expect(foldStringExpression('f"{x}"')).toBeNull();
    expect(translatableStrings('Character(_("Lucy"), what=__("x"), y=obj._("no"))')).toEqual([
      'Lucy',
      'x',
    ]);
  });
});

describe('story graph rules', () => {
  it('falls through to the next label when a block completes', () => {
    const g = storyGraph(
      project([
        script([
          s.label(1, 'start', [s.say(2, null, 'a'), s.if(3, [['x', [s.jump(4, 'end')]]])]),
          s.label(5, 'middle', [
            s.if(6, [
              ['x', [s.jump(7, 'end')]],
              ['True', [s.ret(8)]],
            ]),
          ]),
          s.label(9, 'end', [s.while(10, 'True', [s.say(11, null, 'loop')])]),
          s.label(12, 'never', []),
          s.ret(13),
        ]),
      ]),
    );
    expect(g.edges.map((e) => `${e.from}>${e.to}:${e.kind}`)).toEqual([
      'start>end:jump',
      'start>middle:fallthrough',
      'middle>end:jump',
    ]);
    expect(g.unreachable).toEqual(['never']);
    expect(g.nodes.find((n) => n.name === 'middle')?.returns).toBe(true);
    // 'never' falls into the implicit return but is unreachable.
    expect(g.nodes.find((n) => n.name === 'never')?.returns).toBe(true);
    expect(g.endings).toEqual([]);
  });

  it('does not count a label only reached by call as an ending', () => {
    const g = storyGraph(
      project([
        script([
          s.label(1, 'start', [s.call(2, 'helper'), s.jump(3, 'fin')]),
          s.label(4, 'helper', [s.ret(5)]),
          s.label(6, 'fin', [s.ret(7)]),
          s.label(8, 'splashscreen', [s.ret(9)]),
        ]),
      ]),
    );
    expect(g.endings).toEqual(['fin']);
    expect(g.unreachable).toEqual([]);
  });

  it('resolves local jumps, flags broken and unresolved targets', () => {
    const g = storyGraph(
      project([
        script([
          s.label(1, 'start', [s.jump(2, '.next')]),
          s.label(3, 'start.next', [s.jump(4, 'nowhere')]),
          s.label(5, 'other', [s.jump(6, 'target_for(x)', true)]),
        ]),
      ]),
    );
    expect(g.edges.map((e) => e.to)).toEqual(['start.next']);
    expect(g.broken.map((b) => b.target)).toEqual(['nowhere']);
    expect(g.dynamic).toEqual([expect.objectContaining({ resolved: null, label: 'other' })]);
  });

  it('marks the jumps of menu choices', () => {
    const g = storyGraph(
      project([
        script([
          s.label(1, 'start', [
            s.menu(2, [
              ['Go', 'True', [s.jump(3, 'a')]],
              ['Maybe', 'flag', [s.say(4, null, 'hm')]],
            ]),
            s.jump(5, 'b'),
          ]),
          s.label(6, 'a', [s.ret(7)]),
          s.label(8, 'b', [s.ret(9)]),
        ]),
      ]),
    );
    expect(g.edges.map((e) => [e.to, e.choice?.text ?? null, e.conditional])).toEqual([
      ['a', 'Go', false],
      ['b', null, false],
    ]);
  });
});

describe('menus', () => {
  it('takes the prompt from the say statement shown with the menu', () => {
    const m = menus(
      project([
        script([
          s.label(1, 'start', [
            s.say(2, 'e', 'Which one?', false),
            s.menu(3, [['A', 'True', [s.python(4, 'x += 1')]]], 'seen'),
          ]),
        ]),
      ]),
    );
    expect(m.menus[0]).toMatchObject({
      prompt: { who: 'e', text: 'Which one?' },
      set: 'seen',
      options: [{ text: 'A', python: ['x += 1'], fallsThrough: true, targets: [] }],
    });
  });
});

describe('variables', () => {
  it('counts redefinitions as writes and spares engine settings', () => {
    const v = variables(
      project([
        script([
          s.define(1, 'limit', '3'),
          s.define(2, 'limit', '1', '+='),
          s.default(3, 'unused', '0'),
          s.define(4, 'name', '"Phanes"', '=', 'store.config'),
          s.default(5, 'seen', 'set()', 'store.persistent'),
          s.label(6, 'start', [s.python(7, 'persistent.seen.add(limit)')]),
        ]),
      ]),
    );
    const byName = Object.fromEntries(v.variables.map((x) => [x.name, x]));
    expect(byName.limit?.writes.map((w) => w.loc.line)).toEqual([2]);
    expect(byName.limit?.reads.map((r) => r.loc.line)).toEqual([7]);
    expect(byName['persistent.seen']?.reads.map((r) => r.loc.line)).toEqual([7]);
    expect(byName['config.name']?.engine).toBe(true);
    expect(v.totals).toMatchObject({ neverRead: 1, neverWritten: 2 });
  });
});

describe('assets', () => {
  it('reports missing images with a close name, and bare tags as possible displays', () => {
    const a = assets(
      project(
        [
          script([
            s.image(1, 'mael souriant', '"sprites/mael.png"'),
            s.image(2, 'bg port', '"images/port.png"'),
            s.label(3, 'start', [
              s.show(4, 'mael sourire'),
              s.show(5, 'mael'),
              s.scene(6, 'bg port'),
              s.show(7, 'x', 'dynamic_image'),
              s.user(8, 'play sound "sfx/door.ogg" fadein 1.0'),
            ]),
          ]),
        ],
        ['sprites/mael.png', 'images/extra one.webp', 'sfx/bell.ogg'],
      ),
    );
    expect(a.images.missing).toEqual([
      expect.objectContaining({
        name: 'mael sourire',
        reason: 'undeclared',
        suggestion: 'mael souriant',
      }),
      expect.objectContaining({ name: 'bg port', reason: 'file-missing', file: 'images/port.png' }),
    ]);
    const byName = Object.fromEntries(a.images.entries.map((i) => [i.name, i]));
    expect(byName['mael souriant']?.displays.map((d) => d.loc.line)).toEqual([5]);
    expect(byName['extra one']?.declaration).toBe('automatic');
    expect(a.images.dynamic).toHaveLength(1);
    expect(a.audio.missing.map((p) => p.file)).toEqual(['sfx/door.ogg']);
    expect(a.audio.totals).toMatchObject({ files: 1, neverPlayed: 1 });
  });

  it('describes the movies of Movie images', () => {
    const a = assets(
      project(
        [
          script([
            s.image(1, 'intro', 'Movie(play="movies/intro.webm")'),
            s.image(2, 'rain', 'Movie(play="rain.webm", loop=False, keep_last_frame=True)'),
            s.image(3, 'ghost', 'Movie(size=(640, 360), play="ghost.webm", side_mask=True)'),
            s.image(4, 'bg park', '"park.png"'),
          ]),
        ],
        ['movies/intro.webm', 'ghost.webm', 'park.png'],
      ),
    );
    const byName = Object.fromEntries(a.images.entries.map((i) => [i.name, i]));
    expect(byName.intro?.movie).toEqual({
      play: 'movies/intro.webm',
      file: {
        path: 'G/game/movies/intro.webm',
        gamePath: 'movies/intro.webm',
        size: 10,
        archive: null,
      },
      loop: true,
      keepLastFrame: false,
      sideMask: false,
    });
    expect(byName.intro?.file).toBeNull();
    expect(byName.rain?.movie).toMatchObject({ file: null, loop: false, keepLastFrame: true });
    expect(byName.ghost?.movie).toMatchObject({ loop: true, sideMask: true });
    expect(byName['bg park']?.movie).toBeNull();
    expect(a.video.missing.map((m) => m.file)).toEqual(['rain.webm']);
  });
});

describe('translations', () => {
  it('finds orphan translations and missing lines', () => {
    const at = (id: string, line: number) => ({
      id,
      loc: { file: 'game/script.rpy', line },
      label: 'start',
      hasSay: true,
      script: 'G/game/script.rpyc',
    });
    const t = translations(
      project(
        [
          script([s.label(1, 'start', [s.say(2, null, 'a'), s.say(3, null, 'b')])]),
          script(
            [s.translate(1, 'german', 'start_1', []), s.translate(5, 'german', 'start_old', [])],
            'tl/german/script.rpyc',
          ),
        ],
        [],
        [at('start_1', 2), at('start_2', 3)],
      ),
    );
    expect(t.languages[0]).toMatchObject({
      language: 'german',
      files: 1,
      dialogue: { translated: 1, total: 2 },
      orphans: [{ id: 'start_old' }],
      missingByFile: [{ file: 'game/script.rpy', missing: 1, total: 2 }],
    });
  });
});
