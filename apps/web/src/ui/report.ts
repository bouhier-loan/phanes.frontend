import type {
  AssetsResult,
  CharactersResult,
  Diagnostic,
  InventoryResult,
  LabelsResult,
  MenusResult,
  OverviewResult,
  Report,
  StoryGraphResult,
  TranslationsResult,
  VariablesResult,
} from '@phanes/core';
import { createContext, useContext } from 'react';

/** The report with each analysis typed; an analysis that failed is undefined. */
export interface ReportData {
  readonly report: Report;
  readonly overview: OverviewResult | undefined;
  readonly inventory: InventoryResult | undefined;
  readonly characters: CharactersResult | undefined;
  readonly labels: LabelsResult | undefined;
  readonly graph: StoryGraphResult | undefined;
  readonly menus: MenusResult | undefined;
  readonly variables: VariablesResult | undefined;
  readonly assets: AssetsResult | undefined;
  readonly translations: TranslationsResult | undefined;
  readonly diagnostics: readonly Diagnostic[];
  /** Game title, else the dropped folder's name. */
  readonly title: string;
  /** Wall-clock duration of the analysis, measured by the page. */
  readonly durationMs: number | null;
}

export function reportData(report: Report, durationMs: number | null): ReportData {
  const a = report.analyses;
  const overview = a.overview as OverviewResult | undefined;
  return {
    report,
    overview,
    inventory: a.inventory as InventoryResult | undefined,
    characters: a.characters as CharactersResult | undefined,
    labels: a.labels as LabelsResult | undefined,
    graph: a.storyGraph as StoryGraphResult | undefined,
    menus: a.menus as MenusResult | undefined,
    variables: a.variables as VariablesResult | undefined,
    assets: a.assets as AssetsResult | undefined,
    translations: a.translations as TranslationsResult | undefined,
    diagnostics: report.diagnostics,
    title: overview?.title ?? report.input.rootName ?? 'Jeu sans titre',
    durationMs,
  };
}

export const ReportContext = createContext<ReportData | null>(null);

export function useReport(): ReportData {
  const data = useContext(ReportContext);
  if (!data) throw new Error('useReport() outside of a report');
  return data;
}
