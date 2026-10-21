import { describe, expect, it } from 'vitest';
import { parseCall, readStringLiteral, stringLiteralValue } from '../src';

describe('string literals', () => {
  it.each([
    ['"Eileen"', 'Eileen'],
    ["'it\\'s'", "it's"],
    ['u"caf\\u00e9"', 'café'],
    ['r"a\\nb"', 'a\\nb'],
    ['"""multi\nline"""', 'multi\nline'],
    ['"a" "b"', 'ab'],
    ['"\\x41\\101"', 'AA'],
  ])('%s', (source, value) => {
    expect(stringLiteralValue(source)).toBe(value);
  });

  it('rejects non-literals', () => {
    expect(stringLiteralValue('name')).toBeNull();
    expect(stringLiteralValue('"a" + b')).toBeNull();
    expect(stringLiteralValue('f"{x}"')).toBeNull();
    expect(readStringLiteral('"unterminated')).toBeNull();
  });
});

describe('parseCall', () => {
  it('splits positional and keyword arguments', () => {
    const call = parseCall('Character("Eileen", color="#c8ffc8", who_prefix=(1, 2))');
    expect(call?.callee).toBe('Character');
    expect(call?.positional.map((a) => a.string)).toEqual(['Eileen']);
    expect(call?.keywords.get('color')?.string).toBe('#c8ffc8');
    expect(call?.keywords.get('who_prefix')?.source).toBe('(1, 2)');
  });

  it('unwraps translation markers and handles commas inside strings', () => {
    expect(parseCall('Character(_("Lucy, the cat"), image="lucy")')?.positional[0]?.string).toBe(
      'Lucy, the cat',
    );
    expect(parseCall("renpy.character.Character(__('A'))")?.callee).toBe(
      'renpy.character.Character',
    );
  });

  it('keeps non-constant arguments as source text', () => {
    const call = parseCall('Character(None, kind=nvl)');
    expect(call?.positional[0]).toEqual({ source: 'None', string: null });
    expect(call?.keywords.get('kind')?.source).toBe('nvl');
  });

  it('rejects what is not a call', () => {
    expect(parseCall('x + 1')).toBeNull();
    expect(parseCall('Character("unclosed"')).toBeNull();
  });
});
