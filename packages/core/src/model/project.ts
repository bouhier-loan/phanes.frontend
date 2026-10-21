import type { Vfs } from '../vfs/vfs';
import type { Location } from './ast';
import type { Diagnostic } from './diagnostic';
import type { ScriptFile } from './script';

/** A default-language translation identifier, as Ren'Py computed it (slot 2). */
export type TranslationId = {
  readonly id: string;
  readonly loc: Location;
  /** Label the block belongs to. */
  readonly label: string | null;
  /** False for blocks without dialogue, e.g. a lone `nvl clear`. */
  readonly hasSay: boolean;
  /** Compiled script (VFS path) the identifier was read from. */
  readonly script: string;
};

export interface TranslationIds {
  readonly ids: readonly TranslationId[];
  /** Default-language scripts whose identifiers could not be read. */
  readonly unavailable: readonly string[];
}

/** Everything the analyses can look at. */
export interface Project {
  readonly vfs: Vfs;
  /** Decoded compiled scripts that Ren'Py would load, in path order. */
  readonly scripts: readonly ScriptFile[];
  /** Small text files read during loading (version files, logs), by VFS path. */
  readonly texts: ReadonlyMap<string, string>;
  /** Problems found while loading (unreadable archives, scripts...). */
  readonly diagnostics: readonly Diagnostic[];
  /**
   * Translation identifiers of the default language, read only when the game
   * has translations (null otherwise, or when not loaded).
   */
  readonly translationIds?: TranslationIds | null;
}
