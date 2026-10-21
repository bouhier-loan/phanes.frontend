/**
 * Creates a sparse RPA-3.0 archive of several GiB, for manual tests of the web
 * app with huge games: the file takes almost no disk space, its index sits
 * past 4 GiB and points at entries spread across the whole file.
 *
 * Usage: pnpm exec tsx tools/make-big-rpa.ts OUTPUT.rpa [SIZE_GIB=6] [ENTRIES=20000]
 */
import { open } from 'node:fs/promises';
import { zlibSync } from 'fflate';

const [output, sizeArg = '6', entriesArg = '20000'] = process.argv.slice(2);
if (!output) {
  console.error('Usage: tsx tools/make-big-rpa.ts OUTPUT.rpa [SIZE_GIB] [ENTRIES]');
  process.exit(1);
}
const size = Number(sizeArg) * 2 ** 30;
const count = Number(entriesArg);
const key = 0x42424242n;

// Pickle protocol 2: {name: [(offset ^ key, length ^ key, b"")], ...}
const bytes: number[] = [0x80, 2, 0x7d, 0x28]; // PROTO 2, EMPTY_DICT, MARK
const push = (...b: number[]) => bytes.push(...b);
const pushLong = (value: bigint) => {
  const out: number[] = [];
  let v = value;
  while (v > 0n) {
    out.push(Number(v & 0xffn));
    v >>= 8n;
  }
  if (out.length === 0 || (out[out.length - 1] ?? 0) & 0x80) out.push(0);
  push(0x8a, out.length, ...out); // LONG1
};
const stride = Math.floor((size - 64 * 1024 * 1024) / count);
for (let i = 0; i < count; i++) {
  const kind = i % 10 === 0 ? 'audio' : 'images';
  const name = new TextEncoder().encode(`${kind}/asset_${i}.${kind === 'audio' ? 'ogg' : 'png'}`);
  push(0x58, ...[0, 8, 16, 24].map((s) => (name.length >> s) & 0xff), ...name); // BINUNICODE
  push(0x5d); // EMPTY_LIST
  pushLong(BigInt(64 + i * stride) ^ key);
  pushLong(BigInt(Math.min(stride, 1 << 20)) ^ key);
  push(0x43, 0, 0x87, 0x61); // SHORT_BINBYTES b"", TUPLE3, APPEND
}
push(0x75, 0x2e); // SETITEMS, STOP
const index = zlibSync(Uint8Array.from(bytes));
const indexOffset = size - index.length;
const header = new TextEncoder().encode(
  `RPA-3.0 ${indexOffset.toString(16).padStart(16, '0')} 42424242\n`,
);

const file = await open(output, 'w');
await file.truncate(size);
await file.write(header, 0, header.length, 0);
await file.write(index, 0, index.length, indexOffset);
await file.close();
console.log(`${output}: ${sizeArg} GiB sparse archive, ${count} entries, index at ${indexOffset}`);
