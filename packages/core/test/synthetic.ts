import { BytesSource } from '@phanes/renpy-formats';
import {
  type ImageSpec,
  kindOf,
  type MenuItem,
  type Project,
  type ScriptFile,
  type Stmt,
  type TranslationId,
} from '../src';

/** Small builders for hand-written domain models (the ACL's output). */
const FILE = 'game/script.rpy';
const loc = (line: number, file = FILE) => ({ file, line });

export const s = {
  label: (line: number, name: string, block: Stmt[]): Stmt => ({
    kind: 'label',
    loc: loc(line),
    name,
    block,
    hasParameters: false,
    hidden: false,
  }),
  say: (line: number, who: string | null, what: string, interact = true): Stmt => ({
    kind: 'say',
    loc: loc(line),
    who,
    what,
    attributes: [],
    interact,
    identifier: null,
    language: null,
  }),
  jump: (line: number, target: string, expression = false): Stmt => ({
    kind: 'jump',
    loc: loc(line),
    target,
    expression,
  }),
  call: (line: number, target: string): Stmt => ({
    kind: 'call',
    loc: loc(line),
    target,
    expression: false,
    hasArguments: false,
  }),
  ret: (line: number): Stmt => ({ kind: 'return', loc: loc(line), expression: null }),
  if: (line: number, branches: [string, Stmt[]][]): Stmt => ({
    kind: 'if',
    loc: loc(line),
    branches: branches.map(([condition, block]) => ({ condition, block })),
  }),
  while: (line: number, condition: string, block: Stmt[]): Stmt => ({
    kind: 'while',
    loc: loc(line),
    condition,
    block,
  }),
  menu: (
    line: number,
    items: [string, string, Stmt[] | null][],
    set: string | null = null,
  ): Stmt => ({
    kind: 'menu',
    loc: loc(line),
    items: items.map(([text, condition, block]): MenuItem => ({ text, condition, block })),
    setVariable: set,
  }),
  python: (line: number, code: string): Stmt => ({
    kind: 'python',
    loc: loc(line),
    code,
    early: false,
    store: 'store',
  }),
  define: (line: number, name: string, value: string, operator = '=', store = 'store'): Stmt => ({
    kind: 'define',
    loc: loc(line),
    store,
    name,
    operator,
    index: null,
    value,
  }),
  default: (line: number, name: string, value: string, store = 'store'): Stmt => ({
    kind: 'default',
    loc: loc(line),
    store,
    name,
    value,
  }),
  image: (line: number, name: string, value: string | null): Stmt => ({
    kind: 'image',
    loc: loc(line),
    name: name.split(' '),
    value,
    hasAtl: false,
  }),
  show: (line: number, name: string, expression: string | null = null): Stmt => ({
    kind: 'show',
    loc: loc(line),
    image: spec(name, expression),
  }),
  scene: (line: number, name: string): Stmt => ({
    kind: 'scene',
    loc: loc(line),
    image: spec(name, null),
    layer: null,
  }),
  user: (line: number, text: string): Stmt => ({
    kind: 'user',
    loc: loc(line),
    name: text.split(/\s+/).slice(0, 2).join(' '),
    line: text,
  }),
  translate: (line: number, language: string, identifier: string, block: Stmt[]): Stmt => ({
    kind: 'translate',
    loc: loc(line, `game/tl/${language}/script.rpy`),
    identifier,
    language,
    block,
  }),
  screen: (line: number, name: string, strings: string[]): Stmt => ({
    kind: 'screen',
    loc: loc(line),
    name,
    strings,
  }),
};

function spec(name: string, expression: string | null): ImageSpec {
  return { name: name.split(' '), expression, tag: null, atList: [], layer: null };
}

export function script(statements: Stmt[], gamePath = 'script.rpyc'): ScriptFile {
  return {
    path: `G/game/${gamePath}`,
    gamePath,
    archive: null,
    slot: 1,
    pickleProtocol: 2,
    python2: false,
    scriptVersion: null,
    traits: { cslots: false, astsupport: false },
    statements,
  };
}

/** A project made of scripts and (empty) game files. */
export function project(
  scripts: ScriptFile[],
  files: string[] = [],
  translationIds: TranslationId[] | null = null,
): Project {
  return {
    vfs: {
      rootName: 'G',
      gameDir: 'G/game',
      archives: [],
      entries: files.map((gamePath) => ({
        path: `G/game/${gamePath}`,
        gamePath,
        size: 10,
        kind: kindOf(gamePath),
        zone: 'game',
        origin: { type: 'file' },
        shadowedBy: null,
        source: new BytesSource(`G/game/${gamePath}`, new Uint8Array(10)),
      })),
    },
    scripts,
    texts: new Map(),
    diagnostics: [],
    translationIds: translationIds && { ids: translationIds, unavailable: [] },
  };
}
