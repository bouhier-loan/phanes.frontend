import { fixturePath, walkDirectory } from '@phanes/testkit';
import { describe, expect, it } from 'vitest';
import {
  continueAt,
  enterBlock,
  loadProject,
  nextStop,
  type PlayStop,
  type ReaderLine,
  readLabel,
  screenSize,
} from '../src';
import { project as synthetic, s, script } from './synthetic';

const demo = await loadProject(
  await walkDirectory(fixturePath('build', '8.5.3', 'phanes_demo', 'dist')),
);

function content(project: Parameters<typeof readLabel>[0], label: string): ReaderLine[] {
  return readLabel(project, label)?.content ?? [];
}

/** Text of a say stop, or the stop's kind. */
function show(lines: readonly ReaderLine[], stop: PlayStop): string {
  if (stop.kind === 'say') {
    const line = lines[stop.index];
    return line?.kind === 'say' ? line.text : 'say';
  }
  if (stop.kind === 'jump' || stop.kind === 'call') return `${stop.kind} ${stop.target ?? '?'}`;
  return stop.kind;
}

/** Plays from `from`, following say lines only, until a stop that is not a say. */
function readUntilChoice(lines: readonly ReaderLine[], from: number | null): string[] {
  const out: string[] = [];
  let step = nextStop(lines, from);
  while (step.stop.kind === 'say') {
    out.push(show(lines, step.stop));
    step = nextStop(lines, continueAt(lines, step.stop.index));
  }
  out.push(show(lines, step.stop));
  return out;
}

describe('scene player', () => {
  it('stops at each line and at the menu of start', () => {
    const start = content(demo, 'start');
    const first = nextStop(start, 0);
    expect(first.passed.map((l) => l.code)).toEqual(['scene bg room', 'show eileen happy']);
    expect(readUntilChoice(start, 0)).toEqual([
      'It was a quiet morning.',
      'Good morning! Did you sleep well?',
      ' I hope so.',
      'I did, thanks.',
      'A literal speaker name works too.',
      'menu',
    ]);
    let step = nextStop(start, 0);
    while (step.stop.kind === 'say') step = nextStop(start, continueAt(start, step.stop.index));
    expect(
      step.stop.kind === 'menu' && step.stop.choices.map((c) => [c.text, c.condition]),
    ).toEqual([
      ['To the park', null],
      ['To the library', 'affection > 0'],
      ['Stay home', null],
    ]);
  });

  it('plays a menu choice, a call and its return point', () => {
    const start = content(demo, 'start');
    const menu = nextStop(start, 8).stop;
    if (menu.kind !== 'menu') throw new Error('menu expected');
    const [park, library, home] = menu.choices;
    expect(readUntilChoice(start, enterBlock(start, park?.index ?? -1))).toEqual(['jump park']);
    expect(readUntilChoice(start, enterBlock(start, home?.index ?? -1))).toEqual([
      'Fine by me.',
      'jump finale',
    ]);
    const call = nextStop(start, enterBlock(start, library?.index ?? -1)).stop;
    expect(show(start, call)).toBe('call library');
    expect(
      readUntilChoice(start, continueAt(start, call.kind === 'call' ? call.index : -1)),
    ).toEqual(['jump finale']);
    expect(readUntilChoice(content(demo, 'library'), 0)).toEqual([
      'Shh, this is a library.',
      'Books everywhere.',
      'return',
    ]);
  });

  it('lets the reader pick a branch, and folds constant jump expressions', () => {
    const finale = content(demo, 'finale');
    const step = nextStop(finale, 0);
    expect(step.passed.map((l) => l.code)).toEqual(['hide eileen']);
    const branch = step.stop;
    if (branch.kind !== 'branch') throw new Error('branch expected');
    expect(branch.hasElse).toBe(true);
    expect(branch.branches.map((b) => [b.keyword, b.condition])).toEqual([
      ['if', 'met_lucy'],
      ['else', null],
    ]);
    const [yes, no] = branch.branches;
    expect(readUntilChoice(finale, enterBlock(finale, yes?.index ?? -1))).toEqual([
      'jump good_ending',
    ]);
    const other = nextStop(finale, enterBlock(finale, no?.index ?? -1));
    expect(other.passed.map((l) => l.code)).toEqual(['$ affection -= 1']);
    expect(show(finale, other.stop)).toBe('jump bad_ending');
    expect(readUntilChoice(content(demo, 'park'), 0)).toEqual([
      'Oh, hello there!',
      'Nice weather today.',
      'jump park.bench',
    ]);
  });

  it('follows nested blocks, loops and the end of a label', () => {
    const p = synthetic([
      script([
        s.label(1, 'a', [
          s.if(2, [
            [
              'x',
              [
                s.say(3, null, 'x'),
                s.say(4, 'e', 'Where?', false),
                s.menu(5, [
                  ['m1', 'True', [s.say(6, null, 'm1')]],
                  ['m2', 'flag', [s.jump(7, '.loc')]],
                ]),
              ],
            ],
            ['True', [s.while(8, 'c', [s.say(9, null, 'w')])]],
          ]),
          s.say(10, null, 'after'),
          s.label(11, 'a.inner', [s.say(12, null, 'inner')]),
        ]),
      ]),
    ]);
    const a = content(p, 'a');
    const branch = nextStop(a, 0).stop;
    if (branch.kind !== 'branch') throw new Error('branch expected');
    const [x, otherwise] = branch.branches;

    // If branch: a say, then the menu with the non-interactive prompt passed on the way.
    const say = nextStop(a, enterBlock(a, x?.index ?? -1));
    expect(show(a, say.stop)).toBe('x');
    const menuStep = nextStop(a, continueAt(a, say.stop.kind === 'say' ? say.stop.index : -1));
    expect(menuStep.passed.map((l) => l.kind)).toEqual(['say']);
    const menu = menuStep.stop;
    if (menu.kind !== 'menu') throw new Error('menu expected');
    // A choice that ends continues after the menu, then after the whole if.
    expect(readUntilChoice(a, enterBlock(a, menu.choices[0]?.index ?? -1))).toEqual([
      'm1',
      'after',
      'inner',
      'end',
    ]);
    expect(readUntilChoice(a, enterBlock(a, menu.choices[1]?.index ?? -1))).toEqual(['jump a.loc']);

    // Else branch: a while loop asks again after each pass through its body.
    const loop = nextStop(a, enterBlock(a, otherwise?.index ?? -1)).stop;
    if (loop.kind !== 'branch') throw new Error('loop expected');
    expect(loop.branches.map((b) => b.keyword)).toEqual(['while']);
    expect(loop.hasElse).toBe(false);
    const body = nextStop(a, enterBlock(a, loop.index)).stop;
    expect(show(a, body)).toBe('w');
    expect(nextStop(a, continueAt(a, body.kind === 'say' ? body.index : -1)).stop).toEqual(loop);
    expect(readUntilChoice(a, continueAt(a, loop.index))).toEqual(['after', 'inner', 'end']);
  });

  it('reads the screen size', () => {
    expect(screenSize(demo)).toBeNull();
    const gui = synthetic([
      script([s.python(1, 'gui.init(1280, 720)'), s.python(2, 'config.screen_width = 800')]),
    ]);
    expect(screenSize(gui)).toEqual({ width: 1280, height: 720 });
    const config = synthetic([
      script([
        s.define(1, 'screen_width', '800', '=', 'store.config'),
        s.define(2, 'screen_height', '600', '=', 'store.config'),
      ]),
    ]);
    expect(screenSize(config)).toEqual({ width: 800, height: 600 });
  });
});
