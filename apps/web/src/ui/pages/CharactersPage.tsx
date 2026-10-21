import type { CharacterEntry } from '@phanes/core';
import { useMemo, useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon, ImageIcon } from '../components/icons';
import { Callout, Meter, PageHeader } from '../components/ui';
import { formatDecimal, formatLocation, formatNumber, formatPercent } from '../format';
import { useReport } from '../report';
import { href } from '../route';
import { t } from '../strings.fr';
import { characterColor, characterName, definedIn } from './characters-shared';

const VISIBLE = 7;

function Sprites({ character }: { character: CharacterEntry }) {
  const { assets } = useReport();
  const c = t.characters;
  const tags = new Set(
    [character.imageTag, character.name?.toLowerCase()].filter((x): x is string => !!x),
  );
  const images = (assets?.images.entries ?? []).filter((i) => tags.has(i.tag));
  const missing = (assets?.images.missing ?? []).filter((m) =>
    tags.has(m.name.split(' ')[0] ?? ''),
  );
  if (images.length === 0 && missing.length === 0)
    return <p className="small faint">{c.noSprites}</p>;
  return (
    <div className="sprites">
      <div className="card-title-row">
        <h3>{c.sprites(images.length)}</h3>
        <a href={href('ressources', 'images')} className="small">
          {c.seeResources}
        </a>
      </div>
      <ul className="sprite-list">
        {images.slice(0, 12).map((img) => (
          <li key={img.name}>
            <a href={href('ressources', `images:${img.name}`)} className="sprite">
              <ImageIcon size={22} />
              <span className="mono">{img.name}</span>
              {img.displays.length === 0 && <span className="tag tag-amber">{c.neverShown}</span>}
            </a>
          </li>
        ))}
        {missing.slice(0, 6).map((m) => (
          <li key={`missing:${m.name}:${m.site.loc.line}`}>
            <span className="sprite sprite-missing">
              <ImageIcon size={22} />
              <span className="mono">{m.name}</span>
              <span className="tag tag-red">{t.resources.missing.toLowerCase()}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Detail({ character, color }: { character: CharacterEntry; color: string }) {
  const { labels } = useReport();
  const c = t.characters;
  const max = Math.max(1, ...character.linesByFile.map((f) => f.lines));
  return (
    <section aria-labelledby="titre-fiche" className="card card-pad character-detail">
      <div className="character-head">
        <span className="dot dot-large" aria-hidden="true" style={{ background: color }} />
        <h2 id="titre-fiche">{characterName(character)}</h2>
        {character.kind === 'nvl' && <span className="tag">{c.nvl}</span>}
        {character.dynamic && <span className="tag tag-amber">{c.dynamic}</span>}
      </div>
      <div className="grid-3 detail-grid">
        <dl className="kv">
          <div>
            <dt>{c.definition}</dt>
            <dd className="mono">{character.definitionCode ?? definedIn(character)}</dd>
          </div>
          {character.firstLine && (
            <div>
              <dt>{c.firstLine(formatLocation(character.firstLine))}</dt>
              <dd>« {character.firstText} »</dd>
            </div>
          )}
          <div>
            <dt>{c.presentIn}</dt>
            <dd>{c.presentInValue(character.labels, labels?.labels.length ?? 0)}</dd>
          </div>
        </dl>
        <div className="by-file">
          <h3>{c.linesByFile}</h3>
          <ul>
            {character.linesByFile.map((f) => (
              <li key={f.file}>
                <span className="mono">{f.file.replace(/^game\//, '').replace(/\.rpy$/, '')}</span>
                <Meter ratio={f.lines / max} />
                <span className="mono num">{formatNumber(f.lines)}</span>
              </li>
            ))}
          </ul>
        </div>
        <Sprites character={character} />
      </div>
    </section>
  );
}

export function CharactersPage() {
  const r = useReport();
  const [sort, setSort] = useState<'words' | 'lines'>('words');
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const c = t.characters;
  const list = r.characters;
  const rows = useMemo(() => {
    const all = [...(list?.characters ?? [])];
    all.sort((a, b) =>
      sort === 'words'
        ? b.words - a.words || b.lines - a.lines
        : b.lines - a.lines || b.words - a.words,
    );
    return all;
  }, [list, sort]);
  const colors = useMemo(
    () => new Map((list?.characters ?? []).map((ch, i) => [ch.id, characterColor(ch, i)])),
    [list],
  );
  if (!list) return <p className="empty">{t.unavailable}</p>;
  const total = list.totals.words;
  const shown = expanded ? rows : rows.slice(0, VISIBLE);
  const rest = rows.slice(VISIBLE);
  const current =
    rows.find((ch) => ch.id === selected) ?? rows.find((ch) => ch.id !== 'narrator') ?? rows[0];
  const dynamic = rows.filter((ch) => ch.dynamic && ch.lines > 0);
  const restSum = (key: 'lines' | 'words') => rest.reduce((n, ch) => n + ch[key], 0);

  return (
    <>
      <PageHeader
        crumbs={t.crumbs(r.title, t.groups.report)}
        title={t.sections.personnages}
        lede={c.lede(list.characters.length, list.totals.lines, list.totals.words)}
      >
        <div role="group" aria-label={c.sortLabel} className="segmented">
          <button
            type="button"
            aria-pressed={sort === 'words'}
            onClick={() => {
              setSort('words');
            }}
          >
            {c.byWords}
          </button>
          <button
            type="button"
            aria-pressed={sort === 'lines'}
            onClick={() => {
              setSort('lines');
            }}
          >
            {c.byLines}
          </button>
        </div>
      </PageHeader>

      {list.characters.length === 0 ? (
        <p className="empty">{c.empty}</p>
      ) : (
        <section aria-label={c.tableLabel} className="card">
          <div className="table-wrap">
            <table className="table" data-testid="characters">
              <thead>
                <tr>
                  <th scope="col">{c.columns.name}</th>
                  <th scope="col">{c.columns.defined}</th>
                  <th scope="col" className="right">
                    {c.columns.lines}
                  </th>
                  <th scope="col" className="right">
                    {c.columns.words}
                  </th>
                  <th scope="col">{c.columns.share}</th>
                  <th scope="col" className="right">
                    {c.columns.ratio}
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((ch) => (
                  <tr key={ch.id} className={ch.id === current?.id ? 'selected' : undefined}>
                    <td>
                      <button
                        type="button"
                        className="row-button"
                        aria-label={c.select(characterName(ch))}
                        aria-pressed={ch.id === current?.id}
                        onClick={() => {
                          setSelected(ch.id);
                        }}
                      >
                        <span
                          className="dot"
                          aria-hidden="true"
                          style={{ background: colors.get(ch.id) }}
                        />
                        <span>{characterName(ch)}</span>
                        {ch.variable && ch.name !== null && ch.id !== 'narrator' && (
                          <code className="var">{ch.variable}</code>
                        )}
                        {ch.kind === 'nvl' && <span className="tag">{c.nvl}</span>}
                      </button>
                    </td>
                    <td className="mono muted">{definedIn(ch)}</td>
                    <td className="right mono num">{formatNumber(ch.lines)}</td>
                    <td className="right mono num">{formatNumber(ch.words)}</td>
                    <td>
                      <div className="share">
                        <Meter ratio={total === 0 ? 0 : ch.words / total} />
                        <span className="mono small">{formatPercent(ch.words, total)}</span>
                      </div>
                    </td>
                    <td className="right mono num">
                      {ch.lines === 0 ? '—' : formatDecimal(ch.words / ch.lines)}
                    </td>
                  </tr>
                ))}
                {!expanded && rest.length > 0 && (
                  <tr>
                    <td>
                      <button
                        type="button"
                        className="row-button link-button"
                        aria-expanded={false}
                        onClick={() => {
                          setExpanded(true);
                        }}
                      >
                        <ChevronRightIcon size={14} />
                        {c.others(rest.length)}
                      </button>
                    </td>
                    <td />
                    <td className="right mono num">{formatNumber(restSum('lines'))}</td>
                    <td className="right mono num">{formatNumber(restSum('words'))}</td>
                    <td>
                      <div className="share">
                        <Meter ratio={total === 0 ? 0 : restSum('words') / total} />
                        <span className="mono small">{formatPercent(restSum('words'), total)}</span>
                      </div>
                    </td>
                    <td />
                  </tr>
                )}
                {expanded && rest.length > 0 && (
                  <tr>
                    <td colSpan={6}>
                      <button
                        type="button"
                        className="row-button link-button"
                        aria-expanded={true}
                        onClick={() => {
                          setExpanded(false);
                        }}
                      >
                        <ChevronDownIcon size={14} />
                        {c.others(rest.length)}
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {dynamic.map((ch) => (
        <Callout key={ch.id} tone="info">
          <code>{ch.definitionCode ?? ch.variable ?? ch.id}</code> {c.dynamicCallout(ch.lines)}
        </Callout>
      ))}

      {current && <Detail character={current} color={colors.get(current.id) ?? '#a3a8b8'} />}
    </>
  );
}
