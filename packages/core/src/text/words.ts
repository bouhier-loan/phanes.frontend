/*
 * Word counts for Ren'Py dialogue. Deterministic on every engine (no
 * Intl.Segmenter, whose ICU data differs between browsers):
 * - text tags ({b}, {w=0.5}, {a=...}...) are removed, "{{" is a literal brace;
 * - an interpolation ([player_name]) counts as one word, "[[" is a literal;
 * - words are runs of letters/digits (apostrophes and hyphens inside a word
 *   are allowed); Han, Hiragana and Katakana characters are counted
 *   separately, one by one, since those scripts do not separate words.
 */

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu;
const WORD = /[\p{L}\p{N}](?:[\p{L}\p{M}\p{N}_]|['’-](?=[\p{L}\p{N}]))*/gu;

/** Removes text tags and replaces interpolations by a placeholder word. */
export function stripTextTags(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const ch = text.charAt(i);
    if (ch === '{') {
      if (text[i + 1] === '{') {
        out += '{';
        i += 2;
        continue;
      }
      const close = text.indexOf('}', i);
      if (close < 0) {
        out += text.slice(i);
        break;
      }
      i = close + 1;
      continue;
    }
    if (ch === '[') {
      if (text[i + 1] === '[') {
        out += '[';
        i += 2;
        continue;
      }
      const close = text.indexOf(']', i);
      if (close < 0) {
        out += text.slice(i);
        break;
      }
      out += ' X ';
      i = close + 1;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

export interface TextCount {
  readonly words: number;
  readonly cjkChars: number;
}

export function countText(text: string): TextCount {
  const plain = stripTextTags(text);
  const cjkChars = plain.match(CJK)?.length ?? 0;
  const words = plain.replace(CJK, ' ').match(WORD)?.length ?? 0;
  return { words, cjkChars };
}

export const DEFAULT_WORDS_PER_MINUTE = 200;
export const DEFAULT_CJK_CHARS_PER_MINUTE = 500;

export function readingMinutes(
  count: TextCount,
  wordsPerMinute = DEFAULT_WORDS_PER_MINUTE,
  cjkPerMinute = DEFAULT_CJK_CHARS_PER_MINUTE,
): number {
  return count.words / wordsPerMinute + count.cjkChars / cjkPerMinute;
}
