import type { VariableEntry, VariableSite } from '@phanes/core';
import { Fragment, useMemo, useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon } from '../components/icons';
import { ChipGroup, PageHeader, Pager, SearchField } from '../components/ui';
import { formatLocation, formatNumber } from '../format';
import { useReport } from '../report';
import { href } from '../route';
import { t } from '../strings.fr';

const PAGE = 50;
const SITES = 3;
type Filter = 'all' | 'default' | 'define' | 'neverRead' | 'neverWritten';

function Sites({ title, sites }: { title: string; sites: readonly VariableSite[] }) {
  const [all, setAll] = useState(false);
  const v = t.variables;
  const shown = all ? sites : sites.slice(0, SITES);
  return (
    <div className="sites">
      <h3>{title}</h3>
      {sites.length === 0 ? (
        <p className="small faint">{v.noSite}</p>
      ) : (
        <ul className="list">
          {shown.map((site, i) => (
            <li key={`${site.loc.file}:${site.loc.line}:${i}`} className="site">
              <code>{site.code}</code>
              <span>
                {formatLocation(site.loc)}
                {site.label && (
                  <>
                    {' · '}
                    <a href={href('lecteur', site.label)}>{site.label}</a>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {!all && sites.length > SITES && (
        <button
          type="button"
          className="link-button"
          onClick={() => {
            setAll(true);
          }}
        >
          {t.others(sites.length - SITES)}
        </button>
      )}
    </div>
  );
}

function neverRead(v: VariableEntry): boolean {
  return !v.character && !v.engine && v.reads.length === 0;
}

function neverWritten(v: VariableEntry): boolean {
  return v.kind === 'default' && !v.character && v.writes.length === 0;
}

export function VariablesPage() {
  const r = useReport();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [page, setPage] = useState(0);
  const v = t.variables;
  const result = r.variables;
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (result?.variables ?? []).filter(
      (x) =>
        !x.character &&
        (!needle || x.name.toLowerCase().includes(needle)) &&
        (filter === 'all' ||
          (filter === 'default' && x.kind === 'default') ||
          (filter === 'define' && x.kind === 'define') ||
          (filter === 'neverRead' && neverRead(x)) ||
          (filter === 'neverWritten' && neverWritten(x))),
    );
  }, [result, query, filter]);
  if (!result) return <p className="empty">{t.unavailable}</p>;
  const all = result.variables;
  const plain = all.filter((x) => !x.character);
  const visible = rows.slice(page * PAGE, page * PAGE + PAGE);
  const toggle = (name: string) => {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };
  const c = v.columns;
  return (
    <>
      <PageHeader
        crumbs={t.crumbs(r.title, t.groups.story)}
        title={t.sections.variables}
        lede={v.lede(
          result.totals.variables,
          result.totals.default,
          result.totals.define,
          result.totals.characters,
        )}
      >
        <SearchField
          label={v.search}
          value={query}
          onChange={(value) => {
            setQuery(value);
            setPage(0);
          }}
        />
      </PageHeader>

      <ChipGroup
        label={v.filterLabel}
        value={filter}
        onChange={(f) => {
          setFilter(f);
          setPage(0);
        }}
        options={[
          { value: 'all', label: v.filters.all, count: plain.length },
          {
            value: 'default',
            label: v.filters.default,
            count: plain.filter((x) => x.kind === 'default').length,
          },
          {
            value: 'define',
            label: v.filters.define,
            count: plain.filter((x) => x.kind === 'define').length,
          },
          { value: 'neverRead', label: v.filters.neverRead, count: result.totals.neverRead },
          {
            value: 'neverWritten',
            label: v.filters.neverWritten,
            count: result.totals.neverWritten,
          },
        ]}
      />

      <section aria-label={v.tableLabel} className="card" data-testid="variables">
        {plain.length === 0 ? (
          <p className="empty card-pad">{v.empty}</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">{c.name}</th>
                  <th scope="col">{c.kind}</th>
                  <th scope="col">{c.value}</th>
                  <th scope="col">{c.file}</th>
                  <th scope="col" className="right">
                    {c.writes}
                  </th>
                  <th scope="col" className="right">
                    {c.reads}
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((x) => {
                  const expanded = open.has(x.name);
                  return (
                    <Fragment key={x.name}>
                      <tr className={expanded ? 'selected' : undefined}>
                        <td>
                          <button
                            type="button"
                            className="row-button mono"
                            aria-expanded={expanded}
                            aria-label={v.toggle(x.name)}
                            onClick={() => {
                              toggle(x.name);
                            }}
                          >
                            {expanded ? (
                              <ChevronDownIcon size={14} />
                            ) : (
                              <ChevronRightIcon size={14} />
                            )}
                            {x.name}
                          </button>
                          {x.engine && <span className="tag">{v.engine}</span>}
                        </td>
                        <td className="mono muted">{x.kind}</td>
                        <td>
                          <code className="value">{x.value}</code>
                        </td>
                        <td className="mono muted">{formatLocation(x.loc)}</td>
                        <td className="right mono num">
                          {x.kind === 'define' && x.writes.length === 0
                            ? '—'
                            : formatNumber(x.writes.length)}
                        </td>
                        <td className="right mono num">
                          {neverRead(x) ? (
                            <span className="tag tag-amber">{v.neverRead}</span>
                          ) : (
                            formatNumber(x.reads.length)
                          )}
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="expanded-row">
                          <td colSpan={6}>
                            <div className="grid-2">
                              <Sites title={v.writtenAt(x.writes.length)} sites={x.writes} />
                              <Sites title={v.readAt(x.reads.length)} sites={x.reads} />
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="table-foot">
          {v.shown(visible.length, rows.length)}{' '}
          {result.totals.characters > 0 && (
            <>
              {v.charactersBefore}
              <a href={href('personnages')}>{t.sections.personnages}</a>.
            </>
          )}
        </p>
        <Pager page={page} pageSize={PAGE} total={rows.length} onPage={setPage} label={t.pager} />
      </section>

      <p className="small faint">{v.heuristic}</p>
    </>
  );
}
