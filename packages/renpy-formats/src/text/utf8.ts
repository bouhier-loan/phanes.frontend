import { FormatError } from '../errors';

/**
 * How invalid UTF-8 is handled, mirroring Python's codec error handlers:
 * - strict: throw;
 * - surrogatepass: accept encoded surrogates (ED A0..BF xx), as CPython's
 *   pickle does for BINUNICODE;
 * - surrogateescape: map each undecodable byte b to U+DC00 + b, as Ren'Py does
 *   for Python 2 `str` (renpy/compat/pickle.py). Lossless.
 */
export type Utf8ErrorMode = 'strict' | 'surrogatepass' | 'surrogateescape';

const CHUNK = 0x2000;

function fromCodes(codes: number[]): string {
  let out = '';
  for (let i = 0; i < codes.length; i += CHUNK) {
    out += String.fromCharCode(...codes.slice(i, i + CHUNK));
  }
  return out;
}

/** Decodes bytes as ISO-8859-1 (every byte is one code point). */
export function decodeLatin1(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return out;
}

/**
 * Length of the valid sequence starting at `i` (1 to 4), or the length of the
 * maximal invalid subpart as a negative number (CPython reports errors on the
 * same ranges, so surrogateescape results match Python's).
 */
function sequenceLength(bytes: Uint8Array, i: number, allowSurrogates: boolean): number {
  const b0 = bytes[i] ?? 0;
  let need: number;
  let lo = 0x80;
  let hi = 0xbf;
  if (b0 >= 0xc2 && b0 <= 0xdf) {
    need = 1;
  } else if (b0 >= 0xe0 && b0 <= 0xef) {
    need = 2;
    if (b0 === 0xe0) lo = 0xa0;
    else if (b0 === 0xed && !allowSurrogates) hi = 0x9f;
  } else if (b0 >= 0xf0 && b0 <= 0xf4) {
    need = 3;
    if (b0 === 0xf0) lo = 0x90;
    else if (b0 === 0xf4) hi = 0x8f;
  } else {
    return -1;
  }
  for (let k = 1; k <= need; k++) {
    const b = bytes[i + k];
    if (b === undefined) return -k;
    if (k === 1 ? b < lo || b > hi : b < 0x80 || b > 0xbf) return -k;
  }
  return need + 1;
}

export function decodeUtf8(bytes: Uint8Array, mode: Utf8ErrorMode = 'strict'): string {
  let ascii = true;
  for (const b of bytes) {
    if (b >= 0x80) {
      ascii = false;
      break;
    }
  }
  if (ascii) return decodeLatin1(bytes);

  const units: number[] = [];
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i] ?? 0;
    if (b0 < 0x80) {
      units.push(b0);
      i++;
      continue;
    }
    const len = sequenceLength(bytes, i, mode === 'surrogatepass');
    if (len < 0) {
      if (mode !== 'surrogateescape') {
        throw new FormatError('TEXT_INVALID', `invalid UTF-8 at byte ${i}`, { offset: i });
      }
      for (let k = 0; k < -len; k++) units.push(0xdc00 + (bytes[i + k] ?? 0));
      i += -len;
      continue;
    }
    let cp: number;
    if (len === 2) {
      cp = ((b0 & 0x1f) << 6) | ((bytes[i + 1] ?? 0) & 0x3f);
    } else if (len === 3) {
      cp = ((b0 & 0x0f) << 12) | (((bytes[i + 1] ?? 0) & 0x3f) << 6) | ((bytes[i + 2] ?? 0) & 0x3f);
    } else {
      cp =
        ((b0 & 0x07) << 18) |
        (((bytes[i + 1] ?? 0) & 0x3f) << 12) |
        (((bytes[i + 2] ?? 0) & 0x3f) << 6) |
        ((bytes[i + 3] ?? 0) & 0x3f);
    }
    if (cp >= 0x10000) {
      cp -= 0x10000;
      units.push(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    } else {
      units.push(cp);
    }
    i += len;
  }
  return fromCodes(units);
}

/** Encodes a string as UTF-8; lone surrogates are written as-is (surrogatepass). */
export function encodeUtf8(text: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let cp = text.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        cp = 0x10000 + ((cp - 0xd800) << 10) + (next - 0xdc00);
        i++;
      }
    }
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000)
      out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else
      out.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
  }
  return Uint8Array.from(out);
}

/**
 * Encodes as ISO-8859-1, as Ren'Py does for `str` RPA prefixes
 * (`start.encode("latin-1")` in renpy/loader.py). Returns null when a code
 * point does not fit in one byte.
 */
export function encodeLatin1(text: string): Uint8Array | null {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c > 0xff) return null;
    out[i] = c;
  }
  return out;
}
