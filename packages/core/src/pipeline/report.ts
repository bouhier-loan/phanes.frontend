import type { Diagnostic } from '../model/diagnostic';
import type { Json } from '../model/json';

export const REPORT_SCHEMA_VERSION = 1;
export const GENERATOR = { name: 'Phanes', version: '0.1.0' } as const;

export type Report = {
  schemaVersion: typeof REPORT_SCHEMA_VERSION;
  generator: { name: string; version: string };
  generatedAt: string;
  input: {
    rootName: string | null;
    gameDir: string;
    fileCount: number;
    totalBytes: number;
  };
  /** Analysis results by analysis id. A failed analysis is absent (see diagnostics). */
  analyses: Record<string, Json>;
  diagnostics: Diagnostic[];
};
