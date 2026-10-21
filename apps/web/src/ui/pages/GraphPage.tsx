import type { GraphEdge, GraphNode, MenuEntry, StoryGraphResult } from '@phanes/core';
import { useId, useMemo, useState } from 'react';
import { PageHeader } from '../components/ui';
import { DEFAULT_LAYOUT, layoutGraph } from '../graph/layout';
import { formatLocation, formatNumber } from '../format';
import { useReport } from '../report';
import { href } from '../route';
import { t } from '../strings.fr';
import { characterName } from './characters-shared';

/** Above this many labels, the whole game is not drawn at once. */
const MAX_WHOLE = 120;
const ZOOMS = [0.5, 0.65, 0.8, 1, 1.25, 1.5];
const { nodeWidth: W, nodeHeight: H } = DEFAULT_LAYOUT;

type VisualKind = 'label' | 'menu' | 'external' | 'missing' | 'screen';

interface VisualNode {
  readonly id: string;
  readonly kind: VisualKind;
  readonly title: string;
  readonly subtitle: string;
  readonly label?: GraphNode;
}

interface VisualEdge {
  readonly from: string;
  readonly to: string;
  readonly style: 'jump' | 'call' | 'choice' | 'broken' | 'reference' | 'fallthrough';
  readonly text?: string;
}

/** The nodes and edges drawn for one scope: labels of a file, menus, and stubs for the outside. */
function buildScene(graph: StoryGraphResult, menus: readonly MenuEntry[], scope: string | null) {
  const g = t.graph.node;
  const inScope = (n: GraphNode) => scope === null || n.file === scope;
  const byName = new Map(graph.nodes.map((n) => [n.name, n]));
  const nodes = new Map<string, VisualNode>();
  const edges: VisualEdge[] = [];
  const menuById = new Map(menus.map((m) => [m.id, m]));
  const labelNode = (n: GraphNode): VisualNode => ({
    id: `l:${n.name}`,
    kind: 'label',
    title: n.name,
    subtitle: !n.reachable
      ? g.unreachable
      : n.ending
        ? g.ending(formatLocation(n))
        : formatLocation(n),
    label: n,
  });
  for (const n of graph.nodes) if (inScope(n)) nodes.set(`l:${n.name}`, labelNode(n));
  const ensure = (name: string): string => {
    const id = `l:${name}`;
    if (!nodes.has(id)) {
      const n = byName.get(name);
      nodes.set(id, {
        id,
        kind: 'external',
        title: `${name} ›`,
        subtitle: g.outOfScope,
        ...(n ? { label: n } : {}),
      });
    }
    return id;
  };
  for (const e of graph.edges) {
    const from = e.from === null ? null : byName.get(e.from);
    const to = byName.get(e.to);
    if (!to) continue;
    if (!(from ? inScope(from) : false) && !inScope(to)) continue;
    const target = ensure(e.to);
    if (e.from === null) {
      const id = `s:${e.loc.file}:${e.loc.line}`;
      if (!nodes.has(id))
        nodes.set(id, { id, kind: 'screen', title: formatLocation(e.loc), subtitle: g.screen });
      edges.push({ from: id, to: target, style: 'reference' });
      continue;
    }
    const source = ensure(e.from);
    if (e.choice) {
      const menu = menuById.get(e.choice.menu);
      const id = `m:${e.choice.menu}`;
      if (!nodes.has(id)) {
        nodes.set(id, {
          id,
          kind: 'menu',
          title: g.menu(menu?.options.length ?? 0),
          subtitle: menu?.prompt ? `« ${menu.prompt.text} »` : formatLocation(e.loc),
        });
        edges.push({ from: source, to: id, style: 'jump' });
      }
      edges.push({
        from: id,
        to: target,
        style: e.kind === 'call' ? 'call' : 'choice',
        text: e.choice.text,
      });
      continue;
    }
    edges.push({
      from: source,
      to: target,
      style:
        e.kind === 'call'
          ? 'call'
          : e.kind === 'reference'
            ? 'reference'
            : e.kind === 'fallthrough'
              ? 'fallthrough'
              : 'jump',
    });
  }
  for (const b of graph.broken) {
    if (!b.label) continue;
    const from = byName.get(b.label);
    if (!from || !inScope(from)) continue;
    const id = `x:${b.target}`;
    if (!nodes.has(id))
      nodes.set(id, { id, kind: 'missing', title: b.target, subtitle: g.missing });
    edges.push({ from: `l:${b.label}`, to: id, style: 'broken' });
  }
  return { nodes: [...nodes.values()], edges };
}

