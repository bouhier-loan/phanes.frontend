import { FormatError } from '../errors';

/** Bounds-checked cursor over a byte buffer. */
export class ByteReader {
  pos = 0;
  private readonly view: DataView;

  constructor(readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get remaining(): number {
    return this.bytes.length - this.pos;
  }

  private need(n: number): void {
    if (n > this.bytes.length - this.pos) {
      throw new FormatError('TRUNCATED', `need ${n} bytes at offset ${this.pos}`, {
        offset: this.pos,
        needed: n,
        available: this.bytes.length - this.pos,
      });
    }
  }

  u8(): number {
    this.need(1);
    return this.view.getUint8(this.pos++);
  }

  u16le(): number {
    this.need(2);
    const v = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return v;
  }

  u32le(): number {
    this.need(4);
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }

  i32le(): number {
    this.need(4);
    const v = this.view.getInt32(this.pos, true);
    this.pos += 4;
    return v;
  }

  u64le(): bigint {
    this.need(8);
    const v = this.view.getBigUint64(this.pos, true);
    this.pos += 8;
    return v;
  }

  f64be(): number {
    this.need(8);
    const v = this.view.getFloat64(this.pos, false);
    this.pos += 8;
    return v;
  }

  /** Returns a view (not a copy) of the next `n` bytes. */
  take(n: number): Uint8Array {
    this.need(n);
    const out = this.bytes.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }

  /** Returns the bytes up to (excluding) the next LF, and consumes the LF. */
  line(): Uint8Array {
    const nl = this.bytes.indexOf(0x0a, this.pos);
    if (nl < 0) {
      throw new FormatError('TRUNCATED', `unterminated line at offset ${this.pos}`, {
        offset: this.pos,
      });
    }
    const out = this.bytes.subarray(this.pos, nl);
    this.pos = nl + 1;
    return out;
  }
}
