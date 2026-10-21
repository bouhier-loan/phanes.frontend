import { readStringLiteral, stringLiteralValue } from './literal';

/** One argument of a call: its source text and, when constant, its string value. */
export interface CallArgument {
  readonly source: string;
  /** Value of a string literal, or of _("...") / __("...") translation wrappers. */
  readonly string: string | null;
}

export interface ParsedCall {
  /** Dotted name of the callee, e.g. "Character" or "renpy.character.Character". */
  readonly callee: string;
  readonly positional: readonly CallArgument[];
  readonly keywords: ReadonlyMap<string, CallArgument>;
  /** Offset just after the closing parenthesis. */
  readonly end: number;
}

const OPEN = new Set(['(', '[', '{']);
const CLOSE = new Set([')', ']', '}']);
const TRANSLATION_WRAPPER = /^_{1,2}p?\s*\(([\s\S]*)\)$/;

function argumentOf(source: string): CallArgument {
  const text = source.trim();
  const wrapped = TRANSLATION_WRAPPER.exec(text);
  return { source: text, string: stringLiteralValue(wrapped?.[1] ?? text) };
}

/**
 * Parses `name(args)` at the start of `source` (after optional whitespace).
 * Only splits arguments; expressions are kept as text. Returns null if the
 * source is not a call.
 */
export function parseCall(source: string): ParsedCall | null {
  const head = /^\s*([A-Za-z_][\w]*(?:\s*\.\s*[A-Za-z_]\w*)*)\s*\(/.exec(source);
  if (!head?.[1]) return null;
  const callee = head[1].replace(/\s+/g, '');
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  let i = head[0].length;
  while (i < source.length) {
    const rest = source.slice(i);
    if (/^[rRuUbBfF]{0,2}['"]/.test(rest)) {
      const literal = readStringLiteral(rest);
      if (!literal) return null;
      current += rest.slice(0, literal.length);
      i += literal.length;
      continue;
    }
    const ch = source[i] ?? '';
    if (ch === '#') {
      const nl = source.indexOf('\n', i);
      i = nl < 0 ? source.length : nl;
      continue;
    }
    if (OPEN.has(ch)) depth++;
    if (CLOSE.has(ch)) {
      if (depth === 0) {
        if (ch !== ')') return null;
        if (current.trim() !== '') parts.push(current);
        const positional: CallArgument[] = [];
        const keywords = new Map<string, CallArgument>();
        for (const part of parts) {
          const kw = /^\s*([A-Za-z_]\w*)\s*=(?!=)([\s\S]*)$/.exec(part);
          if (kw?.[1] !== undefined && kw[2] !== undefined) keywords.set(kw[1], argumentOf(kw[2]));
          else positional.push(argumentOf(part));
        }
        return { callee, positional, keywords, end: i + 1 };
      }
      depth--;
    }
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
    i++;
  }
  return null;
}
