import { childBlocks, type Stmt } from '../model/ast';
import type { ScriptFile } from '../model/script';

export interface WalkContext {
  readonly script: ScriptFile;
  /** Innermost enclosing label. */
  readonly label: string | null;
  /** Translation language of the enclosing block (null: default language). */
  readonly language: string | null;
}

/** Visits every statement of every script in source order, without recursion. */
export function walkStatements(
  scripts: readonly ScriptFile[],
  visit: (stmt: Stmt, ctx: WalkContext) => void,
): void {
  for (const script of scripts) {
    const stack: { stmts: readonly Stmt[]; index: number; ctx: WalkContext }[] = [
      { stmts: script.statements, index: 0, ctx: { script, label: null, language: null } },
    ];
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      if (!frame) break;
      const stmt = frame.stmts[frame.index++];
      if (stmt === undefined) {
        stack.pop();
        continue;
      }
      visit(stmt, frame.ctx);
      const blocks = childBlocks(stmt);
      if (blocks.length === 0) continue;
      let ctx = frame.ctx;
      if (stmt.kind === 'label') ctx = { ...ctx, label: stmt.name };
      if (stmt.kind === 'translate' || stmt.kind === 'translate-block')
        ctx = { ...ctx, language: stmt.language };
      for (let i = blocks.length - 1; i >= 0; i--) {
        const block = blocks[i];
        if (block) stack.push({ stmts: block, index: 0, ctx });
      }
    }
  }
}

/** True for dialogue in the game's default language. */
export function isDefaultLanguage(stmt: Stmt, ctx: WalkContext): boolean {
  if (ctx.language !== null) return false;
  return stmt.kind !== 'say' || stmt.language === null;
}
