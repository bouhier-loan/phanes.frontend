import { childBlocks, type Location, type MenuStmt, type Stmt } from '../model/ast';
import type { Project } from '../model/project';
import { foldStringExpression } from '../python-lite/names';
import type { Analysis } from './analysis';
import { menuKey, scanFlow } from './flow';
import { walkStatements } from './walk';

export type MenuTarget = {
  kind: 'jump' | 'call';
  target: string;
  /** The target names no label. */
  broken: boolean;
  /** From a `jump expression` (resolved when constant, else the expression). */
  dynamic: boolean;
  loc: Location;
};

export type MenuOption = {
  text: string;
  /** Python condition, null when the choice is always shown. */
  condition: string | null;
  /** Every jump and call in the choice's block, in order. */
  targets: MenuTarget[];
  /** Dialogue lines in the choice's block. */
  lines: number;
  /** Python statements directly in the block (`$ x += 1`). */
  python: string[];
  /** The block can end without jumping: the story continues after the menu. */
  fallsThrough: boolean;
};

export type MenuEntry = {
  /** "<file>:<line>", shared with storyGraph edges. */
  id: string;
  label: string | null;
  file: string;
  line: number;
  script: string;
  /** Who asks: the say statement shown with the menu, or its caption. */
  prompt: { who: string | null; text: string } | null;
  set: string | null;
  options: MenuOption[];
};

export type MenusResult = {
  menus: MenuEntry[];
  totals: { menus: number; options: number; conditional: number; withPrompt: number };
};

function countLines(block: readonly Stmt[]): number {
  let lines = 0;
  walkBlock(block, (stmt) => {
    if (stmt.kind === 'say' && stmt.who !== 'extend') lines++;
  });
  return lines;
}

function walkBlock(block: readonly Stmt[], visit: (stmt: Stmt) => void, depth = 0): void {
  if (depth > 400) return;
  for (const stmt of block) {
    visit(stmt);
    for (const inner of childBlocks(stmt)) walkBlock(inner, visit, depth + 1);
  }
}

/** Every menu of the default language, with its prompt, choices and what follows them. */
export function menus(project: Project): MenusResult {
  const labels = new Set<string>();
  walkStatements(project.scripts, (stmt, ctx) => {
    if (stmt.kind === 'label' && ctx.language === null) labels.add(stmt.name);
  });
  const out: MenuEntry[] = [];
  const option = (item: MenuStmt['items'][number], label: string | null): MenuOption => {
    const block = item.block ?? [];
    const targets: MenuTarget[] = [];
    walkBlock(block, (stmt) => {
      if (stmt.kind !== 'jump' && stmt.kind !== 'call') return;
      let target = stmt.target;
      if (stmt.expression) target = foldStringExpression(stmt.target) ?? stmt.target;
      if (target.startsWith('.') && label !== null)
        target = `${label.split('.')[0] ?? label}${target}`;
      const resolved = !stmt.expression || foldStringExpression(stmt.target) !== null;
      targets.push({
        kind: stmt.kind,
        target,
        broken: resolved && !labels.has(target),
        dynamic: stmt.expression,
        loc: stmt.loc,
      });
    });
    const condition = item.condition.trim();
    return {
      text: item.text,
      condition: condition === 'True' ? null : condition,
      targets,
      lines: countLines(block),
      python: block.flatMap((s) => (s.kind === 'python' ? [s.code] : [])),
      fallsThrough: scanFlow(block, {}),
    };
  };

  for (const script of project.scripts) {
    const visit = (block: readonly Stmt[], label: string | null, depth: number) => {
      if (depth > 400) return;
      block.forEach((stmt, i) => {
        if (stmt.kind === 'translate' || stmt.kind === 'translate-block') {
          if (stmt.language !== null) return;
        }
        if (stmt.kind === 'menu') {
          const previous = block[i - 1];
          const caption = stmt.items.find((item) => item.block === null);
          const prompt =
            previous?.kind === 'say' && !previous.interact
              ? { who: previous.who, text: previous.what }
              : caption
                ? { who: null, text: caption.text }
                : null;
          out.push({
            id: menuKey(stmt.loc),
            label,
            file: stmt.loc.file,
            line: stmt.loc.line,
            script: script.path,
            prompt,
            set: stmt.setVariable,
            options: stmt.items
              .filter((item) => item.block !== null)
              .map((item) => option(item, label)),
          });
        }
        const inner = stmt.kind === 'label' ? stmt.name : label;
        for (const child of childBlocks(stmt)) visit(child, inner, depth + 1);
      });
    };
    visit(script.statements, null, 0);
  }
  const options = out.flatMap((m) => m.options);
  return {
    menus: out,
    totals: {
      menus: out.length,
      options: options.length,
      conditional: options.filter((o) => o.condition !== null).length,
      withPrompt: out.filter((m) => m.prompt !== null).length,
    },
  };
}

export const menusAnalysis: Analysis<MenusResult> = { id: 'menus', run: menus };
