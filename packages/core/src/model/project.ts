import type { Vfs } from '../vfs/vfs';
import type { Diagnostic } from './diagnostic';
import type { ScriptFile } from './script';

/** Everything the analyses can look at. */
export interface Project {
  readonly vfs: Vfs;
  /** Decoded compiled scripts that Ren'Py would load, in path order. */
  readonly scripts: readonly ScriptFile[];
  /** Small text files read during loading (version files, logs), by VFS path. */
  readonly texts: ReadonlyMap<string, string>;
  /** Problems found while loading (unreadable archives, scripts...). */
  readonly diagnostics: readonly Diagnostic[];
}
