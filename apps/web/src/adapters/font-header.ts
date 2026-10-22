/*
 * Font file headers, from the OpenType (sfnt), WOFF 1.0 and WOFF 2.0
 * specifications: enough to tell a font from a stub or a truncated file before
 * handing it to FontFace, whose sanitizer would log errors for it.
 */

const SFNT = new Set([0x00010000, 0x4f54544f /* OTTO */, 0x74727565 /* true */]);
const WOFF = 0x774f4646; // wOFF
const WOFF2 = 0x774f4632; // wOF2
const TTC = 0x74746366; // ttcf

/** True when the bytes start like a complete font file of `size` bytes. */
export function looksLikeFont(bytes: Uint8Array, size: number): boolean {
  if (bytes.length < 12) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = view.getUint32(0);
  if (SFNT.has(tag)) {
    const tables = view.getUint16(4);
    return tables > 0 && size >= 12 + 16 * tables;
  }
  if (tag === WOFF || tag === WOFF2) {
    // Header: signature, flavor, total length, then the number of tables.
    if (bytes.length < 14) return false;
    return view.getUint32(8) === size && view.getUint16(12) > 0;
  }
  if (tag === TTC) {
    const fonts = view.getUint32(8);
    return fonts > 0 && size >= 12 + 4 * fonts;
  }
  return false;
}
