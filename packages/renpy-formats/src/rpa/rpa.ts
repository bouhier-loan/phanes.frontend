/*
 * RPA archive index reader. Format details follow Ren'Py's own loader
 * (renpy/loader.py: RPAv3ArchiveHandler, RPAv2ArchiveHandler,
 * RPAv1ArchiveHandler, load_from_archive) and archiver
 * (launcher/game/archiver.rpy). Ren'Py is MIT licensed.
 */
import { FormatError } from '../errors';
import {
  BytesSource,
  ConcatSource,
  type FileSource,
  readRange,
  SliceSource,
} from '../io/file-source';
import { unpickle, type PickleLimits } from '../pickle/unpickler';
import { isPyInt, PyBytes, PyDict, sequenceItems, type PyValue } from '../pickle/values';
import { decodeLatin1, decodeUtf8, encodeLatin1 } from '../text/utf8';
import { inflateZlib, looksLikeZlib } from '../zlib/inflate';

export type RpaVersion = 'RPA-1.0' | 'RPA-2.0' | 'RPA-3.0';

export type RpaSegment =
  | { readonly kind: 'data'; readonly offset: number; readonly length: number }
  | { readonly kind: 'prefix'; readonly bytes: Uint8Array };

export interface RpaEntry {
  /** Name inside the archive, relative to the game directory. */
  readonly name: string;
  /** Logical size of the file (prefix included). */
  readonly size: number;
  readonly segments: readonly RpaSegment[];
}

/** An index entry that was skipped because it is malformed. */
export interface RpaProblem {
  readonly name: string;
  readonly message: string;
}

export interface RpaHeader {
  readonly version: RpaVersion;
  readonly indexOffset: number;
  /** XOR key (RPA-3.0 only). */
  readonly key: number | null;
}

export interface RpaIndex extends RpaHeader {
  readonly entries: readonly RpaEntry[];
  readonly problems: readonly RpaProblem[];
  /** Pickle protocol of the index (the launcher writes HIGHEST_PROTOCOL: 2 on Python 2, 5 on Python 3). */
  readonly pickleProtocol: number;
  /** Index written by Python 2, hence by Ren'Py <= 7 or a Python 2 tool. */
  readonly python2: boolean;
}

export interface RpaReadOptions {
  readonly maxIndexBytes?: number;
  readonly maxInflatedBytes?: number;
  readonly pickleLimits?: Partial<PickleLimits>;
}

const DEFAULTS = {
  maxIndexBytes: 256 * 1024 * 1024,
  maxInflatedBytes: 256 * 1024 * 1024,
};

const HEADER_PEEK = 64;
const V3 = 'RPA-3.0 ';
const V2 = 'RPA-2.0 ';

/** Python's int(text, 16): surrounding whitespace, sign, 0x prefix, underscores. */
function parsePythonHex(text: string): bigint | null {
  const m = /^\s*([+-]?)(?:0[xX])?([0-9a-fA-F]+(?:_[0-9a-fA-F]+)*)\s*$/.exec(text);
  if (!m?.[2]) return null;
  const value = BigInt(`0x${m[2].replaceAll('_', '')}`);
  return m[1] === '-' ? -value : value;
}

/** Printable preview of a header, for diagnostics. */
export function describeHeader(bytes: Uint8Array): string {
  const head = bytes.subarray(0, 16);
  let text = '';
  for (const b of head) text += b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.';
  return text;
}

/** Recognizes an archive from its first bytes (RPA-1.0 indexes are .rpi files). */
export function sniffArchive(head: Uint8Array): 'RPA-3.0' | 'RPA-2.0' | 'zlib' | null {
  const text = decodeLatin1(head.subarray(0, 8));
  if (text === V3) return 'RPA-3.0';
  if (text === V2) return 'RPA-2.0';
  if (head.length >= 2 && looksLikeZlib(head[0] ?? 0, head[1] ?? 0)) return 'zlib';
  return null;
}

function toOffset(value: bigint, archiveSize: number, what: string): number {
  if (value < 0n || value > BigInt(archiveSize)) {
    throw new FormatError('RPA_BAD_HEADER', `${what} ${value} is outside the archive`, {
      value: value.toString(),
      archiveSize,
    });
  }
  return Number(value);
}

/** Parses the header of an RPA-2.0 or RPA-3.0 archive. */
export async function readRpaHeader(archive: FileSource): Promise<RpaHeader> {
  const head = await readRange(archive, 0, HEADER_PEEK);
  const kind = sniffArchive(head);
  if (kind === 'RPA-3.0') {
    // renpy/loader.py: l = infile.read(40); offset = int(l[8:24], 16); key = int(l[25:33], 16)
    const l = decodeLatin1(head.subarray(0, 40));
    const offset = parsePythonHex(l.slice(8, 24));
    const key = parsePythonHex(l.slice(25, 33));
    if (offset === null || key === null) {
      throw new FormatError('RPA_BAD_HEADER', 'malformed RPA-3.0 header', {
        header: describeHeader(head),
      });
    }
    return {
      version: 'RPA-3.0',
      indexOffset: toOffset(offset, archive.size, 'index offset'),
      // At most 8 hex digits, so the key always fits in a JS number.
      key: Number(key),
    };
  }
  if (kind === 'RPA-2.0') {
    // renpy/loader.py: l = infile.read(24); offset = int(l[8:], 16)
    const offset = parsePythonHex(decodeLatin1(head.subarray(8, 24)));
    if (offset === null) {
      throw new FormatError('RPA_BAD_HEADER', 'malformed RPA-2.0 header', {
        header: describeHeader(head),
      });
    }
    return {
      version: 'RPA-2.0',
      indexOffset: toOffset(offset, archive.size, 'index offset'),
      key: null,
    };
  }
  throw new FormatError('RPA_UNKNOWN_HEADER', 'not a supported RPA archive', {
    header: describeHeader(head),
  });
}

