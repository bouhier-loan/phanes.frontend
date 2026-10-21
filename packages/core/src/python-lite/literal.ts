const SIMPLE: Readonly<Record<string, string>> = {
  '\n': '',
  '\\': '\\',
  "'": "'",
  '"': '"',
  a: '\x07',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
  v: '\v',
};

const STRING_START = /^([rRuUbBfF]{0,2})('''|"""|'|")/;

/**
 * Decodes one Python string literal (with optional r/u/b/f prefix) starting
 * at `text[0]`. Returns the value and the number of characters consumed, or
 * null if `text` does not start with a complete literal.
 */
export function readStringLiteral(
  text: string,
): { value: string; length: number; prefix: string } | null {
  const m = STRING_START.exec(text);
  if (!m) return null;
  const prefix = (m[1] ?? '').toLowerCase();
  const quote = m[2] ?? '"';
  const raw = prefix.includes('r');
  let i = m[0].length;
  let value = '';
  while (i < text.length) {
    if (text.startsWith(quote, i)) return { value, length: i + quote.length, prefix };
    const ch = text[i] ?? '';
    if (ch === '\n' && quote.length === 1) return null;
    if (ch !== '\\') {
      value += ch;
      i++;
      continue;
    }
    const next = text[i + 1];
    if (next === undefined) return null;
    if (raw) {
      value += ch + next;
      i += 2;
      continue;
    }
    const simple = SIMPLE[next];
    if (simple !== undefined) {
      value += simple;
      i += 2;
    } else if (next === 'x' || next === 'u' || next === 'U') {
      const size = next === 'x' ? 2 : next === 'u' ? 4 : 8;
      const hex = text.slice(i + 2, i + 2 + size);
      if (!new RegExp(`^[0-9a-fA-F]{${size}}$`).test(hex)) return null;
      value += String.fromCodePoint(Number.parseInt(hex, 16));
      i += 2 + size;
    } else if (next >= '0' && next <= '7') {
      const oct = /^[0-7]{1,3}/.exec(text.slice(i + 1))?.[0] ?? '0';
      value += String.fromCharCode(Number.parseInt(oct, 8));
      i += 1 + oct.length;
    } else {
      value += ch + next;
      i += 2;
    }
  }
  return null;
}

/**
 * Value of an expression made only of string literals, possibly
 * concatenated implicitly ("a" "b"); null for anything else.
 */
export function stringLiteralValue(expression: string): string | null {
  let rest = expression.trim();
  let value = '';
  let found = false;
  while (rest.length > 0) {
    const literal = readStringLiteral(rest);
    if (!literal || literal.prefix.includes('f') || literal.prefix.includes('b')) return null;
    value += literal.value;
    found = true;
    rest = rest.slice(literal.length).trimStart();
  }
  return found ? value : null;
}
