import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYOUT, layoutGraph } from '../src/ui/graph/layout';

const row = (y: number) =>
  DEFAULT_LAYOUT.margin + y * (DEFAULT_LAYOUT.nodeHeight + DEFAULT_LAYOUT.gapY);

describe('graph layout', () => {
  it('layers nodes by longest path and breaks cycles', () => {
    const layout = layoutGraph(
      ['start', 'a', 'b', 'end'],
      [
        { from: 'start', to: 'a' },
        { from: 'start', to: 'b' },
        { from: 'a', to: 'end' },
        { from: 'b', to: 'a' },
        { from: 'end', to: 'start' },
      ],
    );
    expect(layout.positions.get('start')?.y).toBe(row(0));
    expect(layout.positions.get('b')?.y).toBe(row(1));
    expect(layout.positions.get('a')?.y).toBe(row(2));
    expect(layout.positions.get('end')?.y).toBe(row(3));
    expect([...layout.back]).toEqual([4]);
  });

  it('keeps nodes of a layer apart and inside the canvas', () => {
    const layout = layoutGraph(
      ['r', 'x', 'y', 'z'],
      ['x', 'y', 'z'].map((to) => ({ from: 'r', to })),
    );
    const xs = ['x', 'y', 'z'].map((n) => layout.positions.get(n)?.x ?? -1).sort((a, b) => a - b);
    expect(new Set(xs).size).toBe(3);
    expect(xs[0]).toBeGreaterThanOrEqual(DEFAULT_LAYOUT.margin);
    expect((xs[2] ?? 0) + DEFAULT_LAYOUT.nodeWidth).toBeLessThanOrEqual(layout.width);
  });

  it('orders a layer to follow its parents', () => {
    const layout = layoutGraph(
      ['a', 'b', 'b2', 'a2'],
      [
        { from: 'a', to: 'a2' },
        { from: 'b', to: 'b2' },
      ],
    );
    const x = (n: string) => layout.positions.get(n)?.x ?? 0;
    expect(x('a') < x('b')).toBe(x('a2') < x('b2'));
  });
});
