import { parseCall } from '../python-lite/call';
import { stringLiteralValue } from '../python-lite/literal';
import { readingMinutes } from '../text/words';
import { detectRenpyVersion, type RenpyVersionInfo } from '../version/detect';
import { effectiveGameEntries } from '../vfs/vfs';
import type { Analysis } from './analysis';
import { dialogueIndex } from './dialogue';
import { walkStatements } from './walk';

export type OverviewResult = {
  /** `define config.name`, when it is a constant. */
  title: string | null;
  /** `define config.version`, when it is a constant. */
  gameVersion: string | null;
  renpy: RenpyVersionInfo;
  scripts: { compiled: number; decoded: number; failed: number; sourceOnly: number };
  labels: number;
  dialogue: { lines: number; words: number; cjkChars: number; menus: number; choices: number };
  readingTimeMinutes: number;
  /** Translation languages found (tl/<language> scripts). */
  languages: string[];
};

/** Constant string value of a define, unwrapping _("...") translation markers. */
function constantString(value: string): string | null {
  const direct = stringLiteralValue(value);
  if (direct !== null) return direct;
  const call = parseCall(value);
  if (call && /^_{1,2}p?$/.test(call.callee) && call.positional.length === 1) {
    return call.positional[0]?.string ?? null;
  }
  return null;
}

export const overviewAnalysis: Analysis<OverviewResult> = {
  id: 'overview',
  run(project) {
    const index = dialogueIndex(project);
    let title: string | null = null;
    let gameVersion: string | null = null;
    let labels = 0;
    walkStatements(project.scripts, (stmt, ctx) => {
      if (ctx.language !== null) return;
      if (stmt.kind === 'label') labels++;
      if (stmt.kind === 'define' && stmt.store === 'store.config') {
        if (stmt.name === 'name') title ??= constantString(stmt.value);
        if (stmt.name === 'version') gameVersion ??= constantString(stmt.value);
      }
    });
    const entries = effectiveGameEntries(project.vfs).filter((e) => e.zone === 'game');
    const compiled = entries.filter((e) => e.kind === 'compiled-script');
    const compiledStems = new Set(compiled.map((e) => (e.gamePath ?? '').replace(/c$/i, '')));
    const sourceOnly = entries.filter(
      (e) => e.kind === 'script' && !compiledStems.has(e.gamePath ?? ''),
    ).length;
    const decoded = project.scripts.length;
    return {
      title,
      gameVersion,
      renpy: detectRenpyVersion(project),
      scripts: {
        compiled: compiled.length,
        decoded,
        failed: compiled.length - decoded,
        sourceOnly,
      },
      labels,
      dialogue: { ...index.totals },
      readingTimeMinutes: Math.round(readingMinutes(index.totals) * 10) / 10,
      languages: [...index.languages],
    };
  },
};
