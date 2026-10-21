import type { LabelsResult } from '@phanes/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useMemo, useRef, useState } from 'react';
import { formatNumber } from '../format';
import { t } from '../strings.fr';

const ROW_HEIGHT = 30;

export function LabelsSection({ labels }: { labels: LabelsResult }) {
  const [query, setQuery] = useState('');
  const parent = useRef<HTMLDivElement>(null);
  const needle = query.trim().toLowerCase();
  const rows = useMemo(
    () =>
      needle
        ? labels.labels.filter(
            (l) => l.name.toLowerCase().includes(needle) || l.file.toLowerCase().includes(needle),
          )
        : labels.labels,
    [labels, needle],
  );
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parent.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  });
  if (labels.labels.length === 0) return <p className="empty">{t.labels.empty}</p>;
  const c = t.labels.columns;
  return (
    <div className="labels" data-testid="labels">
      <p>{t.labels.count(labels.labels.length)}</p>
      {labels.duplicates.length > 0 && (
        <p className="note">{t.labels.duplicates(labels.duplicates.join(', '))}</p>
      )}
      <input
        type="search"
        className="search"
        placeholder={t.labels.search}
        value={query}
        onChange={(e) => {
          setQuery(e.currentTarget.value);
        }}
      />
      <div className="grid-header labels-grid" role="row">
        <span className="cell name">{c.name}</span>
        <span className="cell">{c.file}</span>
        <span className="cell num">{c.line}</span>
        <span className="cell num">{c.lines}</span>
        <span className="cell num">{c.words}</span>
      </div>
      <div className="scroller" ref={parent} role="table">
        <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
          {virtualizer.getVirtualItems().map((item) => {
            const l = rows[item.index];
            if (!l) return null;
            return (
              <div
                key={`${l.script}:${l.line}:${l.name}`}
                className="grid-row labels-grid"
                role="row"
                style={{ transform: `translateY(${item.start}px)`, height: `${ROW_HEIGHT}px` }}
              >
                <span className="cell name mono">
                  {l.name}
                  {l.local && <span className="tag">{t.labels.local}</span>}
                  {l.hidden && <span className="tag">{t.labels.hidden}</span>}
                </span>
                <span className="cell mono">{l.file}</span>
                <span className="cell num">{l.line}</span>
                <span className="cell num">{formatNumber(l.lines)}</span>
                <span className="cell num">{formatNumber(l.words)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
