import type { AudioAsset, ImageAsset } from '@phanes/core';
import { describe, expect, it } from 'vitest';
import {
  filterAudio,
  filterImages,
  folderOf,
  groupBy,
  listRows,
  sortAudio,
  sortImages,
} from '../src/ui/sections/asset-list';

function image(name: string, size: number, displays: number, file = true): ImageAsset {
  const [tag = '', ...attributes] = name.split(' ');
  return {
    name,
    tag,
    attributes,
    category: tag === 'bg' ? 'background' : 'sprite',
    declaration: 'automatic',
    loc: null,
    value: null,
    file: file
      ? { path: `G/game/images/${name}.png`, gamePath: `images/${name}.png`, size, archive: null }
      : null,
    missingFile: null,
    displays: Array.from({ length: displays }, () => ({
      loc: { file: 'game/script.rpy', line: 1 },
      label: null,
      code: `show ${name}`,
    })),
  };
}

function audio(gamePath: string, size: number, channels: string[]): AudioAsset {
  return {
    file: { path: `G/game/${gamePath}`, gamePath, size, archive: null },
    plays: channels.map((channel) => ({
      loc: { file: 'game/script.rpy', line: 1 },
      label: null,
      code: `play ${channel} "${gamePath}"`,
      channel,
      file: gamePath,
    })),
  };
}

const images = [
  image('eileen happy', 30, 2),
  image('bg room', 100, 1),
  image('eileen sad', 10, 0),
  image('eileen angry', 20, 0, false),
];

describe('asset lists', () => {
  it('filters images by text, category and status', () => {
    const names = (list: ImageAsset[]) => list.map((i) => i.name);
    expect(
      names(filterImages(images, { query: 'EILEEN', category: 'all', status: 'never' })),
    ).toEqual(['eileen sad', 'eileen angry']);
    expect(
      names(filterImages(images, { query: '', category: 'background', status: 'all' })),
    ).toEqual(['bg room']);
    expect(names(filterImages(images, { query: '', category: 'all', status: 'no-file' }))).toEqual([
      'eileen angry',
    ]);
    expect(
      names(filterImages(images, { query: 'room.png', category: 'all', status: 'displayed' })),
    ).toEqual(['bg room']);
  });

  it('sorts images', () => {
    expect(sortImages(images, 'size').map((i) => i.name)).toEqual([
      'bg room',
      'eileen happy',
      'eileen sad',
      'eileen angry',
    ]);
    expect(sortImages(images, 'uses').map((i) => i.name)).toEqual([
      'eileen happy',
      'bg room',
      'eileen angry',
      'eileen sad',
    ]);
  });

  it('groups and chunks rows, honoring collapsed groups', () => {
    const groups = groupBy(
      sortImages(images, 'name'),
      (i) => i.tag,
      (i) => i.file?.size ?? 0,
    );
    expect(groups.map((g) => [g.key, g.items.length, g.bytes])).toEqual([
      ['bg', 1, 100],
      ['eileen', 3, 40],
    ]);
    const rows = listRows(groups, 2, { grouped: true, collapsed: new Set(['bg']) });
    expect(rows.map((r) => (r.type === 'header' ? `${r.key}:${r.open}` : r.items.length))).toEqual([
      'h:bg:false',
      'h:eileen:true',
      2,
      1,
    ]);
    expect(listRows(groups, 3, { grouped: false, collapsed: new Set() }).length).toBe(2);
  });

  it('filters and sorts audio by status and channel', () => {
    const files = [
      audio('audio/theme.ogg', 50, ['music', 'music']),
      audio('audio/v1.ogg', 5, ['voice']),
      audio('sfx/unused.ogg', 9, []),
    ];
    const paths = (list: AudioAsset[]) => list.map((a) => a.file.gamePath);
    expect(paths(filterAudio(files, { query: '', status: 'never', channel: 'all' }))).toEqual([
      'sfx/unused.ogg',
    ]);
    expect(paths(filterAudio(files, { query: '', status: 'all', channel: 'voice' }))).toEqual([
      'audio/v1.ogg',
    ]);
    expect(paths(sortAudio(files, 'uses'))).toEqual([
      'audio/theme.ogg',
      'audio/v1.ogg',
      'sfx/unused.ogg',
    ]);
    expect(folderOf('sfx/unused.ogg')).toBe('sfx');
    expect(folderOf('top.ogg')).toBe('');
  });
});
