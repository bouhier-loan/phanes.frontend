import type { Stmt } from './ast';

/** A decoded compiled script. */
export interface ScriptFile {
  /** Path in the VFS. */
  readonly path: string;
  /** Path relative to the game directory. */
  readonly gamePath: string;
  /** Archive the script was read from, or null for a file on disk. */
  readonly archive: string | null;
  readonly slot: number;
  readonly pickleProtocol: number;
  readonly python2: boolean;
  /** `data["version"]`: Ren'Py's script_version. */
  readonly scriptVersion: number | null;
  /** Serialization hints about the Ren'Py version that compiled the script. */
  readonly traits: ScriptTraits;
  readonly statements: readonly Stmt[];
}

export interface ScriptTraits {
  /** Nodes use renpy.cslots (Ren'Py 8.4+): linenumber/col_offset slots, `_name`. */
  readonly cslots: boolean;
  /** renpy.astsupport.PyExpr (Ren'Py 8.4+). */
  readonly astsupport: boolean;
}
