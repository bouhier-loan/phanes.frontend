import { fixturePath } from '@phanes/testkit';
import { describe, expect, it } from 'vitest';
import { inventoryCommand } from '../src/commands/inventory';

describe('phanes inventory', () => {
  it('summarizes a distribution', async () => {
    const out = await inventoryCommand(fixturePath('build', '8.5.3', 'phanes_demo', 'dist'), false);
    expect(out).toContain('Game directory: dist/game');
    expect(out).toMatch(/compiled-script\s+6/);
    expect(out).toMatch(/dist\/game\/scripts\.rpa\s+RPA-3\.0\s+6/);
  });

  it('prints the JSON report', async () => {
    const out = await inventoryCommand(fixturePath('build', '7.4.11', 'phanes_demo', 'dist'), true);
    const report = JSON.parse(out) as { schemaVersion: number; analyses: Record<string, unknown> };
    expect(report.schemaVersion).toBe(1);
    expect(Object.keys(report.analyses)).toEqual(['inventory']);
  });
});
