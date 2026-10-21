import type { CallStmt, JumpStmt, Location } from '../model/ast';
import type { Project } from '../model/project';
import { foldStringExpression, stringConstants } from '../python-lite/names';
import type { Analysis } from './analysis';
import { dialogueIndex } from './dialogue';
import { type FlowContext, scanFlow, TOP } from './flow';
import { walkStatements } from './walk';

export type GraphEdgeKind = 'jump' | 'call' | 'fallthrough' | 'reference';

export type GraphEdge = {
  /** null for a reference from a screen or init-time code. */
  from: string | null;
  to: string;
  kind: GraphEdgeKind;
  /** Inside an if/while branch or a conditional menu choice. */
  conditional: boolean;
  /** The menu choice the jump or call belongs to. */
  choice: { menu: string; text: string; conditional: boolean } | null;
  /** Target computed from a constant `jump expression`. */
  dynamic: boolean;
  loc: Location;
};

export type GraphNode = {
  name: string;
  file: string;
  line: number;
  script: string;
  local: boolean;
  lines: number;
  /** Ids of the speakers with a line in the label (see characters). */
  speakers: string[];
  entry: boolean;
  reachable: boolean;
  /** Control can reach a `return` (explicit or the end of the file). */
  returns: boolean;
  ending: boolean;
};

export type BrokenTarget = {
  target: string;
  kind: 'jump' | 'call';
  loc: Location;
  label: string | null;
};

export type DynamicTarget = {
  kind: 'jump' | 'call';
  expression: string;
  /** Value of a constant expression, else null. */
  resolved: string | null;
  loc: Location;
  label: string | null;
};

export type StoryGraphResult = {
  entry: string | null;
  nodes: GraphNode[];
  edges: GraphEdge[];
  broken: BrokenTarget[];
  dynamic: DynamicTarget[];
  unreachable: string[];
  endings: string[];
};

/** Labels Ren'Py itself jumps to or calls. */
export const SPECIAL_LABELS: readonly string[] = [
  'start',
  'splashscreen',
  'before_main_menu',
  'main_menu',
  'after_load',
  'after_warp',
  'quit',
];

/** Statements that do not take part in the story's control flow. */
const INERT = new Set([
  'init',
  'define',
  'default',
  'image',
  'screen',
  'style',
  'transform',
  'translate',
  'translate-string',
  'translate-block',
  'end-translate',
]);