function entryName(key: PyValue): string | null {
  if (typeof key === 'string') return key;
  if (key instanceof PyBytes) return decodeUtf8(key.data, 'surrogateescape');
  return null;
}

function prefixBytes(start: PyValue | undefined): Uint8Array | null {
  if (start === undefined || start === null) return new Uint8Array(0);
  if (start instanceof PyBytes) return start.data;
  if (typeof start === 'string') return encodeLatin1(start);
  return null;
}

function parseEntry(
  name: string,
  value: PyValue,
  key: bigint,
  archiveSize: number,
): RpaEntry | string {
  const tuples = sequenceItems(value);
  if (!tuples || tuples.length === 0) return 'index value is not a list of tuples';
  const segments: RpaSegment[] = [];
  let size = 0;
  for (const tuple of tuples) {
    const items = sequenceItems(tuple);
    if (!items || items.length < 1 || items.length > 3) return 'malformed index tuple';
    if (items.length === 1) {
      const prefix = prefixBytes(items[0]);
      if (!prefix) return 'invalid prefix';
      if (prefix.length > 0) segments.push({ kind: 'prefix', bytes: prefix });
      size += prefix.length;
      continue;
    }
    const [rawOffset, rawLength, start] = items;
    if (!isPyInt(rawOffset) || !isPyInt(rawLength)) return 'offset or length is not an integer';
    const offset = BigInt(rawOffset) ^ key;
    const length = BigInt(rawLength) ^ key;
    if (offset < 0n || length < 0n || offset + length > BigInt(archiveSize)) {
      return `data range [${offset}, ${offset + length}) is outside the archive`;
    }
    const prefix = prefixBytes(start);
    if (!prefix) return 'invalid prefix';
    if (prefix.length > 0) segments.push({ kind: 'prefix', bytes: prefix });
    segments.push({ kind: 'data', offset: Number(offset), length: Number(length) });
    size += prefix.length + Number(length);
  }
  return { name, size, segments };
}

async function readIndexBytes(
  source: FileSource,
  start: number,
  options: RpaReadOptions,
): Promise<Uint8Array> {
  const maxIndex = options.maxIndexBytes ?? DEFAULTS.maxIndexBytes;
  const length = source.size - start;
  if (length > maxIndex) {
    throw new FormatError('TOO_LARGE', `archive index is larger than ${maxIndex} bytes`, {
      size: length,
      limit: maxIndex,
    });
  }
  const compressed = await readRange(source, start, source.size);
  return inflateZlib(compressed, {
    maxOutput: options.maxInflatedBytes ?? DEFAULTS.maxInflatedBytes,
  });
}

function decodeIndex(
  header: RpaHeader,
  pickled: Uint8Array,
  archiveSize: number,
  options: RpaReadOptions,
): RpaIndex {
  // Python 2 str stay bytes: names are decoded as UTF-8 below and prefixes
  // must keep their exact bytes.
  const { value, protocol, python2 } = unpickle(pickled, {
    py2Strings: 'bytes',
    ...(options.pickleLimits ? { limits: options.pickleLimits } : {}),
  });
  if (!(value instanceof PyDict)) {
    throw new FormatError('RPA_BAD_INDEX', 'archive index is not a dict');
  }
  const key = header.key === null ? 0n : BigInt(header.key);
  const entries: RpaEntry[] = [];
  const problems: RpaProblem[] = [];
  for (const [rawName, rawValue] of value.items()) {
    const name = entryName(rawName);
    if (name === null) {
      problems.push({ name: '?', message: 'entry name is not a string' });
      continue;
    }
    const parsed = parseEntry(name, rawValue, key, archiveSize);
    if (typeof parsed === 'string') problems.push({ name, message: parsed });
    else entries.push(parsed);
  }
  return { ...header, entries, problems, pickleProtocol: protocol, python2 };
}

/** Reads the index of an RPA-2.0 or RPA-3.0 archive. Only the index is read. */
export async function readRpaIndex(
  archive: FileSource,
  options: RpaReadOptions = {},
): Promise<RpaIndex> {
  const header = await readRpaHeader(archive);
  const pickled = await readIndexBytes(archive, header.indexOffset, options);
  return decodeIndex(header, pickled, archive.size, options);
}

/**
 * Reads an RPA-1.0 index: a separate .rpi file (zlib-compressed pickle)
 * describing the matching .rpa data file, which has no header.
 */
export async function readRpiIndex(
  rpi: FileSource,
  data: FileSource,
  options: RpaReadOptions = {},
): Promise<RpaIndex> {
  const head = await readRange(rpi, 0, 2);
  if (sniffArchive(head) !== 'zlib') {
    throw new FormatError('RPA_UNKNOWN_HEADER', 'not an RPA-1.0 index', {
      header: describeHeader(head),
    });
  }
  const pickled = await readIndexBytes(rpi, 0, options);
  return decodeIndex(
    { version: 'RPA-1.0', indexOffset: 0, key: null },
    pickled,
    data.size,
    options,
  );
}

/** Opens an archive entry as a lazily-read FileSource. */
export function openRpaEntry(archive: FileSource, entry: RpaEntry, path: string): FileSource {
  const [only] = entry.segments;
  if (entry.segments.length === 1 && only?.kind === 'data') {
    return new SliceSource(path, archive, only.offset, only.length);
  }
  return new ConcatSource(
    path,
    entry.segments.map((segment) =>
      segment.kind === 'data'
        ? new SliceSource(path, archive, segment.offset, segment.length)
        : new BytesSource(path, segment.bytes),
    ),
  );
}