function edgePath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  back: boolean,
): string {
  const x1 = from.x + W / 2;
  const y1 = from.y + H;
  const x2 = to.x + W / 2;
  const y2 = to.y;
  if (back) {
    // Up along the left side, so cycles stay readable.
    const side = Math.min(from.x, to.x) - 28;
    return `M ${from.x} ${from.y + H / 2} C ${side} ${from.y + H / 2}, ${side} ${to.y + H / 2}, ${to.x} ${to.y + H / 2}`;
  }
  const mid = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2 - 6}`;
}

function edgeLabel(e: GraphEdge): string {
  const k = t.graph.edgeKind;
  if (e.choice) return e.choice.conditional ? k.conditionalChoice : k.choice;
  if (e.kind === 'jump' && e.conditional) return k.conditional;
  return k[e.kind];
}

function Aside({
  node,
  graph,
  menus,
}: {
  node: GraphNode | undefined;
  graph: StoryGraphResult;
  menus: readonly MenuEntry[];
}) {
  const { characters } = useReport();
  const g = t.graph;
  if (!node) return <p className="card card-pad muted">{g.selectHint}</p>;
  const incoming = graph.edges.filter((e) => e.to === node.name);
  const outgoing = graph.edges.filter((e) => e.from === node.name);
  const broken = graph.broken.filter((b) => b.label === node.name);
  const byId = new Map((characters?.characters ?? []).map((c) => [c.id, c]));
  const speakers = node.speakers.map((id) => {
    const c = byId.get(id);
    return c ? characterName(c) : id;
  });
  const hasMenu = menus.some((m) => m.label === node.name);
  return (
    <aside aria-label={g.selectedLabel} className="card card-pad graph-aside">
      <div>
        <h2 className="mono text-amber">{node.name}</h2>
        <span className="mono small muted">
          {formatLocation(node)} · {g.lines(node.lines)}
        </span>
      </div>
      <div>
        <h3>{g.comesFrom}</h3>
        {incoming.length === 0 ? (
          <p className="small faint">{t.none}</p>
        ) : (
          <ul className="list">
            {incoming.map((e, i) => (
              <li key={i}>
                {e.from ? (
                  <a href={href('graphe', e.from)} className="mono">
                    {e.from}
                  </a>
                ) : (
                  <span className="mono">{formatLocation(e.loc)}</span>
                )}{' '}
                <span className="faint">· {edgeLabel(e)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h3>{g.leadsTo}</h3>
        {outgoing.length + broken.length === 0 ? (
          <p className="small faint">{t.none}</p>
        ) : (
          <ul className="list">
            {outgoing.map((e, i) => (
              <li key={i}>
                <a href={href('graphe', e.to)} className="mono">
                  {e.to}
                </a>{' '}
                <span className="faint">· {edgeLabel(e)}</span>
              </li>
            ))}
            {broken.map((b, i) => (
              <li key={`b${i}`}>
                <span className="mono text-red">{b.target}</span>{' '}
                <span className="faint">· {t.graph.node.missing}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h3>{g.speakers}</h3>
        <p className="small">{speakers.length > 0 ? speakers.join(', ') : t.none}</p>
      </div>
      <div className="aside-links">
        <a href={href('lecteur', node.name)}>{g.read}</a>
        {hasMenu && <a href={href('choix', node.name)}>{g.seeMenu}</a>}
      </div>
    </aside>
  );
}

const LEGEND = [
  { style: 'jump', label: t.graph.legendItems.jump },
  { style: 'call', label: t.graph.legendItems.call },
  { style: 'choice', label: t.graph.legendItems.choice },
  { style: 'broken', label: t.graph.legendItems.broken },
] as const;

export function GraphPage({ focus }: { focus: string | null }) {
  const r = useReport();
  const g = t.graph;
  const graph = r.graph;
  const scopeId = useId();
  const files = useMemo(
    () => [...new Set((graph?.nodes ?? []).map((n) => n.file))].sort(),
    [graph],
  );
  const small = (graph?.nodes.length ?? 0) <= MAX_WHOLE;
  const focusNode = graph?.nodes.find((n) => n.name === focus);
  const entryFile = graph?.nodes.find((n) => n.entry)?.file ?? files[0] ?? null;
  const [scope, setScope] = useState<string | null>(() =>
    small && !focusNode ? null : (focusNode?.file ?? entryFile),
  );
  const [selected, setSelected] = useState<string | null>(focus ?? graph?.entry ?? null);
  const [zoom, setZoom] = useState(3);

  const scene = useMemo(
    () =>
      graph && (scope !== null || small) ? buildScene(graph, r.menus?.menus ?? [], scope) : null,
    [graph, r.menus, scope, small],
  );
  const layout = useMemo(
    () =>
      scene
        ? layoutGraph(
            scene.nodes.map((n) => n.id),
            scene.edges,
          )
        : null,
    [scene],
  );
  if (!graph) return <p className="empty">{t.unavailable}</p>;
  const scale = ZOOMS[zoom] ?? 1;
  const node = graph.nodes.find((n) => n.name === selected);
  const scopeName = scope === null ? g.wholeGame : scope.replace(/^game\//, '');

  return (
    <>
      <PageHeader crumbs={t.crumbs(r.title, t.groups.story)} title={g.title} lede={g.lede}>
        <ul className="counters">
          <li>
            <b>{formatNumber(graph.nodes.length)}</b> {g.counters.labels}
          </li>
          <li>
            <b>{formatNumber(graph.endings.length)}</b> {g.counters.endings}
          </li>
          <li>
            <b>{formatNumber(graph.unreachable.length)}</b> {g.counters.unreachable}
          </li>
          <li className={graph.broken.length > 0 ? 'alert' : undefined}>
            <b>{formatNumber(graph.broken.length)}</b> {g.counters.broken}
          </li>
        </ul>
      </PageHeader>

      <div className="toolbar graph-toolbar">
        <div className="field">
          <label htmlFor={scopeId}>{g.scope}</label>
          <select
            id={scopeId}
            className="select"
            value={scope ?? ''}
            onChange={(e) => {
              setScope(e.currentTarget.value === '' ? null : e.currentTarget.value);
            }}
          >
            <option value="">{g.wholeGame}</option>
            {files.map((f) => (
              <option key={f} value={f}>
                {f.replace(/^game\//, '')}
              </option>
            ))}
          </select>
        </div>
        <ul aria-label={g.legend} className="legend">
          {LEGEND.map((l) => (
            <li key={l.style}>
              <svg width="28" height="8" viewBox="0 0 28 8" aria-hidden="true">
                <path d="M1 4h26" className={`edge edge-${l.style}`} />
              </svg>
              {l.label}
            </li>
          ))}
        </ul>
        <div role="group" aria-label={g.zoom} className="zoom">
          <button
            type="button"
            aria-label={g.zoomOut}
            disabled={zoom === 0}
            onClick={() => {
              setZoom(zoom - 1);
            }}
          >
            −
          </button>
          <span className="mono small">{Math.round(scale * 100)} %</span>
          <button
            type="button"
            aria-label={g.zoomIn}
            disabled={zoom === ZOOMS.length - 1}
            onClick={() => {
              setZoom(zoom + 1);
            }}
          >
            +
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom(3);
            }}
          >
            {g.recenter}
          </button>
        </div>
      </div>

      <div className="split">
        <section
          aria-label={g.canvasLabel(scopeName)}
          className="card split-main graph-canvas"
          data-testid="graph"
        >
          {!scene || !layout ? (
            <p className="card-pad muted">{g.tooBig(graph.nodes.length)}</p>
          ) : (
            <div className="graph-scroll">
              <div
                className="graph-plane"
                style={{ width: `${layout.width * scale}px`, height: `${layout.height * scale}px` }}
              >
                <div
                  className="graph-inner"
                  style={{
                    width: `${layout.width}px`,
                    height: `${layout.height}px`,
                    transform: `scale(${scale})`,
                  }}
                >
                  <svg
                    width={layout.width}
                    height={layout.height}
                    aria-hidden="true"
                    className="graph-edges"
                  >
                    <defs>
                      {(
                        ['jump', 'call', 'choice', 'broken', 'reference', 'fallthrough'] as const
                      ).map((s) => (
                        <marker
                          key={s}
                          id={`arrow-${s}`}
                          viewBox="0 0 8 8"
                          refX="6"
                          refY="4"
                          markerWidth="7"
                          markerHeight="7"
                          orient="auto"
                        >
                          <path d="M0 0 L8 4 L0 8 z" className={`arrow arrow-${s}`} />
                        </marker>
                      ))}
                    </defs>
                    {scene.edges.map((e, i) => {
                      const from = layout.positions.get(e.from);
                      const to = layout.positions.get(e.to);
                      if (!from || !to) return null;
                      return (
                        <path
                          key={i}
                          d={edgePath(from, to, layout.back.has(i))}
                          className={`edge edge-${e.style}`}
                          markerEnd={`url(#arrow-${e.style})`}
                        />
                      );
                    })}
                  </svg>
                  {scene.nodes.map((n) => {
                    const p = layout.positions.get(n.id);
                    if (!p) return null;
                    const label = n.label;
                    const classes = [
                      'graph-node',
                      `node-${n.kind}`,
                      label && !label.reachable ? 'node-unreachable' : '',
                      label?.ending ? 'node-ending' : '',
                      label?.name === selected ? 'node-selected' : '',
                    ]
                      .filter(Boolean)
                      .join(' ');
                    const style = { left: `${p.x}px`, top: `${p.y}px` };
                    const content = (
                      <>
                        <b className={n.kind === 'menu' ? undefined : 'mono'}>{n.title}</b>
                        <span>{n.subtitle}</span>
                      </>
                    );
                    return label ? (
                      <button
                        key={n.id}
                        type="button"
                        className={classes}
                        style={style}
                        aria-pressed={label.name === selected}
                        onClick={() => {
                          setSelected(label.name);
                          if (n.kind === 'external') setScope(label.file);
                        }}
                      >
                        {content}
                      </button>
                    ) : (
                      <div key={n.id} className={classes} style={style}>
                        {content}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </section>
        <div className="split-aside">
          <Aside node={node} graph={graph} menus={r.menus?.menus ?? []} />
        </div>
      </div>

      <section aria-labelledby="titre-problemes" className="structure">
        <h2 id="titre-problemes">{g.structure}</h2>
        <div className="grid-3">
          <div className="card card-pad">
            <h3 className={graph.broken.length > 0 ? 'text-red' : undefined}>
              {g.broken(graph.broken.length)}
            </h3>
            <ul className="list">
              {graph.broken.map((b, i) => (
                <li key={i} className="site">
                  <code>
                    {b.kind} {b.target}
                  </code>
                  <span>{g.inLabel(formatLocation(b.loc), b.label)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="card card-pad">
            <h3>{g.unreachable(graph.unreachable.length)}</h3>
            <ul className="list">
              {graph.unreachable.map((name) => {
                const n = graph.nodes.find((x) => x.name === name);
                return (
                  <li key={name} className="site">
                    <a href={href('graphe', name)} className="mono">
                      {name}
                    </a>
                    {n && <span>{formatLocation(n)}</span>}
                  </li>
                );
              })}
            </ul>
            <p className="small faint">{g.unreachableNote}</p>
          </div>
          <div className="card card-pad">
            <h3>{g.endings(graph.endings.length)}</h3>
            <ul className="tags-list">
              {graph.endings.map((name) => (
                <li key={name}>
                  <a href={href('graphe', name)} className="code-chip">
                    {name}
                  </a>
                </li>
              ))}
            </ul>
            <p className="small faint">{g.endingsNote}</p>
          </div>
        </div>
        {graph.dynamic.length > 0 && (
          <div className="card card-pad">
            <h3>{g.dynamic(graph.dynamic.length)}</h3>
            <ul className="list">
              {graph.dynamic.map((d, i) => (
                <li key={i} className="site">
                  <code>
                    {d.kind} expression {d.expression}
                    {d.resolved && ` ${g.resolved(d.resolved)}`}
                  </code>
                  <span>{g.inLabel(formatLocation(d.loc), d.label)}</span>
                </li>
              ))}
            </ul>
            <p className="small faint">{g.dynamicNote}</p>
          </div>
        )}
      </section>
    </>
  );
}
