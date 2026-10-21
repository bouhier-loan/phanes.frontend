import type { Location, Stmt } from '../model/ast';
import type { Project } from '../model/project';
import { parseCall, type ParsedCall } from '../python-lite/call';
import { stringLiteralValue } from '../python-lite/literal';
import { countText } from '../text/words';
import { isDefaultLanguage, walkStatements } from './walk';

/** How a speaker was declared. */
export type SpeakerOrigin =
  'define' | 'default' | 'python' | 'builtin' | 'literal' | 'expression' | 'undefined';

export interface CharacterDefinition {
  readonly variable: string;
  readonly name: string | null;
  readonly dynamic: boolean;
  readonly kind: 'adv' | 'nvl';
  readonly origin: 'define' | 'default' | 'python';
  readonly loc: Location;
}

export interface SpeakerStats {
  /** Stable key: variable name, "narrator", a quoted literal or "expr:<code>". */
  readonly id: string;
  readonly origin: SpeakerOrigin;
  readonly definition: CharacterDefinition | null;
  /** Literal display name for `"Name" "text"` lines. */
  readonly literalName: string | null;
  lines: number;
  words: number;
  cjkChars: number;
  firstLine: Location | null;
}

export interface LabelStats {
  lines: number;
  words: number;
  cjkChars: number;
}

export interface DialogueIndex {
  readonly definitions: ReadonlyMap<string, CharacterDefinition>;
  readonly speakers: ReadonlyMap<string, SpeakerStats>;
  readonly byLabel: ReadonlyMap<string, LabelStats>;
  readonly totals: {
    lines: number;
    words: number;
    cjkChars: number;
    menus: number;
    choices: number;
  };
  readonly languages: readonly string[];
}

