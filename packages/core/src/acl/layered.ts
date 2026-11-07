/*
 * Layered images, from the parse result that the `layeredimage` statement
 * stores in its UserStatement (renpy/common/00layeredimage.rpy up to 8.3,
 * 00layeredimage_ren.py since: RawLayeredImage, RawAlways, RawAttributeGroup,
 * RawAttribute, RawConditionGroup, RawCondition). Properties are `properties`
 * (sources) up to 8.3, `final_properties` (constants) and `expr_properties`
 * (sources) since 8.4. Ren'Py is MIT licensed (see NOTICE).
 */
import { PyObject, type PyValue } from '@phanes/renpy-formats';
import type { LayeredLayer } from '../model/ast';
import { stringLiteralValue } from '../python-lite/literal';
import { NodeReader, textOf } from './read';

/** A property's value as Python source ("True", "'casual'"...). */
function properties(r: NodeReader): Map<string, string> {
  const out = new Map<string, string>();
  for (const name of ['properties', 'expr_properties']) {
    for (const [key, value] of r.dict(name)?.items() ?? []) {
      const k = textOf(key);
      const v = textOf(value);
      if (k !== null && v !== null) out.set(k, v);
    }
  }
  for (const [key, value] of r.dict('final_properties')?.items() ?? []) {
    const k = textOf(key);
    if (k === null) continue;
    if (typeof value === 'boolean') out.set(k, value ? 'True' : 'False');
    else if (typeof value === 'string') out.set(k, JSON.stringify(value));
    else if (typeof value === 'number' || typeof value === 'bigint') out.set(k, String(value));
  }
  return out;
}

function flag(props: Map<string, string>, name: string): boolean {
  const source = props.get(name)?.trim();
  return source !== undefined && source !== 'False' && source !== 'None' && source !== '0';
}

function variantOf(props: Map<string, string>): string | null {
  const source = props.get('variant');
  return source === undefined ? null : stringLiteralValue(source.trim());
}

function shortClass(value: PyObject): string {
  return value.className.slice(value.className.lastIndexOf('.') + 1);
}

/** Name and layers of a RawLayeredImage; null when `parsed` is not one. */
export function layeredImage(
  parsed: PyValue | undefined,
): { name: string; layers: LayeredLayer[] } | null {
  if (!(parsed instanceof PyObject) || shortClass(parsed) !== 'RawLayeredImage') return null;
  const root = new NodeReader(parsed);
  const layers: LayeredLayer[] = [];
  const image = (r: NodeReader) => textOf(r.raw('image'));
  const attribute = (r: NodeReader, group: string | null, groupProps: Map<string, string>) => {
    const props = new Map([...groupProps, ...properties(r)]);
    layers.push({
      kind: 'attribute',
      name: r.text('name') ?? '',
      group,
      variant: variantOf(props),
      default: flag(props, 'default'),
      image: image(r),
    });
  };
  for (const child of root.items('children')) {
    if (!(child instanceof PyObject)) continue;
    const r = new NodeReader(child);
    switch (shortClass(child)) {
      case 'RawAlways':
        layers.push({ kind: 'always', image: image(r) });
        break;
      case 'RawAttribute':
        attribute(r, null, new Map());
        break;
      case 'RawAttributeGroup': {
        const props = properties(r);
        const name = r.text('group_name', 'group');
        // Attributes of a `multiple` group are named without the group.
        const group = flag(props, 'multiple') ? null : name;
        const inherited = new Map([...props].filter(([k]) => k !== 'default' && k !== 'auto'));
        for (const a of r.items('children'))
          if (a instanceof PyObject && shortClass(a) === 'RawAttribute')
            attribute(new NodeReader(a), group, inherited);
        if (flag(props, 'auto'))
          layers.push({ kind: 'auto', group: name, variant: variantOf(props) });
        break;
      }
      case 'RawConditionGroup':
        for (const c of r.items('conditions')) {
          if (!(c instanceof PyObject)) continue;
          const cr = new NodeReader(c);
          layers.push({ kind: 'condition', condition: cr.text('condition'), image: image(cr) });
        }
        break;
      case 'RawCondition':
        layers.push({ kind: 'condition', condition: r.text('condition'), image: image(r) });
        break;
      default:
        break;
    }
  }
  return { name: root.text('name') ?? '', layers };
}
