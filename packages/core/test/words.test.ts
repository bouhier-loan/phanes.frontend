import { describe, expect, it } from 'vitest';
import { countText, readingMinutes, stripTextTags } from '../src';

describe('countText', () => {
  it.each([
    ['Good morning! Did you sleep well?', 6],
    ['{b}The end{/b}, [player_name].', 3],
    ["C'était une matinée calme.", 4],
    ['Well-known 42 things', 3],
    ['{{literal}} [[not interpolated]', 3],
    ['Wait{w=0.5} for it{nw}', 3],
    ['   ', 0],
  ])('%s -> %i words', (text, words) => {
    expect(countText(text).words).toBe(words);
  });

  it('counts CJK characters separately', () => {
    expect(countText('こんにちは世界')).toEqual({ words: 0, cjkChars: 7 });
    expect(countText('Hello 世界!')).toEqual({ words: 1, cjkChars: 2 });
    expect(countText('안녕하세요 세계')).toEqual({ words: 2, cjkChars: 0 });
  });

  it('strips tags but keeps escaped braces and brackets', () => {
    expect(stripTextTags('{i}a{/i} {{b}} [[c] [d]')).toBe('a {b}} [c]  X ');
  });

  it('estimates reading time', () => {
    expect(readingMinutes({ words: 400, cjkChars: 500 })).toBe(3);
  });
});
