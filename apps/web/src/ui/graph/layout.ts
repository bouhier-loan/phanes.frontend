/**
 * A small layered layout (after Sugiyama): cycles are broken by DFS, nodes
 * are layered by longest path from the roots, then ordered in each layer by
 * a few barycentre sweeps to limit crossings. Enough for one file's labels;
 * the whole game is only laid out when it is small.
 */

export interface LayoutEdge {
  readonly from: string;
  readonly to: string;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Layout {
  /** Top-left corner of each node. */
  readonly positions: ReadonlyMap<string, Point>;
  readonly width: number;
  readonly height: number;
  /** Indexes of the edges that go back up (they close a cycle). */
  readonly back: ReadonlySet<number>;
}

export interface LayoutOptions {
  readonly nodeWidth: number;
  readonly nodeHeight: number;
  readonly gapX: number;
  readonly gapY: number;
  readonly margin: number;
  readonly sweeps: number;
}

export const DEFAULT_LAYOUT: LayoutOptions = {
  nodeWidth: 168,
  nodeHeight: 56,
  gapX: 64,
  gapY: 56,
  margin: 32,
  sweeps: 4,
};

export function layoutGraph(
  nodes: readonly string[],
  edges: readonly LayoutEdge[],
  options: LayoutOptions = DEFAULT_LAYOUT,
): Layout {
  const ids = new Set(nodes);
  const out = new Map<string, { to: string; index: number }[]>(nodes.map((n) => [n, []]));
  edges.forEach((e, index) => {
    if (ids.has(e.from) && ids.has(e.to) && e.from !== e.to)
      out.get(e.from)?.push({ to: e.to, index });
  });

  // Back edges: edges to a node still on the DFS stack. Iterative DFS, in input order.
  const back = new Set<number>();
  const state = new Map<string, 'open' | 'done'>();
  const order: string[] = [];
  for (const root of nodes) {
    if (state.has(root)) continue;
    const stack: { node: string; next: number }[] = [{ node: root, next: 0 }];
    state.set(root, 'open');
    order.push(root);
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      if (!frame) break;
      const edge = out.get(frame.node)?.[frame.next++];
      if (!edge) {
        state.set(frame.node, 'done');
        stack.pop();
        continue;
      }
      const s = state.get(edge.to);
      if (s === 'open') back.add(edge.index);
      else if (s === undefined) {
        state.set(edge.to, 'open');
        order.push(edge.to);
        stack.push({ node: edge.to, next: 0 });
      }
    }
  }

  // Longest-path layering over the forward edges, in topological order.
  const indegree = new Map<string, number>(nodes.map((n) => [n, 0]));
  const forward = new Map<string, string[]>(nodes.map((n) => [n, []]));
  const incoming = new Map<string, string[]>(nodes.map((n) => [n, []]));
  edges.forEach((e, index) => {
    if (back.has(index) || !ids.has(e.from) || !ids.has(e.to) || e.from === e.to) return;
    forward.get(e.from)?.push(e.to);
    incoming.get(e.to)?.push(e.from);
    indegree.set(e.to, (indegree.get(e.to) ?? 0) + 1);
  });
  const layer = new Map<string, number>();
  const queue = order.filter((n) => (indegree.get(n) ?? 0) === 0);
  for (const n of queue) layer.set(n, 0);
  // The queue grows while it is read: for-of visits the added nodes too.
  for (const n of queue) {
    for (const m of forward.get(n) ?? []) {
      layer.set(m, Math.max(layer.get(m) ?? 0, (layer.get(n) ?? 0) + 1));
      const d = (indegree.get(m) ?? 0) - 1;
      indegree.set(m, d);
      if (d === 0) queue.push(m);
    }
  }

  const layers: string[][] = [];
  for (const n of order) {
    const l = layer.get(n) ?? 0;
    (layers[l] ??= []).push(n);
  }
  const position = new Map<string, number>();
  const index = () => {
    for (const row of layers) row.forEach((n, i) => position.set(n, i));
  };
  index();
  const neighbours = (n: string, down: boolean) =>
    down ? (incoming.get(n) ?? []) : (forward.get(n) ?? []);
  for (let sweep = 0; sweep < options.sweeps; sweep++) {
    const down = sweep % 2 === 0;
    const range = down ? layers.keys() : [...layers.keys()].reverse();
    for (const l of range) {
      const row = layers[l];
      if (!row) continue;
      const weight = (n: string) => {
        const ns = neighbours(n, down);
        if (ns.length === 0) return position.get(n) ?? 0;
        return ns.reduce((sum, m) => sum + (position.get(m) ?? 0), 0) / ns.length;
      };
      const weights = new Map(row.map((n) => [n, weight(n)]));
      row.sort((a, b) => (weights.get(a) ?? 0) - (weights.get(b) ?? 0));
      row.forEach((n, i) => position.set(n, i));
    }
  }

  const { nodeWidth, nodeHeight, gapX, gapY, margin } = options;
  const widest = Math.max(1, ...layers.map((row) => row.length));
  const width = margin * 2 + widest * nodeWidth + (widest - 1) * gapX;
  const positions = new Map<string, Point>();
  layers.forEach((row, l) => {
    const rowWidth = row.length * nodeWidth + (row.length - 1) * gapX;
    const start = (width - rowWidth) / 2;
    row.forEach((n, i) => {
      positions.set(n, { x: start + i * (nodeWidth + gapX), y: margin + l * (nodeHeight + gapY) });
    });
  });
  const height =
    margin * 2 + Math.max(1, layers.length) * nodeHeight + Math.max(0, layers.length - 1) * gapY;
  return { positions, width, height, back };
}
