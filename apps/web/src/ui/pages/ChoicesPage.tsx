import type { MenuEntry, MenuOption } from '@phanes/core';
import { type ReactNode, useMemo, useState } from 'react';
import { ChipGroup, PageHeader, Select } from '../components/ui';
import { formatLocation } from '../format';
import { useReport } from '../report';
import { href } from '../route';
import { t } from '../strings.fr';
import { characterName } from './characters-shared';

const PAGE = 20;
type Filter = 'all' | 'conditional' | 'prompt';

function Next({ option }: { option: MenuOption }) {
  const c = t.choices;
  // "bloc de 3 répliques, $ x -= 1, puis jump y", as in the mockup.
  const before: ReactNode[] = [];
  if (option.lines > 0) before.push(c.lines(option.lines));
  for (const code of option.python) before.push(<code>$ {code}</code>);
  const after: ReactNode[] = option.targets.map((target) => (
    <code>
      {target.kind} {target.target}
    </code>
  ));
  if (option.fallsThrough) after.push(c.continues);
  const join = (items: ReactNode[]) =>
    items.map((item, i) => (
      <span key={i}>
        {i > 0 && ', '}
        {item}
      </span>
    ));
  return (
    <>
      {join(before)}
      {before.length > 0 && after.length > 0 && c.then}
      {join(after)}
      {option.targets.some((target) => target.broken) && (
        <span className="text-red">{c.broken}</span>
      )}
    </>
  );
}

function MenuCard({
  menu,
  speakerName,
}: {
  menu: MenuEntry;
  speakerName: (who: string | null) => string;
}) {
  const c = t.choices;
  const conditional = menu.options.some((o) => o.condition !== null);
  return (
    <article
      className={conditional ? 'card menu-card conditional' : 'card menu-card'}
      id={`menu-${menu.id}`}
    >
      <header className="menu-head">
        <div className="menu-title">
          <h2>
            {c.menuIn}
            <span className="mono text-amber">{menu.label ?? c.outsideLabel}</span>
          </h2>
          <span className="mono small muted">
            {formatLocation({ file: menu.file, line: menu.line })}
          </span>
        </div>
        {menu.label && (
          <a href={href('graphe', menu.label)} className="small">
            {c.seeGraph}
          </a>
        )}
      </header>
      {menu.prompt ? (
        <p className="menu-prompt">
          <span className="speaker">{speakerName(menu.prompt.who)}</span> « {menu.prompt.text} »
        </p>
      ) : (
        <p className="menu-prompt faint">{c.noPrompt}</p>
      )}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col" className="w-36">
                {c.columns.option}
              </th>
              <th scope="col" className="w-28">
                {c.columns.condition}
              </th>
              <th scope="col">{c.columns.next}</th>
            </tr>
          </thead>
          <tbody>
            {menu.options.map((o, i) => (
              <tr key={`${o.text}:${i}`}>
                <td>« {o.text} »</td>
                <td>
                  {o.condition ? (
                    <code className="code-chip">{o.condition}</code>
                  ) : (
                    <span className="faint">—</span>
                  )}
                </td>
                <td className="small text-2 next-cell">
                  <Next option={o} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

export function ChoicesPage({ focus }: { focus: string | null }) {
  const r = useReport();
  const [filter, setFilter] = useState<Filter>('all');
  const [file, setFile] = useState('');
  const [shown, setShown] = useState(PAGE);
  const c = t.choices;
  const menus = r.menus;
  const definitions = useMemo(
    () => new Map((r.characters?.characters ?? []).map((ch) => [ch.id, ch])),
    [r.characters],
  );
  const speakerName = (who: string | null) => {
    if (who === null) return t.characters.narrator;
    const ch = definitions.get(who);
    return ch ? characterName(ch) : who;
  };
  const files = useMemo(
    () => [...new Set((menus?.menus ?? []).map((m) => m.file))].sort(),
    [menus],
  );
  const list = useMemo(
    () =>
      (menus?.menus ?? []).filter(
        (m) =>
          (!file || m.file === file) &&
          (filter !== 'conditional' || m.options.some((o) => o.condition !== null)) &&
          (filter !== 'prompt' || m.prompt !== null) &&
          (!focus || m.label === focus || m.id === focus),
      ),
    [menus, file, filter, focus],
  );

  if (!menus) return <p className="empty">{t.unavailable}</p>;
  const all = menus.menus;
  return (
    <>
      <PageHeader
        crumbs={t.crumbs(r.title, t.groups.story)}
        title={t.sections.choix}
        lede={c.lede(menus.totals.menus, menus.totals.options, menus.totals.conditional)}
      />
      {all.length === 0 ? (
        <p className="empty">{c.empty}</p>
      ) : (
        <>
          <div className="toolbar">
            <ChipGroup
              label={c.filterLabel}
              value={filter}
              onChange={(f) => {
                setFilter(f);
                setShown(PAGE);
              }}
              options={[
                { value: 'all', label: c.filters.all, count: all.length },
                {
                  value: 'conditional',
                  label: c.filters.conditional,
                  count: all.filter((m) => m.options.some((o) => o.condition !== null)).length,
                },
                { value: 'prompt', label: c.filters.prompt, count: menus.totals.withPrompt },
              ]}
            />
            <Select
              label={c.file}
              value={file}
              onChange={(f) => {
                setFile(f);
                setShown(PAGE);
              }}
              options={[
                { value: '', label: c.allFiles },
                ...files.map((f) => ({ value: f, label: f.replace(/^game\//, '') })),
              ]}
            />
          </div>
          <div className="stack" data-testid="menus">
            {list.slice(0, shown).map((m) => (
              <MenuCard key={m.id} menu={m} speakerName={speakerName} />
            ))}
          </div>
          {list.length > shown && (
            <div className="more">
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={() => {
                  setShown(shown + PAGE);
                }}
              >
                {c.more(Math.min(PAGE, list.length - shown))}
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
