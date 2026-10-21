import type { Location } from '../model/ast';
import type { Project } from '../model/project';
import { translatableStrings } from '../python-lite/names';
import type { Analysis } from './analysis';
import { walkStatements } from './walk';

export type TranslationLanguage = {
  language: string;
  /** Compiled scripts under tl/<language>/. */
  files: number;
  /** Default-language dialogue blocks that have a translation. */
  dialogue: { translated: number; total: number };
  strings: {
    translated: number;
    total: number;
    /** Translated strings outside the known default set (screens, Python…). */
    extra: number;
  };
  /** Translations whose identifier matches no dialogue block of the game. */
  orphans: { id: string; loc: Location }[];
  /** Untranslated dialogue blocks, by source file. */
  missingByFile: { file: string; missing: number; total: number }[];
};

export type TranslationsResult = {
  /** The default-language identifiers could be read (see docs/analyses.md). */
  available: boolean;
  /** Some scripts' identifiers were unreadable: counts are lower bounds. */
  partial: boolean;
  default: { dialogue: number; blocks: number; strings: number };
  languages: TranslationLanguage[];
};

function byName(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Coverage of each translation language, from tl/ blocks and slot-2 identifiers. */
export function translations(project: Project): TranslationsResult {
  const ids = project.translationIds?.ids ?? [];
  const sayIds = new Map(ids.filter((i) => i.hasSay).map((i) => [i.id, i]));
  const allIds = new Set(ids.map((i) => i.id));

  // Default strings: menu texts and constant _() arguments in code.
  const strings = new Set<string>();
  const translated = new Map<string, Map<string, Location>>();
  const translatedStrings = new Map<string, Set<string>>();
  const languages = new Set<string>();
  const ensure = (language: string) => {
    languages.add(language);
    if (!translated.has(language)) translated.set(language, new Map());
    if (!translatedStrings.has(language)) translatedStrings.set(language, new Set());
  };
  walkStatements(project.scripts, (stmt, ctx) => {
    if (stmt.kind === 'translate' && stmt.language !== null) {
      ensure(stmt.language);
      translated.get(stmt.language)?.set(stmt.identifier, stmt.loc);
      return;
    }
    if (stmt.kind === 'say' && stmt.language !== null && stmt.identifier !== null) {
      ensure(stmt.language);
      translated.get(stmt.language)?.set(stmt.identifier, stmt.loc);
      return;
    }
    if (stmt.kind === 'translate-string') {
      ensure(stmt.language);
      translatedStrings.get(stmt.language)?.add(stmt.old);
      return;
    }
    if (ctx.language !== null) return;
    if (stmt.kind === 'menu') for (const item of stmt.items) strings.add(item.text);
    else if (stmt.kind === 'python') for (const s of translatableStrings(stmt.code)) strings.add(s);
    else if (stmt.kind === 'define' || stmt.kind === 'default')
      for (const s of translatableStrings(stmt.value)) strings.add(s);
  });

  const totalsByFile = new Map<string, number>();
  for (const id of sayIds.values())
    totalsByFile.set(id.loc.file, (totalsByFile.get(id.loc.file) ?? 0) + 1);

  const result: TranslationLanguage[] = [...languages].sort(byName).map((language) => {
    const done = translated.get(language) ?? new Map<string, Location>();
    const olds = translatedStrings.get(language) ?? new Set<string>();
    const missing = new Map<string, number>();
    for (const id of sayIds.values()) {
      if (!done.has(id.id)) missing.set(id.loc.file, (missing.get(id.loc.file) ?? 0) + 1);
    }
    const prefix = `tl/${language}/`;
    return {
      language,
      files: project.scripts.filter((s) => s.gamePath.startsWith(prefix)).length,
      dialogue: {
        translated: [...done.keys()].filter((id) => sayIds.has(id)).length,
        total: sayIds.size,
      },
      strings: {
        translated: [...olds].filter((s) => strings.has(s)).length,
        total: strings.size,
        extra: [...olds].filter((s) => !strings.has(s)).length,
      },
      orphans:
        project.translationIds === null || project.translationIds === undefined
          ? []
          : [...done.entries()]
              .filter(([id]) => !allIds.has(id))
              .map(([id, loc]) => ({ id, loc }))
              .sort((a, b) => byName(a.loc.file, b.loc.file) || a.loc.line - b.loc.line),
      missingByFile: [...totalsByFile.entries()]
        .map(([file, total]) => ({ file, missing: missing.get(file) ?? 0, total }))
        .sort((a, b) => b.missing - a.missing || byName(a.file, b.file)),
    };
  });
  return {
    available: project.translationIds !== null && project.translationIds !== undefined,
    partial: (project.translationIds?.unavailable.length ?? 0) > 0,
    default: { dialogue: sayIds.size, blocks: allIds.size, strings: strings.size },
    languages: result,
  };
}

export const translationsAnalysis: Analysis<TranslationsResult> = {
  id: 'translations',
  run: translations,
};
