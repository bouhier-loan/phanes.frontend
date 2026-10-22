/*
 * Ren'Py dialogue text, shown as styled runs. Text tags follow Ren'Py's
 * documentation (renpy/text/textsupport.pyx); Ren'Py is MIT licensed (see NOTICE).
 * Nothing is interpolated: `[name]` stays as a placeholder.
 */

export type TextRun = {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  /** A `{color=#…}` tag with a hex colour. */
  color: string | null;
  /** An interpolation like `[player_name]`, filled in by the game. */
  variable: boolean;
};

type Style = Omit<TextRun, 'text' | 'variable'>;

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Splits a line of dialogue into runs; tags that only change timing or layout are dropped. */
export function parseRenpyText(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const counts = { b: 0, i: 0, u: 0, s: 0 };
  const colors: string[] = [];
  const style = (): Style => ({
    bold: counts.b > 0,
    italic: counts.i > 0,
    underline: counts.u > 0,
    strike: counts.s > 0,
    color: colors[colors.length - 1] ?? null,
  });
  const push = (chunk: string, variable = false) => {
    if (chunk === '') return;
    const last = runs[runs.length - 1];
    const next = { text: chunk, variable, ...style() };
    if (
      last &&
      !variable &&
      !last.variable &&
      last.bold === next.bold &&
      last.italic === next.italic &&
      last.underline === next.underline &&
      last.strike === next.strike &&
      last.color === next.color
    )
      last.text += chunk;
    else runs.push(next);
  };

  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '{' && text[i + 1] === '{') {
      push('{');
      i += 2;
    } else if (c === '[' && text[i + 1] === '[') {
      push('[');
      i += 2;
    } else if (c === '{') {
      const close = text.indexOf('}', i);
      if (close < 0) {
        push(text.slice(i));
        break;
      }
      const tag = text.slice(i + 1, close);
      i = close + 1;
      const closing = tag.startsWith('/');
      const [name = '', value = ''] = (closing ? tag.slice(1) : tag).split('=', 2);
      if (name === 'b' || name === 'i' || name === 'u' || name === 's')
        counts[name] = Math.max(0, counts[name] + (closing ? -1 : 1));
      else if (name === 'color') {
        if (closing) colors.pop();
        else colors.push(HEX.test(value) ? value : (colors[colors.length - 1] ?? ''));
      } else if (name === 'p' && !closing) push('\n');
      else if (name === 'space' && !closing) push(' ');
      // Any other tag (w, nw, fast, cps, size, font, a, image…) is dropped.
    } else if (c === '[') {
      const close = text.indexOf(']', i);
      if (close < 0) {
        push(text.slice(i));
        break;
      }
      push(text.slice(i, close + 1), true);
      i = close + 1;
    } else {
      let j = i;
      while (j < text.length && text[j] !== '{' && text[j] !== '[') j++;
      push(text.slice(i, j));
      i = j;
    }
  }
  return runs.map((r) => (r.color === '' ? { ...r, color: null } : r));
}

/** The text without tags, e.g. for an accessible name. */
export function plainText(text: string): string {
  return parseRenpyText(text)
    .map((r) => r.text)
    .join('');
}
