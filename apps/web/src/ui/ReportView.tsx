import type {
  CharactersResult,
  InventoryResult,
  LabelsResult,
  OverviewResult,
  Report,
} from '@phanes/core';
import { useState } from 'react';
import { CharactersSection } from './sections/CharactersSection';
import { DiagnosticsSection } from './sections/DiagnosticsSection';
import { InventorySection } from './sections/InventorySection';
import { LabelsSection } from './sections/LabelsSection';
import { OverviewSection } from './sections/OverviewSection';
import { downloadReport } from './export';
import { t } from './strings.fr';

const TABS = ['overview', 'inventory', 'characters', 'labels', 'diagnostics'] as const;
type Tab = (typeof TABS)[number];

interface Props {
  report: Report;
  onReset: () => void;
}

function Unavailable() {
  return <p className="empty">{t.report.unavailable}</p>;
}

export function ReportView({ report, onReset }: Props) {
  const [tab, setTab] = useState<Tab>('overview');
  const a = report.analyses;
  const errors = report.diagnostics.filter((d) => d.severity === 'error').length;
  return (
    <section className="report" data-testid="report">
      <div className="report-actions">
        <button
          type="button"
          onClick={() => {
            downloadReport(report);
          }}
        >
          {t.report.export}
        </button>
        <button type="button" className="secondary" onClick={onReset}>
          {t.report.analyzeAnother}
        </button>
      </div>
      <nav className="tabs" role="tablist">
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? 'tab selected' : 'tab'}
            onClick={() => {
              setTab(id);
            }}
          >
            {t.report.tabs[id]}
            {id === 'diagnostics' && report.diagnostics.length > 0 && (
              <span className={errors > 0 ? 'badge error' : 'badge'}>
                {report.diagnostics.length}
              </span>
            )}
          </button>
        ))}
      </nav>
      <div className="tab-panel" role="tabpanel">
        {tab === 'overview' &&
          (a.overview ? (
            <OverviewSection
              overview={a.overview as OverviewResult}
              inventory={a.inventory as InventoryResult | undefined}
            />
          ) : (
            <Unavailable />
          ))}
        {tab === 'inventory' &&
          (a.inventory ? (
            <InventorySection inventory={a.inventory as InventoryResult} />
          ) : (
            <Unavailable />
          ))}
        {tab === 'characters' &&
          (a.characters ? (
            <CharactersSection characters={a.characters as CharactersResult} />
          ) : (
            <Unavailable />
          ))}
        {tab === 'labels' &&
          (a.labels ? <LabelsSection labels={a.labels as LabelsResult} /> : <Unavailable />)}
        {tab === 'diagnostics' && <DiagnosticsSection diagnostics={report.diagnostics} />}
      </div>
    </section>
  );
}
