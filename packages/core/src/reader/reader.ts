import { dialogueIndex } from '../analyses/dialogue';
import { menuKey } from '../analyses/flow';
import { walkStatements } from '../analyses/walk';
import type { ImageSpec, LabelStmt, Stmt } from '../model/ast';
import type { Project } from '../model/project';
import { stringLiteralValue } from '../python-lite/literal';
import { foldStringExpression } from '../python-lite/names';

export type ReaderSpeaker = {
  id: string;
  name: string | null;
  color: string | null;
  /** NVL or ADV mode of the definition; null without a definition. */
  kind: 'adv' | 'nvl' | null;
  /** `image=` of the definition: the tag that say attributes apply to. */
  image: string | null;
};

export type ReaderOption = {
  text: string;
  condition: string | null;
  targets: { kind: 'jump' | 'call'; target: string }[];
};

/** One reconstructed statement of a label, flattened with its nesting depth. */
export type ReaderLine = {
  /** Source line recorded by Ren'Py. */
  line: number;
  depth: number;
  /** Reconstructed Ren'Py source (comments and formatting are lost). */
  code: string;
} & (
  | {
      kind: 'say';
      speaker: ReaderSpeaker | null;
      text: string;
      extend: boolean;
      /** Image attributes of the line, e.g. `e happy "…"`. */
      attributes: string[];
      /** False for `nointeract` lines, shown with the following menu. */
      interact: boolean;
    }
  | { kind: 'scene' | 'show' | 'hide'; image: string; tag: string; at: string[]; dynamic: boolean }
  | { kind: 'audio'; action: string; channel: string; file: string | null }
  | {
      kind: 'menu';
      menu: string;
      prompt: { speaker: ReaderSpeaker | null; text: string } | null;
      options: ReaderOption[];
    }
  | { kind: 'choice'; text: string; condition: string | null }
  | {
      kind: 'jump' | 'call';
      target: string;
      expression: boolean;
      /** Label reached: local names made global, constant expressions folded; else null. */
      resolved: string | null;
    }
  | { kind: 'branch'; keyword: 'if' | 'elif' | 'else' | 'while'; condition: string | null }
  | { kind: 'label'; name: string }
  | { kind: 'return' | 'python' | 'with' | 'other' }
);

export type ReaderLabel = {
  name: string;
  file: string;
  line: number;
  /** Dialogue lines of the label (docs/stats.md). */
  lines: number;
  previous: string | null;
  next: string | null;
  content: ReaderLine[];
};

export type ScriptOutline = {
  file: string;
  labels: { name: string; line: number; lines: number }[];
}[];

export type Stage = {
  background: string | null;
  shown: { tag: string; image: string; at: string[] }[];
  music: string | null;
};

export type DialogueLine = {
  label: string | null;
  file: string;
  line: number;
  speaker: string | null;
  text: string;
};

/** Omit applied to each member of a union. */
type Body<T> = T extends unknown ? Omit<T, 'line' | 'depth'> : never;

