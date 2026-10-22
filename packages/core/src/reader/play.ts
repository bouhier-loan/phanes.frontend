import type { ReaderLine } from './reader';

/*
 * Plays a label "as in game" over the flat lines of readLabel(), which list
 * the statements in source order with their nesting depth: a menu has its
 * choices one level deeper and their blocks two levels deeper; if/elif/else
 * branches share the depth of the `if` with their blocks one level deeper.
 * Nothing is evaluated: the reader picks menu choices and branches.
 */

export type PlayChoice = { text: string; condition: string | null; index: number };

export type PlayBranch = {
  keyword: 'if' | 'elif' | 'else' | 'while';
  condition: string | null;
  index: number;
};

/** Where playing stops, waiting for the reader or for another label. */
export type PlayStop =
  | { kind: 'say'; index: number }
  | { kind: 'menu'; index: number; choices: PlayChoice[] }
  /** An if/elif/else chain (or a while loop): the reader picks the branch. */
  | { kind: 'branch'; index: number; branches: PlayBranch[]; hasElse: boolean }
  /** `target` is the label reached, null for an expression that is not constant. */
  | { kind: 'jump' | 'call'; index: number; target: string | null }
  | { kind: 'return'; index: number }
  /** The end of the label's lines: Ren'Py falls through to what follows. */
  | { kind: 'end' };

export type PlayStep = {
  stop: PlayStop;
  /** Lines run on the way, in order (staging, audio, python, non-interactive says…). */
  passed: ReaderLine[];
};

/** Statements run past without stopping, at most, between two stops. */
const MAX_STEPS = 100_000;

function skipBlock(content: readonly ReaderLine[], from: number, depth: number): number {
  let j = from;
  while (j < content.length && (content[j]?.depth ?? 0) > depth) j++;
  return j;
}

function isElse(line: ReaderLine | undefined, depth: number): boolean {
  return (
    line?.kind === 'branch' &&
    line.depth === depth &&
    (line.keyword === 'elif' || line.keyword === 'else')
  );
}

/**
 * Index of the line that runs once statement `index` (and its block) is
 * done; null when the label's lines end. Leaving a choice's block continues
 * after its menu, leaving a branch continues after the whole if/elif/else
 * chain, and leaving a while body goes back to the while.
 */
export function continueAt(content: readonly ReaderLine[], index: number): number | null {
  let at = index;
  for (let guard = 0; guard < 1000; guard++) {
    const line = content[at];
    if (!line) return null;
    const depth = line.depth;
    let j = skipBlock(content, at + 1, depth);
    while (isElse(content[j], depth)) j = skipBlock(content, j + 1, depth);
    if (j < content.length && content[j]?.depth === depth) return j;
    // The enclosing block ends here: its header statement is done.
    let parent = at - 1;
    while (parent >= 0 && (content[parent]?.depth ?? 0) >= depth) parent--;
    const header = content[parent];
    if (!header) return j < content.length ? j : null;
    if (header.kind === 'branch' && header.keyword === 'while') return parent;
    if (header.kind === 'choice') {
      // The menu is the nearest shallower line before the choice.
      let menu = parent - 1;
      while (menu >= 0 && (content[menu]?.depth ?? 0) >= header.depth) menu--;
      if (menu < 0) return null;
      at = menu;
    } else at = parent;
  }
  return null;
}

/** First line of the block of `index` (a choice, branch or label), else what follows it. */
export function enterBlock(content: readonly ReaderLine[], index: number): number | null {
  const line = content[index];
  const next = content[index + 1];
  if (!line) return null;
  return next && next.depth > line.depth ? index + 1 : continueAt(content, index);
}

/** Runs from line `from` up to the next stop. */
export function nextStop(content: readonly ReaderLine[], from: number | null): PlayStep {
  const passed: ReaderLine[] = [];
  let i = from;
  for (let steps = 0; steps < MAX_STEPS; steps++) {
    const line = i === null ? undefined : content[i];
    if (i === null || !line) return { stop: { kind: 'end' }, passed };
    switch (line.kind) {
      case 'say':
        if (line.interact) return { stop: { kind: 'say', index: i }, passed };
        passed.push(line);
        i = continueAt(content, i);
        break;
      case 'menu': {
        const choices: PlayChoice[] = [];
        const end = skipBlock(content, i + 1, line.depth);
        for (let j = i + 1; j < end; j++) {
          const c = content[j];
          if (c?.kind === 'choice' && c.depth === line.depth + 1)
            choices.push({ text: c.text, condition: c.condition, index: j });
        }
        return { stop: { kind: 'menu', index: i, choices }, passed };
      }
      case 'branch': {
        if (line.keyword === 'elif' || line.keyword === 'else') {
          // Only reached through malformed lines: the chain was already decided.
          i = continueAt(content, i);
          break;
        }
        const branches: PlayBranch[] = [
          { keyword: line.keyword, condition: line.condition, index: i },
        ];
        let j = skipBlock(content, i + 1, line.depth);
        while (line.keyword === 'if' && isElse(content[j], line.depth)) {
          const b = content[j];
          if (b?.kind === 'branch')
            branches.push({ keyword: b.keyword, condition: b.condition, index: j });
          j = skipBlock(content, j + 1, line.depth);
        }
        const hasElse = branches[branches.length - 1]?.keyword === 'else';
        return { stop: { kind: 'branch', index: i, branches, hasElse }, passed };
      }
      case 'jump':
      case 'call':
        return { stop: { kind: line.kind, index: i, target: line.resolved }, passed };
      case 'return':
        return { stop: { kind: 'return', index: i }, passed };
      case 'choice':
        // Only reached through malformed lines: a choice runs when picked.
        i = continueAt(content, i);
        break;
      default:
        // Staging, audio, python, nested labels…: run past, entering their block.
        passed.push(line);
        i = enterBlock(content, i);
        break;
    }
  }
  return { stop: { kind: 'end' }, passed };
}
