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
  /**
   * A label nested in a block: execution falls into it (`flowing`), or only
   * reaches it by a jump when the statements before it stop; then back to
   * the outer block.
   */
  enterLabel?(stmt: LabelStmt, ctx: FlowContext, flowing: boolean): void;
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
 * place between `enterLabel` and `exitLabel`, even after a stop, since a jump
 * can reach them; the rest of a stopped block is skipped. `init` and
 * translation blocks are skipped. `reachable` false scans a block that
 * control cannot enter, only for its nested labels.
 */
export function scanFlow(
  block: readonly Stmt[],
  handlers: FlowHandlers,
  ctx: FlowContext = TOP,
  depth = 0,
  reachable = true,
): boolean {
  if (depth > 400) return true;
  let flowing = reachable;
  for (const stmt of block) {
    if (stmt.kind === 'label') {
      handlers.enterLabel?.(stmt, ctx, flowing);
      flowing = scanFlow(stmt.block, handlers, ctx, depth + 1);
      handlers.exitLabel?.(stmt);
      continue;
    }
    if (!flowing) {
      // Skipped, but the script block of a statement may hold labels.
      if (stmt.kind === 'user') flowing = scanFlow(stmt.block, handlers, ctx, depth + 1, false);
      continue;
    }
    switch (stmt.kind) {
      case 'jump':
        handlers.jump?.(stmt, ctx);
        flowing = false;
        break;
      case 'call':
        handlers.call?.(stmt, ctx);
        break;
      case 'return':
        handlers.return?.(stmt);
        flowing = false;
        break;
      case 'if': {
        let completes = false;
        for (const branch of stmt.branches) {
          const inner = { ...ctx, conditional: true };
          if (scanFlow(branch.block, handlers, inner, depth + 1)) completes = true;
        }
        const hasElse = stmt.branches.some((b) => b.condition.trim() === 'True');
        if (hasElse && !completes) flowing = false;
        break;
      }
      case 'while': {
        scanFlow(stmt.block, handlers, { ...ctx, conditional: true }, depth + 1);
        if (stmt.condition.trim() === 'True' || stmt.condition.trim() === '1') flowing = false;
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
        if (blocks > 0 && !completes) flowing = false;
        break;
      }
      case 'user':
        // A script block runs in place, then execution goes on after the statement.
        flowing = scanFlow(stmt.block, handlers, ctx, depth + 1);
        break;
      case 'unknown':
        scanFlow(stmt.block, handlers, ctx, depth + 1);
        break;
      default:
        break;
    }
  }
  return flowing;
}