function quote(text: string): string {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

function imageName(image: ImageSpec): string {
  return image.expression ?? image.name.join(' ');
}

function imageCode(kind: string, image: ImageSpec): string {
  const name = image.expression ? `expression ${image.expression}` : image.name.join(' ');
  const at = image.atList.length > 0 ? ` at ${image.atList.join(', ')}` : '';
  const layer = image.layer ? ` onlayer ${image.layer}` : '';
  return `${kind} ${name}${at}${layer}`;
}

const AUDIO = /^(play|queue|stop)\s+(\w+)(?:\s+([\s\S]*))?$/;

/** Labels of the default language, by source file and line. */
export function scriptOutline(project: Project): ScriptOutline {
  const index = dialogueIndex(project);
  const files = new Map<string, { name: string; line: number; lines: number }[]>();
  const seen = new Set<string>();
  walkStatements(project.scripts, (stmt, ctx) => {
    if (stmt.kind !== 'label' || ctx.language !== null || seen.has(stmt.name)) return;
    seen.add(stmt.name);
    const list = files.get(stmt.loc.file) ?? [];
    list.push({
      name: stmt.name,
      line: stmt.loc.line,
      lines: index.byLabel.get(stmt.name)?.lines ?? 0,
    });
    files.set(stmt.loc.file, list);
  });
  return [...files.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([file, labels]) => ({ file, labels: labels.sort((a, b) => a.line - b.line) }));
}

function speakerResolver(project: Project) {
  const { definitions } = dialogueIndex(project);
  return (who: string | null): ReaderSpeaker | null => {
    if (who === null || who === 'narrator') return null;
    const literal = stringLiteralValue(who);
    if (literal !== null)
      return { id: JSON.stringify(literal), name: literal, color: null, kind: null, image: null };
    const def = definitions.get(who);
    return {
      id: who,
      name: def ? def.name : who,
      color: def?.color ?? null,
      kind: def?.kind ?? null,
      image: def?.imageTag ?? null,
    };
  };
}

/** The statements of one label, reconstructed for reading; null if the label does not exist. */
export function readLabel(project: Project, name: string): ReaderLabel | null {
  const found: LabelStmt[] = [];
  walkStatements(project.scripts, (stmt, ctx) => {
    if (stmt.kind === 'label' && stmt.name === name && ctx.language === null) found.push(stmt);
  });
  const label = found[0];
  if (!label) return null;
  const speaker = speakerResolver(project);
  const content: ReaderLine[] = [];
  // Local targets (`jump .x`) belong to the enclosing global label.
  const global = label.name.split('.')[0] ?? label.name;
  let previousSpeaker: ReaderSpeaker | null = null;

  const push = (stmt: Stmt, depth: number, line: Body<ReaderLine>) => {
    content.push({ line: stmt.loc.line, depth, ...line });
  };
  const visit = (block: readonly Stmt[], depth: number) => {
    if (depth > 200) return;
    for (const [i, stmt] of block.entries()) {
      switch (stmt.kind) {
        case 'say': {
          const extend = stmt.who === 'extend';
          const who = extend ? previousSpeaker : speaker(stmt.who);
          if (!extend) previousSpeaker = who;
          const attrs = stmt.attributes.length > 0 ? ` ${stmt.attributes.join(' ')}` : '';
          const prefix = stmt.who ? `${stmt.who}${attrs} ` : '';
          push(stmt, depth, {
            kind: 'say',
            speaker: who,
            text: stmt.what,
            extend,
            attributes: [...stmt.attributes],
            interact: stmt.interact,
            code: `${prefix}${quote(stmt.what)}${stmt.interact ? '' : ' nointeract'}`,
          });
          break;
        }
        case 'scene':
          if (stmt.image)
            push(stmt, depth, {
              kind: 'scene',
              image: imageName(stmt.image),
              tag: stmt.image.name[0] ?? '',
              at: [...stmt.image.atList],
              dynamic: stmt.image.expression !== null,
              code: imageCode('scene', stmt.image),
            });
          else push(stmt, depth, { kind: 'other', code: 'scene' });
          break;
        case 'show':
        case 'hide':
          push(stmt, depth, {
            kind: stmt.kind,
            image: imageName(stmt.image),
            tag: stmt.image.tag ?? stmt.image.name[0] ?? '',
            at: [...stmt.image.atList],
            dynamic: stmt.image.expression !== null,
            code: imageCode(stmt.kind, stmt.image),
          });
          break;
        case 'with':
          push(stmt, depth, { kind: 'with', code: `with ${stmt.expression ?? 'None'}` });
          break;
        case 'user': {
          const line = stmt.line.trim();
          const audio = AUDIO.exec(line);
          const voice = /^voice\s+([\s\S]+)$/.exec(line);
          if (audio || voice) {
            const rest = (audio ? audio[3] : voice?.[1]) ?? '';
            const expr = rest.split(/\s+(?:fadein|fadeout|loop|noloop|if_changed|volume)\b/)[0];
            push(stmt, depth, {
              kind: 'audio',
              action: audio?.[1] ?? 'voice',
              channel: audio?.[2] ?? 'voice',
              file: expr ? stringLiteralValue(expr.trim()) : null,
              code: line,
            });
          } else push(stmt, depth, { kind: 'other', code: line });
          break;
        }
        case 'menu': {
          const caption = stmt.items.find((i) => i.block === null);
          const prev = block[i - 1];
          const prompt =
            prev?.kind === 'say' && !prev.interact
              ? { speaker: speaker(prev.who), text: prev.what }
              : caption
                ? { speaker: null, text: caption.text }
                : null;
          const options = stmt.items
            .filter((i) => i.block !== null)
            .map((i) => ({
              text: i.text,
              condition: i.condition.trim() === 'True' ? null : i.condition.trim(),
              targets: targetsOf(i.block ?? [], global),
            }));
          push(stmt, depth, {
            kind: 'menu',
            menu: menuKey(stmt.loc),
            prompt,
            options,
            code: stmt.setVariable ? `menu (set=${stmt.setVariable}):` : 'menu:',
          });
          for (const item of stmt.items) {
            if (item.block === null) continue;
            const condition = item.condition.trim() === 'True' ? null : item.condition.trim();
            push(stmt, depth + 1, {
              kind: 'choice',
              text: item.text,
              condition,
              code: `${quote(item.text)}${condition ? ` if ${condition}` : ''}:`,
            });
            visit(item.block, depth + 2);
          }
          break;
        }
        case 'jump':
        case 'call': {
          let resolved = stmt.expression ? foldStringExpression(stmt.target) : stmt.target;
          if (resolved?.startsWith('.')) resolved = `${global}${resolved}`;
          push(stmt, depth, {
            kind: stmt.kind,
            target: stmt.target,
            expression: stmt.expression,
            resolved,
            code: `${stmt.kind} ${stmt.expression ? 'expression ' : ''}${stmt.target}`,
          });
          break;
        }
        case 'return':
          push(stmt, depth, {
            kind: 'return',
            code: stmt.expression ? `return ${stmt.expression}` : 'return',
          });
          break;
        case 'if':
          stmt.branches.forEach((b, i) => {
            const isElse = i > 0 && b.condition.trim() === 'True';
            const keyword = i === 0 ? 'if' : isElse ? 'else' : 'elif';
            push(stmt, depth, {
              kind: 'branch',
              keyword,
              condition: isElse ? null : b.condition,
              code: isElse ? 'else:' : `${keyword} ${b.condition}:`,
            });
            visit(b.block, depth + 1);
          });
          break;
        case 'while':
          push(stmt, depth, {
            kind: 'branch',
            keyword: 'while',
            condition: stmt.condition,
            code: `while ${stmt.condition}:`,
          });
          visit(stmt.block, depth + 1);
          break;
        case 'python': {
          const code = stmt.code.trim();
          push(stmt, depth, {
            kind: 'python',
            code: code.includes('\n')
              ? `python:\n${code
                  .split('\n')
                  .map((l) => `    ${l}`)
                  .join('\n')}`
              : `$ ${code}`,
          });
          break;
        }
        case 'label':
          push(stmt, depth, { kind: 'label', name: stmt.name, code: `label ${stmt.name}:` });
          visit(stmt.block, depth + 1);
          break;
        case 'pass':
          push(stmt, depth, { kind: 'other', code: 'pass' });
          break;
        case 'define':
          push(stmt, depth, {
            kind: 'other',
            code: `define ${stmt.name} ${stmt.operator} ${stmt.value}`,
          });
          break;
        case 'default':
          push(stmt, depth, { kind: 'other', code: `default ${stmt.name} = ${stmt.value}` });
          break;
        case 'unknown':
          push(stmt, depth, { kind: 'other', code: `# ${stmt.className}` });
          visit(stmt.block, depth + 1);
          break;
        default:
          break;
      }
    }
  };
  visit(label.block, 0);

  const outline = scriptOutline(project).find((f) => f.file === label.loc.file)?.labels ?? [];
  const at = outline.findIndex((l) => l.name === label.name);
  return {
    name: label.name,
    file: label.loc.file,
    line: label.loc.line,
    lines: dialogueIndex(project).byLabel.get(label.name)?.lines ?? 0,
    previous: at > 0 ? (outline[at - 1]?.name ?? null) : null,
    next: at >= 0 ? (outline[at + 1]?.name ?? null) : null,
    content,
  };
}

function targetsOf(
  block: readonly Stmt[],
  global: string,
): { kind: 'jump' | 'call'; target: string }[] {
  const out: { kind: 'jump' | 'call'; target: string }[] = [];
  const visit = (stmts: readonly Stmt[], depth: number) => {
    if (depth > 200) return;
    for (const stmt of stmts) {
      if (stmt.kind === 'jump' || stmt.kind === 'call')
        out.push({
          kind: stmt.kind,
          target: stmt.target.startsWith('.') ? `${global}${stmt.target}` : stmt.target,
        });
      if (stmt.kind === 'if') for (const b of stmt.branches) visit(b.block, depth + 1);
    }
  };
  visit(block, 0);
  return out;
}

/** The stage once `line` has run: scene, show, hide, say attributes and music. */
export function applyStage(stage: Stage, line: ReaderLine): Stage {
  if (line.kind === 'scene') return { ...stage, background: line.image, shown: [] };
  if (line.kind === 'show') {
    const entry = { tag: line.tag, image: line.image, at: line.at };
    const at = stage.shown.findIndex((s) => s.tag === line.tag);
    // A shown tag keeps its place (and its position unless a new one is given).
    if (at < 0) return { ...stage, shown: [...stage.shown, entry] };
    const shown = [...stage.shown];
    const previous = shown[at];
    shown[at] = { ...entry, at: entry.at.length > 0 ? entry.at : (previous?.at ?? []) };
    return { ...stage, shown };
  }
  if (line.kind === 'hide')
    return { ...stage, shown: stage.shown.filter((s) => s.tag !== line.tag) };
  if (line.kind === 'say') {
    // `e happy "…"` changes the attributes of the speaker's image, when it is shown.
    const tag = line.speaker?.image;
    const attributes = line.attributes.filter((a) => !a.startsWith('-') && !a.startsWith('@'));
    const at = tag ? stage.shown.findIndex((s) => s.tag === tag) : -1;
    const previous = stage.shown[at];
    if (!tag || attributes.length === 0 || !previous) return stage;
    const shown = [...stage.shown];
    shown[at] = { ...previous, image: [tag, ...attributes].join(' ') };
    return { ...stage, shown };
  }
  if (line.kind === 'audio' && line.channel === 'music')
    return { ...stage, music: line.action === 'stop' ? null : (line.file ?? stage.music) };
  return stage;
}

export const EMPTY_STAGE: Stage = { background: null, shown: [], music: null };

/**
 * What is on screen after `content[index]`, replaying the scene, show, hide
 * and music statements before it in reading order (approximate: branches are
 * all replayed, ATL is ignored).
 */
export function stageAt(content: readonly ReaderLine[], index: number): Stage {
  return content.slice(0, index + 1).reduce(applyStage, EMPTY_STAGE);
}

/** Every line of dialogue of the default language, with its speaker's name. */
export function dialogueDump(project: Project): DialogueLine[] {
  const speaker = speakerResolver(project);
  const out: DialogueLine[] = [];
  let previous: string | null = null;
  walkStatements(project.scripts, (stmt, ctx) => {
    if (stmt.kind !== 'say' || ctx.language !== null || stmt.language !== null) return;
    const name = stmt.who === 'extend' ? previous : (speaker(stmt.who)?.name ?? null);
    if (stmt.who !== 'extend') previous = name;
    out.push({
      label: ctx.label,
      file: stmt.loc.file,
      line: stmt.loc.line,
      speaker: name,
      text: stmt.what,
    });
  });
  return out;
}

/** Dialogue lines containing `query` (case-insensitive), at most `limit`. */
export function searchText(
  lines: readonly DialogueLine[],
  query: string,
  limit = 200,
): DialogueLine[] {
  const needle = query.trim().toLocaleLowerCase();
  if (needle === '') return [];
  const out: DialogueLine[] = [];
  for (const line of lines) {
    if (line.text.toLocaleLowerCase().includes(needle)) out.push(line);
    if (out.length >= limit) break;
  }
  return out;
}
