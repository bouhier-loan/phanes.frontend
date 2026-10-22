import { describe, expect, it } from 'vitest';
import { parseRenpyText, plainText } from '../src/ui/player/text';

const plain = { bold: false, italic: false, underline: false, strike: false, color: null };

describe('Ren’Py text', () => {
  it('keeps style tags and drops timing tags', () => {
    expect(parseRenpyText('{b}The end{/b}, [player_name].{w} Bye{nw}')).toEqual([
      { ...plain, text: 'The end', bold: true, variable: false },
      { ...plain, text: ', ', variable: false },
      { ...plain, text: '[player_name]', variable: true },
      { ...plain, text: '. Bye', variable: false },
    ]);
  });

  it('nests tags and colours, and unescapes braces', () => {
    expect(parseRenpyText('{color=#f00}{i}a{/i}b{/color}{{c}} [[d]')).toEqual([
      { ...plain, text: 'a', italic: true, color: '#f00', variable: false },
      { ...plain, text: 'b', color: '#f00', variable: false },
      { ...plain, text: '{c}} [d]', variable: false },
    ]);
    expect(parseRenpyText('{color=red}x{/color}')).toEqual([
      { ...plain, text: 'x', variable: false },
    ]);
  });

  it('turns paragraphs into line breaks and survives unclosed tags', () => {
    expect(plainText('one{p}two')).toBe('one\ntwo');
    expect(plainText('broken {tag')).toBe('broken {tag');
    expect(plainText('broken [var')).toBe('broken [var');
  });
});
