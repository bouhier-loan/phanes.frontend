/*
 * Text tags of Ren'Py dialogue. Hyperlink targets follow
 * renpy/common/00defaults.rpy (hyperlink_function, config.hyperlink_handlers):
 * `{a=protocol:value}`, the default protocol being call_in_new_context.
 * Ren'Py is MIT licensed (see NOTICE).
 */

/** Text tags `{name=value}` of a text, in order; `{{` is a literal brace. */
export function textTags(text: string): { name: string; value: string | null }[] {
  const out: { name: string; value: string | null }[] = [];
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('{', i);
    if (open < 0) break;
    if (text[open + 1] === '{') {
      i = open + 2;
      continue;
    }
    const close = text.indexOf('}', open + 1);
    if (close < 0) break;
    const body = text.slice(open + 1, close);
    const eq = body.indexOf('=');
    out.push(
      eq < 0 ? { name: body, value: null } : { name: body.slice(0, eq), value: body.slice(eq + 1) },
    );
    i = close + 1;
  }
  return out;
}

/** Protocols whose hyperlinks jump to or call a label. */
const LABEL_PROTOCOLS = new Set(['jump', 'call', 'call_in_new_context']);
const DEFAULT_PROTOCOL = 'call_in_new_context';

/** Labels that the `{a=…}` hyperlinks of a text jump to or call. */
export function hyperlinkLabels(text: string): string[] {
  const out: string[] = [];
  for (const tag of textTags(text)) {
    if (tag.name !== 'a' || !tag.value) continue;
    const target = tag.value.includes(':') ? tag.value : `${DEFAULT_PROTOCOL}:${tag.value}`;
    const colon = target.indexOf(':');
    const protocol = target.slice(0, colon);
    const value = target.slice(colon + 1).trim();
    if (LABEL_PROTOCOLS.has(protocol) && value !== '') out.push(value);
  }
  return out;
}
