import { FormatError } from '../errors';

const HEX = /^[0-9a-fA-F]+$/;

function hexValue(bytes: Uint8Array, start: number, count: number): number | null {
  if (start + count > bytes.length) return null;
  let text = '';
  for (let k = 0; k < count; k++) text += String.fromCharCode(bytes[start + k] ?? 0);
  return HEX.test(text) ? Number.parseInt(text, 16) : null;
}

const SIMPLE_ESCAPES: Readonly<Record<string, number>> = {
  '\n': -1, // line continuation: produces nothing
  '\\': 0x5c,
  "'": 0x27,
  '"': 0x22,
  a: 0x07,
  b: 0x08,
  f: 0x0c,
  n: 0x0a,
  r: 0x0d,
  t: 0x09,
  v: 0x0b,
};

/**
 * Python's `codecs.escape_decode`, used by the protocol 0 STRING opcode.
 * Unknown escapes are kept verbatim, like Python does.
 */
export function pythonEscapeDecode(bytes: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i] ?? 0;
    if (b !== 0x5c) {
      out.push(b);
      i++;
      continue;
    }
    const next = bytes[i + 1];
    if (next === undefined) {
      throw new FormatError('PICKLE_INVALID', 'trailing backslash in STRING', { offset: i });
    }
    const ch = String.fromCharCode(next);
    const simple = SIMPLE_ESCAPES[ch];
    if (simple !== undefined) {
      if (simple >= 0) out.push(simple);
      i += 2;
    } else if (next >= 0x30 && next <= 0x37) {
      let value = 0;
      let k = 0;
      while (k < 3) {
        const d = bytes[i + 1 + k];
        if (d === undefined || d < 0x30 || d > 0x37) break;
        value = value * 8 + (d - 0x30);
        k++;
      }
      out.push(value & 0xff);
      i += 1 + k;
    } else if (ch === 'x') {
      const value = hexValue(bytes, i + 2, 2);
      if (value === null) {
        throw new FormatError('PICKLE_INVALID', 'invalid \\x escape in STRING', { offset: i });
      }
      out.push(value);
      i += 4;
    } else {
      out.push(0x5c, next);
      i += 2;
    }
  }
  return Uint8Array.from(out);
}

/**
 * Python's `raw-unicode-escape` decoder, used by the protocol 0 UNICODE opcode:
 * bytes are Latin-1, except `\uXXXX` and `\UXXXXXXXX` when the backslash is not
 * itself escaped.
 */
export function rawUnicodeEscapeDecode(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i] ?? 0;
    if (b !== 0x5c) {
      out += String.fromCharCode(b);
      i++;
      continue;
    }
    // Count the run of backslashes: only an odd run starts an escape.
    let run = 0;
    while (bytes[i + run] === 0x5c) run++;
    const marker = bytes[i + run];
    if (run % 2 === 1 && (marker === 0x75 || marker === 0x55)) {
      out += '\\'.repeat(run - 1);
      const count = marker === 0x75 ? 4 : 8;
      const value = hexValue(bytes, i + run + 1, count);
      if (value === null || value > 0x10ffff) {
        throw new FormatError('PICKLE_INVALID', 'invalid \\u escape in UNICODE', { offset: i });
      }
      out += String.fromCodePoint(value);
      i += run + 1 + count;
    } else {
      out += '\\'.repeat(run);
      i += run;
    }
  }
  return out;
}
