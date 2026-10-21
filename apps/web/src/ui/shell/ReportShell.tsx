import { useEffect, useRef } from 'react';
import { CharactersPage } from '../pages/CharactersPage';
import { ChoicesPage } from '../pages/ChoicesPage';
import { DiagnosticsPage } from '../pages/DiagnosticsPage';
import { ExportPage } from '../pages/ExportPage';
import { GraphPage } from '../pages/GraphPage';
import { InventoryPage } from '../pages/InventoryPage';
import { LabelsPage } from '../pages/LabelsPage';
import { OverviewPage } from '../pages/OverviewPage';
import { ReaderPage } from '../pages/ReaderPage';
import { ResourcesPage } from '../pages/ResourcesPage';
import { TranslationsPage } from '../pages/TranslationsPage';
import { VariablesPage } from '../pages/VariablesPage';
import { useRoute } from '../route';
import { SideNav } from './SideNav';

export function ReportShell({ onReset }: { onReset: () => void }) {
  const route = useRoute();
  const main = useRef<HTMLElement>(null);
  const key = `${route.section}/${route.param ?? ''}`;

  useEffect(() => {
    // A new page starts at the top, with focus on its content for screen readers.
    window.scrollTo(0, 0);
    main.current?.focus({ preventScroll: true });
  }, [key]);

  return (
    <div className="shell" data-testid="report">
      <SideNav current={route.section} onReset={onReset} />
      <main className="main" ref={main} tabIndex={-1}>
        {route.section === 'vue-ensemble' && <OverviewPage />}
        {route.section === 'inventaire' && <InventoryPage />}
        {route.section === 'personnages' && <CharactersPage />}
        {route.section === 'labels' && <LabelsPage />}
        {route.section === 'diagnostics' && <DiagnosticsPage />}
        {route.section === 'graphe' && <GraphPage key={route.param ?? ''} focus={route.param} />}
        {route.section === 'choix' && <ChoicesPage key={route.param ?? ''} focus={route.param} />}
        {route.section === 'variables' && <VariablesPage />}
        {route.section === 'lecteur' && <ReaderPage label={route.param} />}
        {route.section === 'ressources' && <ResourcesPage tab={route.param} />}
        {route.section === 'traductions' && <TranslationsPage />}
        {route.section === 'export' && <ExportPage />}
      </main>
    </div>
  );
}
