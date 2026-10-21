/**
 * Error codes raised by the decoders. Every failure caused by file contents is a
 * FormatError; anything else is a bug.
 */
export type FormatErrorCode =
  | 'IO_READ_FAILED'
  | 'TOO_LARGE'
  | 'TRUNCATED'
  | 'ZLIB_INVALID'
  | 'ZLIB_LIMIT'
  | 'TEXT_INVALID'
  | 'PICKLE_INVALID'
  | 'PICKLE_UNSUPPORTED'
  | 'PICKLE_LIMIT'
  | 'RPA_UNKNOWN_HEADER'
  | 'RPA_BAD_HEADER'
  | 'RPA_BAD_INDEX'
  | 'RPYC_BAD_HEADER'
  | 'RPYC_NO_SLOT'
  | 'RPYC_BAD_PAYLOAD';

export type FormatErrorDetails = Readonly<Record<string, string | number | boolean | null>>;

export class FormatError extends Error {
  override readonly name = 'FormatError';

  constructor(
    readonly code: FormatErrorCode,
    message: string,
    readonly details: FormatErrorDetails = {},
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

export function isFormatError(error: unknown): error is FormatError {
  return error instanceof FormatError;
}
