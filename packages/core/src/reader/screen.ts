import { walkStatements } from '../analyses/walk';
import type { Project } from '../model/project';

export type ScreenSize = { width: number; height: number };

const GUI_INIT = /\bgui\.init\(\s*(\d+)\s*,\s*(\d+)\s*\)/;
const CONFIG_SIZE = /\bconfig\.screen_(width|height)\s*=\s*(\d+)\b/g;

function size(width: number | undefined, height: number | undefined): ScreenSize | null {
  return width && height && width > 0 && height > 0 ? { width, height } : null;
}

/**
 * The game's screen size, from `gui.init(w, h)` (Ren'Py 6.99+ GUI) or
 * `config.screen_width` / `config.screen_height`; null when neither is found.
 */
export function screenSize(project: Project): ScreenSize | null {
  const found: { gui: ScreenSize | null; width?: number; height?: number } = { gui: null };
  walkStatements(project.scripts, (stmt, ctx) => {
    if (ctx.language !== null) return;
    if (stmt.kind === 'python') {
      const m = GUI_INIT.exec(stmt.code);
      found.gui ??= size(Number(m?.[1]), Number(m?.[2]));
      for (const c of stmt.code.matchAll(CONFIG_SIZE))
        found[c[1] === 'width' ? 'width' : 'height'] ??= Number(c[2]);
    } else if (stmt.kind === 'define' && stmt.store === 'store.config' && stmt.operator === '=') {
      const value = /^\s*(\d+)\s*$/.exec(stmt.value)?.[1];
      if (value && (stmt.name === 'screen_width' || stmt.name === 'screen_height'))
        found[stmt.name === 'screen_width' ? 'width' : 'height'] ??= Number(value);
    }
  });
  return found.gui ?? size(found.width, found.height);
}
