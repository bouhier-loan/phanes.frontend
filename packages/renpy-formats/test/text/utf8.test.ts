import { describe, expect, it } from 'vitest';
import { decodeLatin1, decodeUtf8, encodeLatin1, encodeUtf8, FormatError } from '../../src';
import { pythonEscapeDecode, rawUnicodeEscapeDecode } from '../../src/text/python-escapes';

const bytes = (...values: number[]) => Uint8Array.from(values);
const ascii = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0));

describe('decodeUtf8', () => {
  // Expected values computed with CPython 3.13: bytes.decode('utf-8', mode).
  const surrogateescape: [Uint8Array, string][] = [
    [bytes(0x63, 0x61, 0x66, 0xc3, 0xa9), 'caf\u00e9'],
    [bytes(0xff), '\udcff'],
    [bytes(0xe2, 0x82, 0x41), '\udce2\udc82A'],
    [bytes(0xed, 0xa0, 0x80), '\udced\udca0\udc80'],
    [bytes(0xf0, 0x9f, 0x98, 0x80), '\u{1f600}'],
    [bytes(0xc0, 0xaf), '\udcc0\udcaf'],
    [bytes(0xf4, 0x90, 0x80, 0x80), '\udcf4\udc90\udc80\udc80'],
    [bytes(0x61, 0xe2, 0x82, 0xac, 0x62, 0x80), 'a\u20acb\udc80'],
  ];

  it.each(surrogateescape)('surrogateescape %#', (input, expected) => {
    expect(decodeUtf8(input, 'surrogateescape')).toBe(expected);
  });

  it('surrogatepass accepts encoded surrogates', () => {
    expect(decodeUtf8(bytes(0xed, 0xa0, 0x80), 'surrogatepass')).toBe('\ud800');
  });

  it('strict rejects invalid input', () => {
    expect(() => decodeUtf8(bytes(0xff))).toThrow(FormatError);
    expect(() => decodeUtf8(bytes(0xed, 0xa0, 0x80))).toThrow(FormatError);
  });

  it('round-trips through encodeUtf8', () => {
    const text = 'Ren\u2019Py \u65e5\u672c \u{1f600}';
    expect(decodeUtf8(encodeUtf8(text))).toBe(text);
  });

  it('handles long ASCII and non-ASCII strings', () => {
    const long = 'x'.repeat(100_000);
    expect(decodeUtf8(encodeUtf8(long))).toBe(long);
    const mixed = '\u00e9'.repeat(50_000);
    expect(decodeUtf8(encodeUtf8(mixed))).toBe(mixed);
  });
});

describe('latin-1', () => {
  it('decodes and encodes', () => {
    expect(decodeLatin1(bytes(0x41, 0xe9, 0xff))).toBe('A\u00e9\u00ff');
    expect(encodeLatin1('A\u00e9')).toEqual(bytes(0x41, 0xe9));
    expect(encodeLatin1('\u20ac')).toBeNull();
  });
});

describe('Python escapes', () => {
  it('escape_decode, as the STRING opcode', () => {
    // codecs.escape_decode(b"a\\n\\x41\\101\\q\\'") == b"a\nAA\\q'"
    expect(pythonEscapeDecode(ascii("a\\n\\x41\\101\\q\\'"))).toEqual(ascii("a\nAA\\q'"));
  });

  it('raw-unicode-escape, as the UNICODE opcode', () => {
    // str(b'\\u00e9\\\\u0041\\U0001F600x', 'raw-unicode-escape') == '\xe9\\\\u0041\U0001f600x'
    expect(rawUnicodeEscapeDecode(ascii('\\u00e9\\\\u0041\\U0001F600x'))).toBe(
      '\u00e9\\\\u0041\u{1f600}x',
    );
  });
});
