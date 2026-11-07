import { DEFAULT_ANALYSES } from '@phanes/core';
import { fixturePath, openCorpus } from '@phanes/testkit';
import { describe, expect, it } from 'vitest';
import { bench, benchCommand } from '../src/commands/bench';

describe('phanes bench', () => {
  it('times every loading step and analysis', async () => {
    const result = await bench(await openCorpus('8.5.3', 'the_question'), 2);
    expect(result.runs).toBe(2);
    expect(result.scripts.count).toBe(53);
    expect(result.scripts.statements).toBeGreaterThan(1000);
    expect(result.steps.map((s) => s.name)).toEqual([
      'vfs',
      'scripts',
      'translation ids',
      'version files',
      'dialogue index',
      ...DEFAULT_ANALYSES.map((a) => `analysis ${a.id}`),
    ]);
    for (const step of result.steps) expect(step.minMs).toBeLessThanOrEqual(step.medianMs);
  });

  it('prints a table', async () => {
    const out = await benchCommand(fixturePath('build', '8.5.3', 'phanes_demo', 'dist'), false, 1);
    expect(out).toMatch(/^Files: \d+/);
    expect(out).toMatch(/analysis storyGraph\s+\d+\.\d ms/);
  });
});