function byName(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The story as a graph of labels linked by jump, call, fall-through and
 * references from screens or code. Rules in docs/analyses.md.
 */
export function storyGraph(project: Project): StoryGraphResult {
  const index = dialogueIndex(project);
  const nodes = new Map<string, GraphNode>();
  walkStatements(project.scripts, (stmt, ctx) => {
    if (stmt.kind !== 'label' || ctx.language !== null || nodes.has(stmt.name)) return;
    const stats = index.byLabel.get(stmt.name);
    nodes.set(stmt.name, {
      name: stmt.name,
      file: stmt.loc.file,
      line: stmt.loc.line,
      script: ctx.script.path,
      local: stmt.name.indexOf('.') > 0,
      lines: stats?.lines ?? 0,
      speakers: [...(stats?.speakers ?? [])].sort(byName),
      entry: false,
      reachable: false,
      returns: false,
      ending: false,
    });
  });

  const edges: GraphEdge[] = [];
  const broken: BrokenTarget[] = [];
  const dynamic: DynamicTarget[] = [];
  const returns = new Set<string>();
  const stack: string[] = [];
  const current = () => stack[stack.length - 1] ?? null;

  const target = (stmt: JumpStmt | CallStmt, kind: 'jump' | 'call', ctx: FlowContext) => {
    const from = current();
    let to = stmt.target;
    let isDynamic = false;
    if (stmt.expression) {
      const resolved = foldStringExpression(stmt.target);
      dynamic.push({ kind, expression: stmt.target, resolved, loc: stmt.loc, label: from });
      if (resolved === null) return;
      to = resolved;
      isDynamic = true;
    }
    if (to.startsWith('.') && from !== null) to = `${from.split('.')[0] ?? from}${to}`;
    if (!nodes.has(to)) {
      broken.push({ target: to, kind, loc: stmt.loc, label: from });
      return;
    }
    edges.push({
      from,
      to,
      kind,
      conditional: ctx.conditional,
      choice: ctx.choice,
      dynamic: isDynamic,
      loc: stmt.loc,
    });
  };
  const handlers = {
    jump: (stmt: JumpStmt, ctx: FlowContext) => {
      target(stmt, 'jump', ctx);
    },
    call: (stmt: CallStmt, ctx: FlowContext) => {
      target(stmt, 'call', ctx);
    },
    return: () => {
      const label = current();
      if (label !== null) returns.add(label);
    },
    enterLabel: (stmt: { name: string; loc: Location }, ctx: FlowContext) => {
      const from = current();
      if (from !== null)
        edges.push({ ...fallthrough(from, stmt.name, stmt.loc), conditional: ctx.conditional });
      stack.push(stmt.name);
    },
    exitLabel: () => {
      stack.pop();
    },
  };

  for (const script of project.scripts) {
    let flowing = false;
    stack.length = 0;
    for (const stmt of script.statements) {
      if (stmt.kind === 'label') {
        const from = current();
        if (from !== null && flowing) edges.push(fallthrough(from, stmt.name, stmt.loc));
        stack.length = 0;
        stack.push(stmt.name);
        flowing = scanFlow(stmt.block, handlers, TOP);
        continue;
      }
      if (!flowing || current() === null || INERT.has(stmt.kind)) continue;
      flowing = scanFlow([stmt], handlers, TOP);
    }
  }

  // References: label names written as strings in screens and Python code.
  const seen = new Set<string>();
  walkStatements(project.scripts, (stmt, ctx) => {
    if (ctx.language !== null) return;
    let strings: readonly string[] = [];
    // Screen strings are the sources of its Python expressions, e.g. Jump("x").
    if (stmt.kind === 'screen') strings = stmt.strings.flatMap(stringConstants);
    else if (stmt.kind === 'python') strings = stringConstants(stmt.code);
    else if (stmt.kind === 'define' || stmt.kind === 'default')
      strings = stringConstants(stmt.value);
    const from = stmt.kind === 'screen' ? null : ctx.label;
    for (const s of strings) {
      const key = `${from ?? ''}\u0000${s}\u0000${stmt.loc.file}:${stmt.loc.line}`;
      if (!nodes.has(s) || seen.has(key)) continue;
      seen.add(key);
      edges.push({
        from,
        to: s,
        kind: 'reference',
        conditional: false,
        choice: null,
        dynamic: false,
        loc: stmt.loc,
      });
    }
  });

  const entry = nodes.has('start') ? 'start' : null;
  const outgoing = new Map<string, GraphEdge[]>();
  const incoming = new Map<string, GraphEdge[]>();
  for (const e of edges) {
    if (e.from !== null) outgoing.set(e.from, [...(outgoing.get(e.from) ?? []), e]);
    incoming.set(e.to, [...(incoming.get(e.to) ?? []), e]);
  }
  const queue = [
    ...SPECIAL_LABELS.filter((l) => nodes.has(l)),
    ...edges.filter((e) => e.from === null).map((e) => e.to),
  ];
  const reachable = new Set<string>();
  while (queue.length > 0) {
    const name = queue.pop();
    if (name === undefined || reachable.has(name)) continue;
    reachable.add(name);
    for (const e of outgoing.get(name) ?? []) queue.push(e.to);
  }
  for (const node of nodes.values()) {
    node.entry = node.name === entry;
    node.reachable = reachable.has(node.name);
    node.returns = returns.has(node.name);
    const leaves = (outgoing.get(node.name) ?? []).some((e) => e.kind !== 'call');
    const entered = node.entry || (incoming.get(node.name) ?? []).some((e) => e.kind !== 'call');
    const special = SPECIAL_LABELS.includes(node.name) && !node.entry;
    node.ending = node.reachable && node.returns && !leaves && entered && !special;
  }
  const list = [...nodes.values()].sort(
    (a, b) => byName(a.file, b.file) || a.line - b.line || byName(a.name, b.name),
  );
  return {
    entry,
    nodes: list,
    edges,
    broken,
    dynamic,
    unreachable: list.filter((n) => !n.reachable).map((n) => n.name),
    endings: list.filter((n) => n.ending).map((n) => n.name),
  };
}

function fallthrough(from: string, to: string, loc: Location): GraphEdge {
  return { from, to, kind: 'fallthrough', conditional: false, choice: null, dynamic: false, loc };
}

export const storyGraphAnalysis: Analysis<StoryGraphResult> = {
  id: 'storyGraph',
  run: storyGraph,
};
