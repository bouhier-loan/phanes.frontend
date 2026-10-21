import type { Location } from '../model/ast';
import type { Analysis } from './analysis';
import { dialogueIndex, type SpeakerOrigin } from './dialogue';

export type CharacterEntry = {
  /** Variable name, "narrator", a quoted literal name or "expr:<code>". */
  id: string;
  variable: string | null;
  /** Display name; dynamic names keep their interpolation, e.g. "[player_name]". */
  name: string | null;
  origin: SpeakerOrigin;
  kind: 'adv' | 'nvl' | null;
  dynamic: boolean;
  definedAt: Location | null;
  lines: number;
  words: number;
  cjkChars: number;
  firstLine: Location | null;
  firstText: string | null;
  /** `color=` of the definition, when constant. */
  color: string | null;
  /** `image=` of the definition: the tag of the character's images. */
  imageTag: string | null;
  /** Source of the definition. */
  definitionCode: string | null;
  /** Number of labels where the character has a line. */
  labels: number;
  linesByFile: { file: string; lines: number }[];
};

export type CharactersResult = {
  characters: CharacterEntry[];
  totals: { lines: number; words: number; cjkChars: number };
};

export const charactersAnalysis: Analysis<CharactersResult> = {
  id: 'characters',
  run(project) {
    const index = dialogueIndex(project);
    const characters: CharacterEntry[] = [...index.speakers.values()].map((s) => {
      const def = s.definition;
      return {
        id: s.id,
        variable: s.origin === 'literal' || s.origin === 'expression' ? null : s.id,
        name: def?.name ?? s.literalName,
        origin: s.origin,
        kind: def?.kind ?? null,
        dynamic: def?.dynamic ?? s.origin === 'expression',
        definedAt: def?.loc ?? null,
        lines: s.lines,
        words: s.words,
        cjkChars: s.cjkChars,
        firstLine: s.firstLine,
        firstText: s.firstText,
        color: def?.color ?? null,
        imageTag: def?.imageTag ?? null,
        definitionCode: def?.code ?? null,
        labels: s.labels.size,
        linesByFile: [...s.byFile.entries()]
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([file, lines]) => ({ file, lines })),
      };
    });
    characters.sort((a, b) => b.words - a.words || b.lines - a.lines || (a.id < b.id ? -1 : 1));
    const { lines, words, cjkChars } = index.totals;
    return { characters, totals: { lines, words, cjkChars } };
  },
};
