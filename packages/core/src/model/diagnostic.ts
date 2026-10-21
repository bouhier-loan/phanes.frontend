import { isFormatError } from '@phanes/renpy-formats';

export type Severity = 'error' | 'warning' | 'info';

/**
 * Something the user should know about the input: an unreadable file, an
 * unsupported variant, an analysis that failed. `code` is stable and drives
 * the UI's (French) wording; `message` is an English technical fallback.
 */
export interface Diagnostic {
  readonly severity: Severity;
  readonly code: string;
  readonly message: string;
  readonly path?: string;
  readonly details?: Readonly<Record<string, string | number | boolean | null>>;
}

/** Converts any thrown value into a diagnostic for `path`. */
export function diagnosticFromError(
  error: unknown,
  path: string,
  severity: Severity = 'error',
): Diagnostic {
  if (isFormatError(error)) {
    return { severity, code: error.code, message: error.message, path, details: error.details };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { severity, code: 'INTERNAL_ERROR', message, path };
}
