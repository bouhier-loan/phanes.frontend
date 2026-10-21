/** Pickle opcodes, protocols 0 to 5 (CPython Lib/pickle.py). */
export const Op = {
  MARK: 0x28, // (
  STOP: 0x2e, // .
  POP: 0x30, // 0
  POP_MARK: 0x31, // 1
  DUP: 0x32, // 2
  FLOAT: 0x46, // F
  INT: 0x49, // I
  BININT: 0x4a, // J
  BININT1: 0x4b, // K
  LONG: 0x4c, // L
  BININT2: 0x4d, // M
  NONE: 0x4e, // N
  PERSID: 0x50, // P
  BINPERSID: 0x51, // Q
  REDUCE: 0x52, // R
  STRING: 0x53, // S
  BINSTRING: 0x54, // T
  SHORT_BINSTRING: 0x55, // U
  UNICODE: 0x56, // V
  BINUNICODE: 0x58, // X
  APPEND: 0x61, // a
  BUILD: 0x62, // b
  GLOBAL: 0x63, // c
  DICT: 0x64, // d
  EMPTY_DICT: 0x7d, // }
  APPENDS: 0x65, // e
  GET: 0x67, // g
  BINGET: 0x68, // h
  INST: 0x69, // i
  LONG_BINGET: 0x6a, // j
  LIST: 0x6c, // l
  EMPTY_LIST: 0x5d, // ]
  OBJ: 0x6f, // o
  PUT: 0x70, // p
  BINPUT: 0x71, // q
  LONG_BINPUT: 0x72, // r
  SETITEM: 0x73, // s
  TUPLE: 0x74, // t
  EMPTY_TUPLE: 0x29, // )
  SETITEMS: 0x75, // u
  BINFLOAT: 0x47, // G
  // Protocol 2
  PROTO: 0x80,
  NEWOBJ: 0x81,
  EXT1: 0x82,
  EXT2: 0x83,
  EXT4: 0x84,
  TUPLE1: 0x85,
  TUPLE2: 0x86,
  TUPLE3: 0x87,
  NEWTRUE: 0x88,
  NEWFALSE: 0x89,
  LONG1: 0x8a,
  LONG4: 0x8b,
  // Protocol 3
  BINBYTES: 0x42, // B
  SHORT_BINBYTES: 0x43, // C
  // Protocol 4
  SHORT_BINUNICODE: 0x8c,
  BINUNICODE8: 0x8d,
  BINBYTES8: 0x8e,
  EMPTY_SET: 0x8f,
  ADDITEMS: 0x90,
  FROZENSET: 0x91,
  NEWOBJ_EX: 0x92,
  STACK_GLOBAL: 0x93,
  MEMOIZE: 0x94,
  FRAME: 0x95,
  // Protocol 5
  BYTEARRAY8: 0x96,
  NEXT_BUFFER: 0x97,
  READONLY_BUFFER: 0x98,
} as const;

export const HIGHEST_PROTOCOL = 5;
