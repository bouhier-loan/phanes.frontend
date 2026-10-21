import type { CallStmt, JumpStmt, LabelStmt, Location, Stmt } from '../model/ast';

/** Where a jump or call sits: inside a condition, a menu choice, or neither. */
export interface FlowContext {
  readonly conditional: boolean;
  readonly choice: {
    readonly menu: string;
    readonly text: string;
    readonly conditional: boolean;
  } | null;
}

export interface FlowHandlers {
  jump?(stmt: JumpStmt, ctx: FlowContext): void;
  call?(stmt: CallStmt, ctx: FlowContext): void;
  return?(stmt: Stmt): void;
  /** A label nested in a block: execution falls into it, then back to the outer block. */
  enterLabel?(stmt: LabelStmt, ctx: FlowContext): void;
  exitLabel?(stmt: LabelStmt): void;
}

export const TOP: FlowContext = { conditional: false, choice: null };

/** Stable key of a menu, shared by the graph and menus analyses. */
export function menuKey(loc: Location): string {
  return `${loc.file}:${loc.line}`;
}

/**
 * Walks a block in execution order and tells whether control can reach its
 * end (rules in docs/analyses.md): a jump or return stops it; an `if` stops
 * it when it has an `else` and no branch completes; a menu when no choice
 * completes; `while True` never completes. Nested labels are scanned in
 * place between `enterLabel` and `exitLabel`; `init` and translation blocks
 * are skipped.
 */
export function scanFlow(
  block: readonly Stmt[],
  handlers: FlowHandlers,
  ctx: FlowContext = TOP,
  depth = 0,
): boolean {
  if (depth > 400) return true;
  for (const stmt of block) {
    switch (stmt.kind) {
      case 'jump':
        handlers.jump?.(stmt, ctx);
        return false;
      case 'call':
        handlers.call?.(stmt, ctx);
        break;
      case 'return':
        handlers.return?.(stmt);
        return false;
      case 'if': {
        let completes = false;
        for (const branch of stmt.branches) {
          const inner = { ...ctx, conditional: true };
          if (scanFlow(branch.block, handlers, inner, depth + 1)) completes = true;
        }
        const hasElse = stmt.branches.some((b) => b.condition.trim() === 'True');
        if (hasElse && !completes) return false;
        break;
      }
      case 'while': {
        scanFlow(stmt.block, handlers, { ...ctx, conditional: true }, depth + 1);
        if (stmt.condition.trim() === 'True' || stmt.condition.trim() === '1') return false;
        break;
      }
      case 'menu': {
        let completes = false;
        let blocks = 0;
        for (const item of stmt.items) {
          if (item.block === null) continue;
          blocks++;
          const conditional = item.condition.trim() !== 'True';
          const inner: FlowContext = {
            conditional: ctx.conditional || conditional,
            choice: { menu: menuKey(stmt.loc), text: item.text, conditional },
          };
          if (scanFlow(item.block, handlers, inner, depth + 1)) completes = true;
        }
        if (blocks > 0 && !completes) return false;
        break;
      }
      case 'label': {
        handlers.enterLabel?.(stmt, ctx);
        const completes = scanFlow(stmt.block, handlers, ctx, depth + 1);
        handlers.exitLabel?.(stmt);
        if (!completes) return false;
        break;
      }
      case 'unknown':
        scanFlow(stmt.block, handlers, ctx, depth + 1);
        break;
      default:
        break;
    }
  }
  return true;
}
