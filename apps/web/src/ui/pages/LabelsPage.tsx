import type { GraphNode, LabelEntry } from '@phanes/core';
import { useMemo, useState } from 'react';
import { ChipGroup, PageHeader, Pager, SearchField } from '../components/ui';
import { formatNumber } from '../format';
import { useReport } from '../report';
import { href } from '../route';
import { t } from '../strings.fr';

const PAGE = 50;
type Filter = 'all' | 'entry' | 'endings' | 'unreachable' | 'local';
type SortKey = 'name' | 'file' | 'line' | 'lines';

function compare(a: LabelEntry, b: LabelEntry, key: SortKey): number {
  if (key === 'lines') return b.lines - a.lines;
  if (key === 'line') return a.line - b.line;
  const x = key === 'name' ? a.name : a.file;
  const y = key === 'name' ? b.name : b.file;
  return x < y ? -1 : x > y ? 1 : a.line - b.line;
}

function Status({ label, node }: { label: LabelEntry; node: GraphNode | undefined }) {
  const s = t.labels.status;
  const tags: { text: string; tone: string }[] = [];
  if (node?.entry) tags.push({ text: s.entry, tone: 'tag-teal' });
  if (node?.ending) tags.push({ text: s.ending, tone: 'tag-blue' });
  if (node && !node.reachable) tags.push({ text: s.unreachable, tone: 'tag-red' });
  if (label.local) tags.push({ text: s.local, tone: '' });
  if (label.hidden) tags.push({ text: s.hidden, tone: '' });
  return (
    <span className="tags">
      {tags.map((tag) => (
        <span key={tag.text} className={`tag ${tag.tone}`}>
          {tag.text}
        </span>
      ))}
    </span>
  );
}

export function LabelsPage() {
  const r = useReport();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<SortKey>('file');
  const [page, setPage] = useState(0);
  const l = t.labels;
  const labels = r.labels?.labels;
  const nodes = useMemo(() => new Map((r.graph?.nodes ?? []).map((n) => [n.name, n])), [r.graph]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const keep = (label: LabelEntry) => {
      const node = nodes.get(label.name);
      if (filter === 'entry' && !node?.entry) return false;
      if (filter === 'endings' && !node?.ending) return false;
      if (filter === 'unreachable' && (!node || node.reachable)) return false;
      if (filter === 'local' && !label.local) return false;
      return (
        !needle ||
        label.name.toLowerCase().includes(needle) ||
        label.file.toLowerCase().includes(needle)
      );
    };
    return (labels ?? []).filter(keep).sort((a, b) => compare(a, b, sort));
  }, [labels, nodes, filter, query, sort]);

  if (!labels) return <p className="empty">{t.unavailable}</p>;
  const count = (f: (n: GraphNode | undefined, label: LabelEntry) => boolean) =>
    labels.filter((label) => f(nodes.get(label.name), label)).length;
  const visible = rows.slice(page * PAGE, page * PAGE + PAGE);
  const header = (key: SortKey, text: string, right = false) => (
    <th
      scope="col"
      className={right ? 'right' : undefined}
      aria-sort={sort === key ? 'ascending' : undefined}
    >
      <button
        type="button"
        onClick={() => {
          setSort(key);
          setPage(0);
        }}
      >
        {text}
        {sort === key ? ' ↑' : ''}
      </button>
    </th>
  );

  return (
    <>
      <PageHeader
        crumbs={t.crumbs(r.title, t.groups.report)}
        title={t.sections.labels}
        lede={l.lede(labels.length)}
      >
        <SearchField
          label={l.search}
          value={query}
          onChange={(v) => {
            setQuery(v);
            setPage(0);
          }}
        />
      </PageHeader>

      <ChipGroup
        label={l.filterLabel}
        value={filter}
        onChange={(f) => {
          setFilter(f);
          setPage(0);
        }}
        options={[
          { value: 'all', label: l.filters.all, count: labels.length },
          { value: 'entry', label: l.filters.entry, count: count((n) => !!n?.entry) },
          { value: 'endings', label: l.filters.endings, count: count((n) => !!n?.ending) },
          {
            value: 'unreachable',
            label: l.filters.unreachable,
            count: count((n) => !!n && !n.reachable),
          },
          { value: 'local', label: l.filters.local, count: count((_, label) => label.local) },
        ]}
      />

      {r.labels.duplicates.length > 0 && (
        <p className="small text-red">{l.duplicates(r.labels.duplicates.join(', '))}</p>
      )}

      <section aria-label={l.listLabel} className="card" data-testid="labels">
        {labels.length === 0 ? (
          <p className="empty card-pad">{l.empty}</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  {header('name', l.columns.name)}
                  {header('file', l.columns.file)}
                  {header('line', l.columns.line, true)}
                  {header('lines', l.columns.lines, true)}
                  <th scope="col">{l.columns.status}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((label) => (
                  <tr key={`${label.script}:${label.line}:${label.name}`}>
                    <td>
                      <a href={href('lecteur', label.name)} className="mono label-link">
                        {label.name}
                      </a>
                    </td>
                    <td className="mono muted">{label.file.replace(/^game\//, '')}</td>
                    <td className="right mono num muted">{label.line}</td>
                    <td className="right mono num">{formatNumber(label.lines)}</td>
                    <td>
                      <Status label={label} node={nodes.get(label.name)} />
                    </td>
                  </tr>
                ))}
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted">
                      {l.noMatch}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} pageSize={PAGE} total={rows.length} onPage={setPage} label={t.pager} />
      </section>

      {r.graph && (
        <p className="small faint">
          {l.noteBefore}
          <a href={href('graphe')}>{l.noteLink}</a>.
        </p>
      )}
    </>
  );
}