const CHARACTER_FACTORIES = new Set([
  'Character',
  'DynamicCharacter',
  'ADVCharacter',
  'NVLCharacter',
]);
/** Speakers defined by Ren'Py itself (renpy/common/00library.rpy and friends). */
const BUILTIN_SPEAKERS = new Set([
  'narrator',
  'centered',
  'vcentered',
  'nvl_narrator',
  'adv',
  'nvl',
  'name_only',
]);
const IDENTIFIER = /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/;
const PYTHON_ASSIGNMENT = /^[ \t]*([A-Za-z_][\w.]*)[ \t]*=[ \t]*(?=[A-Za-z_][\w.]*[ \t]*\()/gm;

function characterFromCall(
  call: ParsedCall,
  variable: string,
  origin: CharacterDefinition['origin'],
  loc: Location,
): CharacterDefinition | null {
  const factory = call.callee.split('.').pop() ?? '';
  if (!CHARACTER_FACTORIES.has(factory)) return null;
  const arg = call.positional[0] ?? call.keywords.get('name');
  const kindArg = call.keywords.get('kind')?.source;
  const kind = factory === 'NVLCharacter' || kindArg === 'nvl' ? 'nvl' : 'adv';
  if (factory === 'DynamicCharacter') {
    const name = arg?.string ?? arg?.source ?? null;
    return { variable, name: name === null ? null : `[${name}]`, dynamic: true, kind, origin, loc };
  }
  if (!arg || arg.source === 'None')
    return { variable, name: null, dynamic: false, kind, origin, loc };
  if (arg.string !== null) {
    return { variable, name: arg.string, dynamic: arg.string.includes('['), kind, origin, loc };
  }
  return { variable, name: arg.source, dynamic: true, kind, origin, loc };
}

function storeQualified(store: string, name: string): string {
  return store === 'store' ? name : `${store.replace(/^store\./, '')}.${name}`;
}

function collectDefinitions(project: Project): Map<string, CharacterDefinition> {
  const out = new Map<string, CharacterDefinition>();
  const add = (def: CharacterDefinition | null) => {
    if (def && !out.has(def.variable)) out.set(def.variable, def);
  };
  walkStatements(project.scripts, (stmt, ctx) => {
    if (ctx.language !== null) return;
    if (stmt.kind === 'define' && stmt.operator === '=' && stmt.index === null) {
      const call = parseCall(stmt.value);
      if (call)
        add(characterFromCall(call, storeQualified(stmt.store, stmt.name), 'define', stmt.loc));
    } else if (stmt.kind === 'default') {
      const call = parseCall(stmt.value);
      if (call)
        add(characterFromCall(call, storeQualified(stmt.store, stmt.name), 'default', stmt.loc));
    } else if (stmt.kind === 'python') {
      for (const m of stmt.code.matchAll(PYTHON_ASSIGNMENT)) {
        const variable = m[1];
        if (!variable) continue;
        const call = parseCall(stmt.code.slice(m.index + m[0].length));
        if (call) add(characterFromCall(call, variable, 'python', stmt.loc));
      }
    }
  });
  return out;
}

function memo<T>(fn: (project: Project) => T): (project: Project) => T {
  const cache = new WeakMap<Project, T>();
  return (project) => {
    let value = cache.get(project);
    if (value === undefined) {
      value = fn(project);
      cache.set(project, value);
    }
    return value;
  };
}

/**
 * Who says what, computed once per project. Rules (docs/stats.md):
 * a line is a Say statement in the default language, or a menu caption;
 * `extend` adds its words to the previous speaker without adding a line.
 */
export const dialogueIndex = memo((project: Project): DialogueIndex => {
  const definitions = collectDefinitions(project);
  const speakers = new Map<string, SpeakerStats>();
  const byLabel = new Map<string, LabelStats>();
  const totals = { lines: 0, words: 0, cjkChars: 0, menus: 0, choices: 0 };
  const languages = new Set<string>();

  const speaker = (who: string | null): SpeakerStats => {
    let id: string;
    let origin: SpeakerOrigin;
    let literalName: string | null = null;
    const literal = who === null ? null : stringLiteralValue(who);
    if (who === null || who === 'narrator') {
      id = 'narrator';
      origin = 'builtin';
    } else if (literal !== null) {
      id = JSON.stringify(literal);
      origin = 'literal';
      literalName = literal;
    } else if (IDENTIFIER.test(who)) {
      id = who;
      origin =
        definitions.get(who)?.origin ?? (BUILTIN_SPEAKERS.has(who) ? 'builtin' : 'undefined');
    } else {
      id = `expr:${who}`;
      origin = 'expression';
    }
    let stats = speakers.get(id);
    if (!stats) {
      stats = {
        id,
        origin,
        definition: definitions.get(id) ?? null,
        literalName,
        lines: 0,
        words: 0,
        cjkChars: 0,
        firstLine: null,
      };
      speakers.set(id, stats);
    }
    return stats;
  };
  const record = (
    stats: SpeakerStats,
    text: string,
    loc: Location,
    label: string | null,
    isLine: boolean,
  ) => {
    const count = countText(text);
    stats.words += count.words;
    stats.cjkChars += count.cjkChars;
    totals.words += count.words;
    totals.cjkChars += count.cjkChars;
    if (isLine) {
      stats.lines++;
      totals.lines++;
      stats.firstLine ??= loc;
    }
    if (label !== null) {
      let l = byLabel.get(label);
      if (!l) {
        l = { lines: 0, words: 0, cjkChars: 0 };
        byLabel.set(label, l);
      }
      l.words += count.words;
      l.cjkChars += count.cjkChars;
      if (isLine) l.lines++;
    }
  };

  let previous: SpeakerStats | null = null;
  walkStatements(project.scripts, (stmt: Stmt, ctx) => {
    if (ctx.language !== null) languages.add(ctx.language);
    if (stmt.kind === 'translate-string') languages.add(stmt.language);
    if (stmt.kind === 'say' && stmt.language !== null) languages.add(stmt.language);
    if (!isDefaultLanguage(stmt, ctx)) return;
    if (stmt.kind === 'say') {
      if (stmt.who === 'extend') {
        record(previous ?? speaker(null), stmt.what, stmt.loc, ctx.label, false);
        return;
      }
      previous = speaker(stmt.who);
      record(previous, stmt.what, stmt.loc, ctx.label, true);
    } else if (stmt.kind === 'menu') {
      totals.menus++;
      for (const item of stmt.items) {
        if (item.block === null) record(speaker(null), item.text, stmt.loc, ctx.label, true);
        else totals.choices++;
      }
    }
  });
  for (const def of definitions.values()) speaker(def.variable);
  return { definitions, speakers, byLabel, totals, languages: [...languages].sort() };
});
