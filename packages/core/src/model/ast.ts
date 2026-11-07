/**
 * Phanes' own model of a Ren'Py script, independent of the Ren'Py version
 * that compiled it. The anti-corruption layer (acl/) builds it from the
 * unpickled AST; anything it does not understand becomes an Unknown node.
 */

// A type alias, so analyses can put locations in their JSON results.
export type Location = {
  /** Source file as recorded by Ren'Py (e.g. "game/script.rpy"). */
  readonly file: string;
  readonly line: number;
};

interface Node<K extends string> {
  readonly kind: K;
  readonly loc: Location;
}

export interface LabelStmt extends Node<'label'> {
  /** Full name; local labels are stored as "parent.local". */
  readonly name: string;
  readonly block: readonly Stmt[];
  readonly hasParameters: boolean;
  readonly hidden: boolean;
}

export interface SayStmt extends Node<'say'> {
  /** Speaker expression: a variable name, a string literal, any expression; null for the narrator. */
  readonly who: string | null;
  readonly what: string;
  readonly attributes: readonly string[];
  readonly interact: boolean;
  /** Explicit `id` clause or translation identifier, when present. */
  readonly identifier: string | null;
  /** Language of a TranslateSay node (null: default language). */
  readonly language: string | null;
}

export interface MenuItem {
  readonly text: string;
  /** Python condition; "True" when the choice is unconditional. */
  readonly condition: string;
  /** null for a caption line. */
  readonly block: readonly Stmt[] | null;
}

export interface MenuStmt extends Node<'menu'> {
  readonly items: readonly MenuItem[];
  readonly setVariable: string | null;
}

export interface JumpStmt extends Node<'jump'> {
  readonly target: string;
  /** True for `jump expression ...`: target is a Python expression. */
  readonly expression: boolean;
}

export interface CallStmt extends Node<'call'> {
  readonly target: string;
  readonly expression: boolean;
  readonly hasArguments: boolean;
}

export interface ReturnStmt extends Node<'return'> {
  readonly expression: string | null;
}

export interface IfStmt extends Node<'if'> {
  readonly branches: readonly { readonly condition: string; readonly block: readonly Stmt[] }[];
}

export interface WhileStmt extends Node<'while'> {
  readonly condition: string;
  readonly block: readonly Stmt[];
}

export interface InitStmt extends Node<'init'> {
  readonly priority: number;
  readonly block: readonly Stmt[];
}

export interface DefineStmt extends Node<'define'> {
  readonly store: string;
  readonly name: string;
  /** "=", "+=", "|="... (Ren'Py 8). */
  readonly operator: string;
  readonly index: string | null;
  readonly value: string;
}

export interface DefaultStmt extends Node<'default'> {
  readonly store: string;
  readonly name: string;
  readonly value: string;
}

export interface PythonStmt extends Node<'python'> {
  readonly code: string;
  readonly early: boolean;
  readonly store: string;
}

/** An image name with its display options (Ren'Py's "imspec"). */
export interface ImageSpec {
  readonly name: readonly string[];
  readonly expression: string | null;
  readonly tag: string | null;
  readonly atList: readonly string[];
  readonly layer: string | null;
}

export interface SceneStmt extends Node<'scene'> {
  /** null for a bare `scene` that only clears the layer. */
  readonly image: ImageSpec | null;
  readonly layer: string | null;
}

export interface ShowStmt extends Node<'show'> {
  readonly image: ImageSpec;
}

export interface HideStmt extends Node<'hide'> {
  readonly image: ImageSpec;
}

export interface WithStmt extends Node<'with'> {
  readonly expression: string | null;
}

export interface ImageStmt extends Node<'image'> {
  readonly name: readonly string[];
  /** Python expression defining the image, null for an ATL-only image. */
  readonly value: string | null;
  readonly hasAtl: boolean;
  /** Expression sources found in the ATL block, e.g. `"eileen blink"` frames. */
  readonly atl: readonly string[];
}

export interface TransformStmt extends Node<'transform'> {
  readonly name: string;
}

export interface UserStmt extends Node<'user'> {
  /** Statement name, e.g. "play music", "voice", "nvl clear". */
  readonly name: string;
  readonly line: string;
  /**
   * Statements of a creator-defined statement's script block (`block="script"`,
   * run in place, then execution goes on) and of its subparses.
   */
  readonly block: readonly Stmt[];
}

/**
 * A layer of a layered image. `image` is the source of the layer's
 * displayable, null when Ren'Py derives an image name from the attribute
 * (`<name>_<group>_<variant>_<attribute>`).
 */
