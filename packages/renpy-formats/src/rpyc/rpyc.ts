/*
 * Compiled Ren'Py script (.rpyc / .rpymc) reader. The container format follows
 * renpy/script.py (Script.read_rpyc_data / write_rpyc_header); Ren'Py is MIT
 * licensed.
 *
 * RPYC2: "RENPY RPC2", then (slot, start, length) uint32 triples read from the
 * first 1024 bytes until slot 0. Slot 1 holds the AST before static
 * transforms, slot 2 after them (with Translate wrappers). An MD5 digest is
 * appended at the end of the file. Legacy files are a bare zlib stream. Each
 * slot is a zlib-compressed pickle of (data, stmts).
 */
import { FormatError } from '../errors';
import { ByteReader } from '../io/byte-reader';
import { type FileSource, readFully } from '../io/file-source';
import { type PickleLimits, unpickle } from '../pickle/unpickler';
import { PyDict, PyList, sequenceItems, type PyValue } from '../pickle/values';
import { decodeLatin1 } from '../text/utf8';
import { inflateZlib, looksLikeZlib } from '../zlib/inflate';
import { describeHeader } from '../rpa/rpa';

export const RPYC2_HEADER = 'RENPY RPC2';
/** Ren'Py reads the slot table from this many leading bytes. */
const HEADER_WINDOW = 1024;

export interface RpycSlotEntry {
  readonly slot: number;
  readonly start: number;
  readonly length: number;
}

export interface RpycContainer {
  readonly format: 'rpc2' | 'legacy';
  readonly slots: readonly RpycSlotEntry[];
  /** Oddities in the slot table (ranges outside the file, missing terminator). */
  readonly warnings: readonly string[];
}

export interface RpycOptions {
  /** Maximum .rpyc file size. Default 128 MiB. */
  readonly maxFileBytes?: number;
  /** Maximum decompressed slot size. Default 256 MiB. */
  readonly maxInflatedBytes?: number;
  readonly pickleLimits?: Partial<PickleLimits>;
  /** Slots to try, in order. Default [1, 2], like unrpyc (Ren'Py itself tries 2 first). */
  readonly slots?: readonly number[];
}

export interface RpycScript {
  readonly format: 'rpc2' | 'legacy';
  /** Slot the statements were decoded from. */
  readonly slot: number;
  /** Pickle protocol: 2 up to Ren'Py 8.3, 5 from Ren'Py 8.4 (renpy/compat/pickle.py). */
  readonly pickleProtocol: number;
  /** Written by Python 2, hence Ren'Py <= 7. */
  readonly python2: boolean;
  /** The `data` dict: version, key, deferred_parse_errors... */
  readonly data: PyValue;
  /** Top-level statements. */
  readonly stmts: readonly PyValue[];
  readonly warnings: readonly string[];
}

/** Parses the slot table of a compiled script. */
export function parseRpycContainer(bytes: Uint8Array): RpycContainer {
  const size = bytes.length;
  if (decodeLatin1(bytes.subarray(0, RPYC2_HEADER.length)) !== RPYC2_HEADER) {
    if (size >= 2 && looksLikeZlib(bytes[0] ?? 0, bytes[1] ?? 0)) {
      return { format: 'legacy', slots: [{ slot: 1, start: 0, length: size }], warnings: [] };
    }
    throw new FormatError('RPYC_BAD_HEADER', 'not a compiled Ren’Py script', {
      header: describeHeader(bytes),
    });
  }
  const reader = new ByteReader(bytes.subarray(0, Math.min(size, HEADER_WINDOW)));
  reader.pos = RPYC2_HEADER.length;
  const slots: RpycSlotEntry[] = [];
  const warnings: string[] = [];
  let terminated = false;
  while (reader.remaining >= 12) {
    const slot = reader.u32le();
    const start = reader.u32le();
    const length = reader.u32le();
    if (slot === 0) {
      terminated = true;
      break;
    }
    if (start + length > size) {
      warnings.push(`slot ${slot} range [${start}, ${start + length}) is outside the file`);
      continue;
    }
    slots.push({ slot, start, length });
  }
  if (!terminated) warnings.push('slot table is not terminated');
  return { format: 'rpc2', slots, warnings };
}

export interface RpycPayload {
  readonly format: 'rpc2' | 'legacy';
  readonly slot: number;
  readonly pickleProtocol: number;
  readonly python2: boolean;
  /** The unpickled `(data, stmts)` pair, as stored. */
  readonly value: PyValue;
  readonly warnings: readonly string[];
}

function splitPayload(value: PyValue, slot: number): { data: PyDict; stmts: readonly PyValue[] } {
  const pair = sequenceItems(value);
  const stmts = pair?.length === 2 ? pair[1] : undefined;
  if (!pair || !(stmts instanceof PyList)) {
    throw new FormatError('RPYC_BAD_PAYLOAD', 'slot does not contain a (data, statements) pair', {
      slot,
    });
  }
  const data = pair[0] ?? null;
  if (!(data instanceof PyDict)) {
    throw new FormatError('RPYC_BAD_PAYLOAD', 'script data is not a dict', { slot });
  }
  return { data, stmts: stmts.items };
}

/**
 * Decodes the raw pickled payload of a compiled script, trying each preferred
 * slot in turn: a damaged slot 1 falls back to slot 2.
 */
export async function readRpycPayload(
  source: FileSource,
  options: RpycOptions = {},
): Promise<RpycPayload> {
  const bytes = await readFully(source, options.maxFileBytes ?? 128 * 1024 * 1024);
  const container = parseRpycContainer(bytes);
  const order = options.slots ?? [1, 2];
  const warnings = [...container.warnings];
  let firstError: FormatError | null = null;
  for (const wanted of order) {
    const entry = container.slots.find((s) => s.slot === wanted);
    if (!entry) continue;
    try {
      const compressed = bytes.subarray(entry.start, entry.start + entry.length);
      const pickled = inflateZlib(compressed, {
        maxOutput: options.maxInflatedBytes ?? 256 * 1024 * 1024,
      });
      const result = unpickle(
        pickled,
        options.pickleLimits ? { limits: options.pickleLimits } : {},
      );
      splitPayload(result.value, wanted);
      return {
        format: container.format,
        slot: wanted,
        pickleProtocol: result.protocol,
        python2: result.python2,
        value: result.value,
        warnings: [...warnings, ...result.warnings],
      };
    } catch (error) {
      if (!(error instanceof FormatError)) throw error;
      firstError ??= error;
      warnings.push(`slot ${wanted}: ${error.message}`);
    }
  }
  if (firstError) throw firstError;
  throw new FormatError('RPYC_NO_SLOT', 'no usable slot in compiled script', {
    slots: container.slots.map((s) => s.slot).join(','),
  });
}

/** Decodes the `data` dict and top-level statements of a compiled script. */
export async function readRpyc(source: FileSource, options: RpycOptions = {}): Promise<RpycScript> {
  const payload = await readRpycPayload(source, options);
  const { data, stmts } = splitPayload(payload.value, payload.slot);
  return {
    format: payload.format,
    slot: payload.slot,
    pickleProtocol: payload.pickleProtocol,
    python2: payload.python2,
    data,
    stmts,
    warnings: payload.warnings,
  };
}
