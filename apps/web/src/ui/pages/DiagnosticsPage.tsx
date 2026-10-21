import type { Diagnostic } from '@phanes/core';
import { useState } from 'react';
import { ErrorIcon, InfoIcon, WarningIcon } from '../components/icons';
import { ChipGroup, PageHeader } from '../components/ui';
import { useReport } from '../report';
import { href } from '../route';
import { consequenceOf, describeDiagnostic, t } from '../strings.fr';

type Severity = Diagnostic['severity'];
const ORDER: Readonly<Record<Severity, number>> = { error: 0, warning: 1, info: 2 };
const ICONS = { error: ErrorIcon, warning: WarningIcon, info: InfoIcon } as const;

function DiagnosticCard({ diagnostic: d }: { diagnostic: Diagnostic }) {
  const [open, setOpen] = useState(false);
  const Icon = ICONS[d.severity];
  const consequence = consequenceOf(d);
  const details = Object.entries(d.details ?? {}).filter(([, v]) => v !== null && v !== '');
  const s = t.diagnostics;
  return (
    <li className={`card diagnostic diagnostic-${d.severity}`}>
      <div className="diagnostic-row">
        <span className="diagnostic-severity">
          <Icon />
          {s.severity[d.severity]}
        </span>
        <div className="diagnostic-body">
          {d.path && <span className="mono diagnostic-path">{d.path}</span>}
          <span>{describeDiagnostic(d)}</span>
          {consequence && <span className="small muted">{consequence}</span>}
        </div>
        {d.code === 'TL_IDS_UNAVAILABLE' && (
          <a href={href('traductions')} className="small">
            {s.seeTranslations}
          </a>
        )}
        <button
          type="button"
          className="link-button"
          aria-expanded={open}
          onClick={() => {
            setOpen(!open);
          }}
        >
          {open ? s.hideDetails : s.showDetails}
        </button>
      </div>
      {open && (
        <dl className="diagnostic-details">
          {details.map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd className="mono">{String(value)}</dd>
            </div>
          ))}
          <div>
            <dt>message</dt>
            <dd className="mono">{d.message}</dd>
          </div>
          <div>
            <dt>{s.code}</dt>
            <dd className="mono">{d.code}</dd>
          </div>
        </dl>
      )}
    </li>
  );
}

export function DiagnosticsPage() {
  const r = useReport();
  const [filter, setFilter] = useState<Severity | 'all'>('all');
  const s = t.diagnostics;
  const count = (sev: Severity) => r.diagnostics.filter((d) => d.severity === sev).length;
  const sorted = [...r.diagnostics]
    .filter((d) => filter === 'all' || d.severity === filter)
    .sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
  return (
    <>
      <PageHeader
        crumbs={t.crumbs(r.title, t.groups.report)}
        title={t.sections.diagnostics}
        lede={s.lede}
      />
      {r.diagnostics.length === 0 ? (
        <p className="empty" data-testid="diagnostics">
          {s.none}
        </p>
      ) : (
        <>
          <ChipGroup
            label={s.filterLabel}
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: s.all, count: r.diagnostics.length },
              { value: 'error', label: s.plural.error, count: count('error') },
              { value: 'warning', label: s.plural.warning, count: count('warning') },
              { value: 'info', label: s.plural.info, count: count('info') },
            ]}
          />
          <ul className="diagnostics" data-testid="diagnostics">
            {sorted.map((d, i) => (
              <DiagnosticCard key={`${d.code}:${d.path ?? ''}:${i}`} diagnostic={d} />
            ))}
          </ul>
        </>
      )}
    </>
  );
}
