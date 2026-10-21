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
}

export interface TransformStmt extends Node<'transform'> {
  readonly name: string;
}

export interface UserStmt extends Node<'user'> {
  /** Statement name, e.g. "play music", "voice", "nvl clear". */
  readonly name: string;
  readonly line: string;
}

export interface TranslateStmt extends Node<'translate'> {
  readonly identifier: string;
  /** null for the default language (wrappers added in slot 2). */
  readonly language: string | null;
  readonly block: readonly Stmt[];
}

export interface TranslateStringStmt extends Node<'translate-string'> {
  readonly language: string;
  readonly old: string;
  readonly new: string;
}

export interface TranslateBlockStmt extends Node<'translate-block'> {
  readonly language: string | null;
  readonly block: readonly Stmt[];
}

export interface ScreenStmt extends Node<'screen'> {
  readonly name: string;
  /** Every string constant found in the screen, e.g. label names in Jump("..."). */
  readonly strings: readonly string[];
}

export interface StyleStmt extends Node<'style'> {
  readonly name: string;
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
      return [stmt.block];
    case 'if':
      return stmt.branches.map((b) => b.block);
    case 'menu':
      return stmt.items.flatMap((i) => (i.block ? [i.block] : []));
    default:
      return [];
  }
}
