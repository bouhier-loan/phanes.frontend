import type { Analysis } from './analysis';
import { dialogueIndex } from './dialogue';
import { walkStatements } from './walk';

export type LabelEntry = {
  name: string;
  /** Source file recorded by Ren'Py, and line of the label statement. */
  file: string;
  line: number;
  /** Compiled script (VFS path) the label was read from. */
  script: string;
  /** Local label (`label .name:`), stored by Ren'Py as "parent.name". */
  local: boolean;
  parent: string | null;
  hidden: boolean;
  hasParameters: boolean;
  /** Dialogue lines and words inside the label's block. */
  lines: number;
  words: number;
};

export type LabelsResult = {
  labels: LabelEntry[];
  /** Names defined more than once (Ren'Py refuses this at load time). */
  duplicates: string[];
};

export const labelsAnalysis: Analysis<LabelsResult> = {
  id: 'labels',
  run(project) {
    const index = dialogueIndex(project);
    const labels: LabelEntry[] = [];
    const seen = new Map<string, number>();
    walkStatements(project.scripts, (stmt, ctx) => {
      if (stmt.kind !== 'label' || ctx.language !== null) return;
      const dot = stmt.name.indexOf('.');
      const stats = index.byLabel.get(stmt.name);
      seen.set(stmt.name, (seen.get(stmt.name) ?? 0) + 1);
      labels.push({
        name: stmt.name,
        file: stmt.loc.file,
        line: stmt.loc.line,
        script: ctx.script.path,
        local: dot > 0,
        parent: dot > 0 ? stmt.name.slice(0, dot) : null,
        hidden: stmt.hidden,
        hasParameters: stmt.hasParameters,
        lines: stats?.lines ?? 0,
        words: stats?.words ?? 0,
      });
    });
    labels.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line));
    const duplicates = [...seen.entries()].filter(([, n]) => n > 1).map(([name]) => name);
    return { labels, duplicates };
  },
};
