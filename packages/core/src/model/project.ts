import type { Vfs } from '../vfs/vfs';
import type { Diagnostic } from './diagnostic';

/** Everything the analyses can look at. */
export interface Project {
  readonly vfs: Vfs;
  /** Problems found while loading (unreadable archives, scripts...). */
  readonly diagnostics: readonly Diagnostic[];
}
