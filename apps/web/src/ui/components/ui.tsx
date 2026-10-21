import type { ReactNode } from 'react';
import { formatNumber } from '../format';
import { InfoIcon, SearchIcon, WarningIcon } from './icons';

export function PageHeader({
  crumbs,
  title,
  lede,
  children,
}: {
  crumbs: string;
  title: string;
  lede?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <p className="crumbs">{crumbs}</p>
        <h1>{title}</h1>
        {lede !== undefined && <p className="lede">{lede}</p>}
      </div>
      {children}
    </header>
  );
}

export interface ChipOption<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly count?: number;
}

/** Mutually exclusive filter chips (`aria-pressed`). */
export function ChipGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="chips">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="chip"
          aria-pressed={o.value === value}
          onClick={() => {
            onChange(o.value);
          }}
        >
          {o.label}
          {o.count !== undefined && ` · ${formatNumber(o.count)}`}
        </button>
      ))}
    </div>
  );
}

export function StatCard({
  label,
  value,
  detail,
  children,
}: {
  label: string;
  value: string;
  detail?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {detail !== undefined && <span className="stat-detail">{detail}</span>}
      {children}
    </div>
  );
}

/** A decorative ratio bar; the number it shows must also be in text nearby. */
export function Meter({ ratio, tone }: { ratio: number; tone?: 'blue' | 'red' }) {
  const width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
  return (
    <div className={tone ? `meter meter-${tone}` : 'meter'} aria-hidden="true">
      <span style={{ width }} />
    </div>
  );
}

export function SearchField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="search">
      <SearchIcon />
      <input
        type="search"
        aria-label={label}
        placeholder={label}
        value={value}
        onChange={(e) => {
          onChange(e.currentTarget.value);
        }}
      />
    </div>
  );
}

export function Callout({
  tone,
  children,
  action,
}: {
  tone: 'error' | 'info';
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={`callout callout-${tone}`}>
      {tone === 'error' ? <WarningIcon size={20} /> : <InfoIcon size={20} />}
      <p>{children}</p>
      {action}
    </div>
  );
}

/** "1–50 sur 214" with previous / next buttons. */
export function Pager({
  page,
  pageSize,
  total,
  onPage,
  label,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  label: {
    range: (from: number, to: number, total: number) => string;
    previous: string;
    next: string;
  };
}) {
  if (total <= pageSize) return null;
  const from = page * pageSize + 1;
  const to = Math.min(total, from + pageSize - 1);
  return (
    <nav className="pager" aria-label="Pagination">
      <span>{label.range(from, to, total)}</span>
      <div>
        <button
          type="button"
          disabled={page === 0}
          onClick={() => {
            onPage(page - 1);
          }}
        >
          {label.previous}
        </button>
        <button
          type="button"
          disabled={to >= total}
          onClick={() => {
            onPage(page + 1);
          }}
        >
          {label.next}
        </button>
      </div>
    </nav>
  );
}
