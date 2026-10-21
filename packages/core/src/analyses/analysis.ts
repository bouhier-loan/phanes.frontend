import type { Json } from '../model/json';
import type { Project } from '../model/project';

/**
 * An analysis plugin: a pure function of the project whose result is
 * JSON-serializable. A failing analysis becomes a diagnostic; the others
 * still run.
 */
export interface Analysis<T extends Json = Json> {
  readonly id: string;
  run(project: Project): T;
}
