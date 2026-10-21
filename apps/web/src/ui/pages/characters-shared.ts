import type { CharacterEntry } from '@phanes/core';
import { formatLocation } from '../format';
import { t } from '../strings.fr';

/** Colours for characters without a constant `color=`, in table order. */
const PALETTE = ['#e9a23b', '#8eb1ff', '#7dd6c0', '#c6a8ff', '#ff8a75', '#f2c14e', '#a3a8b8'];

export function characterName(c: CharacterEntry): string {
  if (c.id === 'narrator') return t.characters.narrator;
  if (c.name) return c.name;
  if (c.origin === 'expression') return c.id.slice('expr:'.length);
  return c.variable ?? t.characters.nameless;
}

export function characterColor(c: CharacterEntry, index: number): string {
  if (c.color && /^#[0-9a-f]{3,8}$/i.test(c.color)) return c.color;
  if (c.id === 'narrator') return '#a3a8b8';
  return PALETTE[index % PALETTE.length] ?? '#a3a8b8';
}

export function definedIn(c: CharacterEntry): string {
  if (c.id === 'narrator') return t.characters.narratorDefined;
  if (c.definedAt) return formatLocation(c.definedAt);
  if (c.origin === 'builtin') return t.characters.builtin;
  if (c.origin === 'literal') return t.characters.literal;
  return t.characters.notFound;
}
