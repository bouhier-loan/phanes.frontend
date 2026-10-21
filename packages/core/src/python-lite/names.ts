import { type Token, tokenize } from './tokens';

/** A dotted name found in Python source, with its line (0-based) in that source. */
export interface NameRef {
  readonly name: string;
  readonly line: number;
}

const KEYWORDS = new Set([
  'False',
  'None',
  'True',
  'and',
  'as',
  'assert',
  'async',
  'await',
  'break',
  'class',
  'continue',
  'def',
  'del',
  'elif',
  'else',
  'except',
  'finally',
  'for',
  'from',
  'global',
  'if',
  'import',
  'in',
  'is',
  'lambda',
  'nonlocal',
  'not',
  'or',
  'pass',
  'raise',
  'return',
  'try',
  'while',
  'with',
  'yield',
]);
const ASSIGN = new Set([
  '=',
  '+=',
  '-=',
  '*=',
  '/=',
  '//=',
  '%=',
  '**=',
  '>>=',
  '<<=',
  '&=',
  '|=',
  '^=',
  '@=',
]);

function isOp(token: Token | undefined, value: string): boolean {
  return token?.type === 'op' && token.value === value;
}

/** Reads a dotted chain `a.b.c` starting at tokens[i]; returns it and the index after it. */
function chainAt(tokens: readonly Token[], i: number): { name: string; next: number } | null {
  const first = tokens[i];
  if (first?.type !== 'name' || KEYWORDS.has(first.value)) return null;
  let name = first.value;
  let j = i + 1;
  for (;;) {
    const dot = tokens[j];
    const part = tokens[j + 1];
    if (!isOp(dot, '.') || part?.type !== 'name') break;
    name += `.${part.value}`;
    j += 2;
  }
  return { name, next: j };
}

/**
 * Names read and assigned by a piece of Python, found lexically: assignment
 * targets (`x = …`, `x += …`, `a, b = …`, `x[i] = …`, `for x in …`) are
 * writes, every other dotted name outside keyword arguments is a read.
 * Nothing is evaluated; dynamic accesses (`setattr`, `globals()`) are missed.
 */
export function pythonNames(code: string): { reads: NameRef[]; writes: NameRef[] } {
  const tokens = tokenize(code);
  const reads: NameRef[] = [];
  const writes: NameRef[] = [];
  let start = 0;
  while (start < tokens.length) {
    let stop = start;
    while (stop < tokens.length && tokens[stop]?.type !== 'end') stop++;
    statement(tokens, start, stop, reads, writes);
    start = stop + 1;
  }
  return { reads, writes };
}

function statement(
  tokens: readonly Token[],
  start: number,
  stop: number,
  reads: NameRef[],
  writes: NameRef[],
): void {
  // Targets end at the last top-level assignment operator.
  let targetsEnd = -1;
  for (let i = start; i < stop; i++) {
    const t = tokens[i];
    if (t?.type === 'op' && t.depth === 0 && ASSIGN.has(t.value)) targetsEnd = i;
  }
  const targetStarts = new Set<number>();
  if (targetsEnd >= 0) {
    let atTarget = true;
    for (let i = start; i < targetsEnd; i++) {
      const t = tokens[i];
      if (atTarget && t?.type === 'name') targetStarts.add(i);
      atTarget = t?.type === 'op' && t.depth === 0 && (t.value === ',' || t.value === '=');
      if (t?.type === 'op' && t.depth === 0 && t.value === '(') atTarget = true;
    }
  }
  const first = tokens[start];
  if (first?.type === 'name' && first.value === 'for') {
    for (let i = start + 1; i < stop; i++) {
      const t = tokens[i];
      if (t?.type !== 'name') continue;
      if (t.value === 'in') break;
      targetStarts.add(i);
    }
  }
  let i = start;
  while (i < stop) {
    const previous = tokens[i - 1];
    const chain = isOp(previous, '.') && i > start ? null : chainAt(tokens, i);
    if (!chain) {
      i++;
      continue;
    }
    const after = tokens[chain.next];
    const line = tokens[i]?.line ?? 0;
    const keywordArgument = after?.type === 'op' && after.value === '=' && after.depth > 0;
    if (targetStarts.has(i)) writes.push({ name: chain.name, line });
    else if (!keywordArgument) reads.push({ name: chain.name, line });
    i = chain.next;
  }
}

/** Dotted names interpolated in Ren'Py text: `[name]`, `[obj.attr!t]`; `[[` is literal. */
export function interpolatedNames(text: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('[', i);
    if (open < 0) break;
    if (text[open + 1] === '[') {
      i = open + 2;
      continue;
    }
    const close = text.indexOf(']', open + 1);
    if (close < 0) break;
    const m = /^\s*([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)/.exec(text.slice(open + 1, close));
    if (m?.[1]) out.push(m[1]);
    i = close + 1;
  }
  return out;
}

/**
 * Value of a constant string expression: literals joined by `+` or
 * implicit concatenation, e.g. `"bad" + "_ending"`; null for anything else.
 */
export function foldStringExpression(expression: string): string | null {
  const tokens = tokenize(expression).filter((t) => t.type !== 'end');
  let value = '';
  let expectString = true;
  let found = false;
  for (const t of tokens) {
    if (t.type === 'string') {
      if (t.prefix.includes('f') || t.prefix.includes('b')) return null;
      value += t.value;
      found = true;
      expectString = false;
    } else if (t.type === 'op' && t.value === '+' && !expectString) {
      expectString = true;
    } else {
      return null;
    }
  }
  return found && !expectString ? value : null;
}

/** Constant string literals of a piece of Python, in order. */
export function stringConstants(code: string): string[] {
  const out: string[] = [];
  for (const t of tokenize(code)) {
    if (t.type === 'string' && !t.prefix.includes('f') && !t.prefix.includes('b'))
      out.push(t.value);
  }
  return out;
}

/** Constant arguments of `_()`, `__()` and `_p()` translation markers. */
export function translatableStrings(code: string): string[] {
  const tokens = tokenize(code);
  const out: string[] = [];
  for (let i = 0; i + 3 < tokens.length; i++) {
    const name = tokens[i];
    const literal = tokens[i + 2];
    if (
      name?.type === 'name' &&
      /^_{1,2}p?$/.test(name.value) &&
      !isOp(tokens[i - 1], '.') &&
      isOp(tokens[i + 1], '(') &&
      literal?.type === 'string' &&
      isOp(tokens[i + 3], ')')
    ) {
      out.push(literal.value);
    }
  }
  return out;
}
