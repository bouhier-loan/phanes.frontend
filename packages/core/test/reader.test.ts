import { fixturePath, walkDirectory } from '@phanes/testkit';
import { describe, expect, it } from 'vitest';
import { dialogueDump, loadProject, readLabel, scriptOutline, searchText, stageAt } from '../src';

const project = await loadProject(
  await walkDirectory(fixturePath('build', '8.5.3', 'phanes_demo', 'dist')),
);

describe('script reader', () => {
  it('outlines labels by source file', () => {
    expect(scriptOutline(project)).toEqual([
      {
        file: 'game/script.rpy',
        labels: [
          { name: 'start', line: 9, lines: 6 },
          { name: 'park', line: 29, lines: 2 },
          { name: 'park.bench', line: 38, lines: 1 },
          { name: 'library', line: 42, lines: 2 },
          { name: 'finale', line: 48, lines: 0 },
          { name: 'good_ending', line: 56, lines: 2 },
          { name: 'bad_ending', line: 62, lines: 2 },
        ],
      },
      {
        file: 'game/story/extra.rpy',
        labels: [
          { name: 'secret_ending', line: 9, lines: 1 },
          { name: 'unused_label', line: 13, lines: 1 },
        ],
      },
    ]);
  });

  it('reconstructs a label line by line', () => {
    const start = readLabel(project, 'start');
    expect(start).toMatchObject({ file: 'game/script.rpy', line: 9, previous: null, next: 'park' });
    expect(start?.content.map((l) => [l.line, l.depth, l.kind, l.code])).toEqual([
      [10, 0, 'scene', 'scene bg room'],
      [11, 0, 'show', 'show eileen happy'],
      [12, 0, 'say', '"It was a quiet morning."'],
      [13, 0, 'say', 'e "Good morning! Did you sleep well?"'],
      [14, 0, 'say', 'extend " I hope so."'],
      [15, 0, 'say', 'p "I did, thanks."'],
      [16, 0, 'say', '"Eileen" "A literal speaker name works too."'],
      [17, 0, 'python', '$ affection += 1'],
      [18, 0, 'menu', 'menu:'],
      [18, 1, 'choice', '"To the park":'],
      [21, 2, 'jump', 'jump park'],
      [18, 1, 'choice', '"To the library" if affection > 0:'],
      [23, 2, 'call', 'call library'],
      [23, 2, 'other', 'pass'],
      [24, 2, 'jump', 'jump finale'],
      [18, 1, 'choice', '"Stay home":'],
      [26, 2, 'say', 'e "Fine by me."'],
      [27, 2, 'jump', 'jump finale'],
    ]);
    const say = start?.content[4];
    expect(say?.kind === 'say' && say.speaker).toEqual({
      id: 'e',
      name: 'Eileen',
      color: '#c8ffc8',
    });
    const menu = start?.content[8];
    expect(menu?.kind === 'menu' && menu.prompt).toEqual({
      speaker: null,
      text: 'Where should we go?',
    });
    expect(menu?.kind === 'menu' && menu.options.map((o) => o.targets)).toEqual([
      [{ kind: 'jump', target: 'park' }],
      [
        { kind: 'call', target: 'library' },
        { kind: 'jump', target: 'finale' },
      ],
      [{ kind: 'jump', target: 'finale' }],
    ]);
    expect(readLabel(project, 'missing')).toBeNull();
  });

  it('replays the staging up to a line', () => {
    const park = readLabel(project, 'park');
    const content = park?.content ?? [];
    expect(stageAt(content, content.length - 1)).toEqual({
      background: 'bg park',
      shown: [{ tag: 'lucy', image: 'lucy smile', at: [] }],
      music: 'audio/theme.ogg',
    });
  });

  it('dumps and searches dialogue', () => {
    const lines = dialogueDump(project);
    expect(lines).toHaveLength(17);
    expect(lines[2]).toMatchObject({ label: 'start', speaker: 'Eileen', text: ' I hope so.' });
    expect(searchText(lines, 'LIBRARY').map((l) => l.line)).toEqual([44]);
  });
});
