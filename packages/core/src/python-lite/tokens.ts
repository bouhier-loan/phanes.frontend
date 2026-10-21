import { readStringLiteral } from './literal';

/** A lexical token of Python source; strings carry their decoded value. */
export type Token =
  | { readonly type: 'name'; readonly value: string; readonly line: number }
  | {
      readonly type: 'string';
      readonly value: string;
      readonly prefix: string;
      readonly line: number;
    }
  | { readonly type: 'number'; readonly line: number }
  | { readonly type: 'op'; readonly value: string; readonly depth: number; readonly line: number }
  /** End of a logical line (newline or `;` outside brackets). */
  | { readonly type: 'end'; readonly line: number };

const OPERATORS = [
  '**=',
  '//=',
  '>>=',
  '<<=',
  '==',
  '!=',
  '<=',
  '>=',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '&=',
  '|=',
  '^=',
  '@=',
  '->',
  ':=',
  '**',
  '//',
  '<<',
  '>>',
];
const OPEN = new Set(['(', '[', '{']);
const CLOSE = new Set([')', ']', '}']);
const NAME = /^[A-Za-z_\u00C0-\uFFFF][\w\u00C0-\uFFFF]*/;
const NUMBER =
  /^(?:0[xXoObB][\da-fA-F_]+|\d[\d_]*\.?[\d_]*(?:[eE][+-]?\d+)?[jJlL]?|\.\d[\d_]*(?:[eE][+-]?\d+)?)/;
const STRING_START = /^[rRuUbBfF]{0,2}['"]/;

/**
 * Splits Python source into tokens without evaluating anything. Unterminated
 * strings end the scan; unknown characters become one-character operators.
 * Bounded by the input length: `maxTokens` guards against pathological input.
 */
export function tokenize(code: string, maxTokens = 200_000): Token[] {
  const tokens: Token[] = [];
  let depth = 0;
  let line = 0;
  let i = 0;
  const end = () => {
    const last = tokens[tokens.length - 1];
    if (last !== undefined && last.type !== 'end') tokens.push({ type: 'end', line });
  };
  while (i < code.length && tokens.length < maxTokens) {
    const ch = code[i] ?? '';
    if (ch === '\n') {
      if (depth === 0) end();
      line++;
      i++;
      continue;
    }
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\f') {
      i++;
      continue;
    }
    if (ch === '\\' && code[i + 1] === '\n') {
      line++;
      i += 2;
      continue;
    }
    if (ch === '#') {
      const nl = code.indexOf('\n', i);
      i = nl < 0 ? code.length : nl;
      continue;
    }
    const rest = code.slice(i, i + 4);
    if (STRING_START.test(rest)) {
      const literal = readStringLiteral(code.slice(i));
      if (!literal) break;
      const text = code.slice(i, i + literal.length);
      tokens.push({ type: 'string', value: literal.value, prefix: literal.prefix, line });
      for (const c of text) if (c === '\n') line++;
      i += literal.length;
      continue;
    }
    const name = NAME.exec(code.slice(i, i + 256));
    if (name) {
      tokens.push({ type: 'name', value: name[0], line });
      i += name[0].length;
      continue;
    }
    const number = NUMBER.exec(code.slice(i, i + 64));
    if (number && number[0].length > 0) {
      tokens.push({ type: 'number', line });
      i += number[0].length;
      continue;
    }
    if (ch === ';' && depth === 0) {
      end();
      i++;
      continue;
    }
    const op = OPERATORS.find((o) => code.startsWith(o, i)) ?? ch;
    if (CLOSE.has(op)) depth = Math.max(0, depth - 1);
    tokens.push({ type: 'op', value: op, depth, line });
    if (OPEN.has(op)) depth++;
    i += op.length;
  }
  end();
  return tokens;
}
