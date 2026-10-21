import type { CharacterEntry, CharactersResult } from '@phanes/core';
import { formatNumber, formatPercent } from '../format';
import { t } from '../strings.fr';

function displayName(c: CharacterEntry): string {
  if (c.id === 'narrator') return t.characters.narrator;
  if (c.name) return c.name;
  if (c.origin === 'expression') return c.id.slice('expr:'.length);
  return c.variable ?? t.characters.nameless;
}

export function CharactersSection({ characters }: { characters: CharactersResult }) {
  const total = characters.totals.words;
  if (characters.characters.length === 0) return <p className="empty">{t.characters.empty}</p>;
  const c = t.characters.columns;
  return (
    <table className="data" data-testid="characters">
      <thead>
        <tr>
          <th>{c.name}</th>
          <th>{c.variable}</th>
          <th>{c.origin}</th>
          <th className="num">{c.lines}</th>
          <th className="num">{c.words}</th>
          <th className="num">{c.share}</th>
        </tr>
      </thead>
      <tbody>
        {characters.characters.map((ch) => (
          <tr key={ch.id}>
            <td>
              {displayName(ch)}
              {ch.kind === 'nvl' && <span className="tag">{t.characters.nvl}</span>}
              {ch.dynamic && <span className="tag">{t.characters.dynamic}</span>}
            </td>
            <td className="mono">{ch.variable ?? ''}</td>
            <td>{t.characters.origin[ch.origin]}</td>
            <td className="num">{formatNumber(ch.lines)}</td>
            <td className="num">{formatNumber(ch.words)}</td>
            <td className="num">{formatPercent(ch.words, total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
