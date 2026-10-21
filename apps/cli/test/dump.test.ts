import { fixturePath } from '@phanes/testkit';
import { describe, expect, it } from 'vitest';
import { dumpCommand } from '../src/commands/dump';

describe('phanes dump', () => {
  it('dumps a loose script', async () => {
    const out = JSON.parse(
      await dumpCommand(
        fixturePath('build', '8.5.3', 'phanes_demo', 'project', 'game', 'script.rpyc'),
      ),
    ) as { slot: number; pickleProtocol: number; payload: unknown };
    expect(out.slot).toBe(1);
    expect(out.pickleProtocol).toBe(5);
    expect(JSON.stringify(out.payload)).toContain('renpy.ast.Say');
  });

  it('dumps a script inside an archive', async () => {
    const archive = fixturePath('build', '7.4.11', 'phanes_demo', 'dist', 'game', 'scripts.rpa');
    const out = JSON.parse(await dumpCommand(`${archive}:story/extra.rpyc`)) as {
      python2: boolean;
    };
    expect(out.python2).toBe(true);
  });
});
