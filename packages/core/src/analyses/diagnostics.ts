import type { Severity } from '../model/diagnostic';
import type { Analysis } from './analysis';

export type DiagnosticsResult = {
  total: number;
  bySeverity: Record<Severity, number>;
  byCode: Record<string, number>;
  /** Files with at least one error. */
  failedFiles: string[];
};

/** Summary of the problems found while loading the project. */
export const diagnosticsAnalysis: Analysis<DiagnosticsResult> = {
  id: 'diagnostics',
  run({ diagnostics }) {
    const bySeverity: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
    const byCode: Record<string, number> = {};
    const failed = new Set<string>();
    for (const d of diagnostics) {
      bySeverity[d.severity]++;
      byCode[d.code] = (byCode[d.code] ?? 0) + 1;
      if (d.severity === 'error' && d.path !== undefined) failed.add(d.path);
    }
    return { total: diagnostics.length, bySeverity, byCode, failedFiles: [...failed].sort() };
  },
};