export type LayeredLayer =
  | { readonly kind: 'always'; readonly image: string | null }
  | {
      readonly kind: 'attribute';
      readonly name: string;
      /** Group used in derived image names: null outside a group, or in a `multiple` group. */
      readonly group: string | null;
      readonly variant: string | null;
      readonly default: boolean;
      readonly image: string | null;
    }
  /** An `auto` group: one more attribute per image named `<name>_<group>_<variant>_<x>`. */
  | { readonly kind: 'auto'; readonly group: string | null; readonly variant: string | null }
  /** An `if`/`elif`/`else` layer; `condition` is null for `else`. */
  | {
      readonly kind: 'condition';
      readonly condition: string | null;
      readonly image: string | null;
    };

/** `layeredimage <name>:` (a creator-defined statement of renpy/common, Ren'Py 7+). */
export interface LayeredImageStmt extends Node<'layeredimage'> {
  /** Image name, e.g. "eileen" or "lucy far". */
  readonly name: string;
  readonly layers: readonly LayeredLayer[];
}

export interface TranslateStmt extends Node<'translate'> {
  readonly identifier: string;
  /** null for the default language (wrappers added in slot 2). */
  readonly language: string | null;
  readonly block: readonly Stmt[];
}

export interface TranslateStringStmt extends Node<'translate-string'> {
  /** null for `translate None strings`: overrides of the default language's own strings. */
  readonly language: string | null;
  readonly old: string;
  readonly new: string;
}

export interface TranslateBlockStmt extends Node<'translate-block'> {
  readonly language: string | null;
  readonly block: readonly Stmt[];
}

/**
 * A statement of a screen (screen language 2), in source order; nested
 * blocks are flattened into the list. Expressions are Python sources.
 */
export type ScreenElement =
  | {
      readonly kind: 'displayable';
      readonly loc: Location;
      /** Statement name: "text", "add", "imagebutton"…; "screen" for the screen's own keywords. */
      readonly name: string;
      readonly positional: readonly string[];
      readonly keywords: readonly (readonly [string, string])[];
    }
  /** The condition of an `if`/`elif` or `showif` branch. */
  | { readonly kind: 'condition'; readonly loc: Location; readonly code: string }
  | {
      readonly kind: 'for';
      readonly loc: Location;
      readonly variable: string;
      readonly code: string;
    }
  | {
      readonly kind: 'use';
      readonly loc: Location;
      /** Screen used; for `use expression`, the expression. */
      readonly target: string;
      readonly args: readonly string[];
    }
  | { readonly kind: 'python'; readonly loc: Location; readonly code: string }
  | {
      readonly kind: 'default';
      readonly loc: Location;
      readonly variable: string;
      readonly code: string;
    };

/** The Python expressions and code of a screen element, in source order. */
export function screenElementCode(element: ScreenElement): string[] {
  switch (element.kind) {
    case 'displayable':
      return [...element.positional, ...element.keywords.map(([, code]) => code)];
    case 'use':
      return [...element.args];
    default:
      return [element.code];
  }
}

export interface ScreenStmt extends Node<'screen'> {
  readonly name: string;
  /** Every string constant found in the screen, e.g. label names in Jump("..."). */
  readonly strings: readonly string[];
  /** The screen's statements (empty for screens older than screen language 2). */
  readonly elements: readonly ScreenElement[];
}

export interface StyleStmt extends Node<'style'> {
  readonly name: string;
  /** Style properties and the source of their values, e.g. ["background", '"#000"']. */
  readonly properties: readonly (readonly [string, string])[];
}

export type SimpleStmt = Node<'pass' | 'end-translate'>;

export interface UnknownStmt extends Node<'unknown'> {
  readonly className: string;
  /** Statements found in a `block` attribute, so their dialogue still counts. */
  readonly block: readonly Stmt[];
}

export type Stmt =
  | LabelStmt
  | SayStmt
  | MenuStmt
  | JumpStmt
  | CallStmt
  | ReturnStmt
  | IfStmt
  | WhileStmt
  | InitStmt
  | DefineStmt
  | DefaultStmt
  | PythonStmt
  | SceneStmt
  | ShowStmt
  | HideStmt
  | WithStmt
  | ImageStmt
  | TransformStmt
  | UserStmt
  | LayeredImageStmt
  | TranslateStmt
  | TranslateStringStmt
  | TranslateBlockStmt
  | ScreenStmt
  | StyleStmt
  | SimpleStmt
  | UnknownStmt;

/** Nested statement lists of a statement, in source order. */
export function childBlocks(stmt: Stmt): (readonly Stmt[])[] {
  switch (stmt.kind) {
    case 'label':
    case 'while':
    case 'init':
    case 'translate':
    case 'translate-block':
    case 'unknown':
    case 'user':
      return [stmt.block];
    case 'if':
      return stmt.branches.map((b) => b.block);
    case 'menu':
      return stmt.items.flatMap((i) => (i.block ? [i.block] : []));
    default:
      return [];
  }
}
