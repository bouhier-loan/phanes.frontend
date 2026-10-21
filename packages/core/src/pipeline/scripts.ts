import {
  decodeUtf8,
  PyBytes,
  PyDict,
  PyList,
  PyObject,
  PyTuple,
  type PyValue,
  readRange,
  readRpyc,
  readRpycPayload,
  type RpycOptions,
  sequenceItems,
} from '@phanes/renpy-formats';
import { mapStatements, newAclReport } from '../acl/map';
import { walkStatements } from '../analyses/walk';
import type { Stmt } from '../model/ast';
import { type Diagnostic, diagnosticFromError } from '../model/diagnostic';
import type { TranslationId, TranslationIds } from '../model/project';
import type { ScriptFile, ScriptTraits } from '../model/script';
import { versionFilePaths } from '../version/detect';
import { effectiveGameEntries, type Vfs, type VfsEntry } from '../vfs/vfs';

/** Text files read in full up to this size, the rest is ignored. */
const MAX_TEXT_BYTES = 256 * 1024;

/** Looks for Ren'Py 8.4+ serialization markers in the first nodes. */
function detectTraits(stmts: readonly PyValue[]): ScriptTraits {
  let cslots = false;
  let astsupport = false;
  const first = stmts[0];
  if (first instanceof PyObject) cslots = first.attrs.has('col_offset') && !first.attrs.has('next');
  const stack: PyValue[] = stmts.slice(0, 20);
  const seen = new Set<object>();
  let budget = 5000;
  while (stack.length > 0 && budget-- > 0 && !astsupport) {
    const v = stack.pop() ?? null;
    if (v === null || typeof v !== 'object' || v instanceof PyBytes || seen.has(v)) continue;
    seen.add(v);
    if (v instanceof PyObject) {
      if (v.className.startsWith('renpy.astsupport.')) astsupport = true;
      stack.push(...v.args, ...v.attrs.values());
      if (v.state !== undefined) stack.push(v.state);
    } else if (v instanceof PyList || v instanceof PyTuple) stack.push(...v.items);
    else if (v instanceof PyDict) stack.push(...v.values());
  }
  return { cslots, astsupport };
}

export interface ScriptLoadProgress {
  readonly done: number;
  readonly total: number;
  readonly path: string;
}

/** Decodes every compiled script Ren'Py would load from the game directory. */
export async function loadScripts(
  vfs: Vfs,
  options: { rpyc?: RpycOptions; onProgress?: (p: ScriptLoadProgress) => void } = {},
): Promise<{ scripts: ScriptFile[]; diagnostics: Diagnostic[] }> {
  const entries = effectiveGameEntries(vfs)
    .filter(
      (e): e is VfsEntry & { gamePath: string } =>
        e.kind === 'compiled-script' && e.zone === 'game',
    )
    .sort((a, b) => (a.gamePath < b.gamePath ? -1 : a.gamePath > b.gamePath ? 1 : 0));
  const scripts: ScriptFile[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const [i, entry] of entries.entries()) {
    options.onProgress?.({ done: i, total: entries.length, path: entry.path });
    try {
      const rpyc = await readRpyc(entry.source, options.rpyc);
      const report = newAclReport();
      const { statements } = mapStatements(rpyc.stmts, entry.gamePath, report);
      const data = rpyc.data instanceof PyDict ? rpyc.data : null;
      const version = data?.get('version');
      scripts.push({
        path: entry.path,
        gamePath: entry.gamePath,
        archive: entry.origin.type === 'archive' ? entry.origin.archive : null,
        slot: rpyc.slot,
        pickleProtocol: rpyc.pickleProtocol,
        python2: rpyc.python2,
        scriptVersion: typeof version === 'number' ? version : null,
        traits: detectTraits(rpyc.stmts),
        statements,
      });
      if (rpyc.slot !== 1) {
        diagnostics.push({
          severity: 'warning',
          code: 'RPYC_SLOT_FALLBACK',
          message: `read slot ${rpyc.slot}: ${rpyc.warnings.join('; ')}`,
          path: entry.path,
          details: { slot: rpyc.slot },
        });
      }
      for (const [className, count] of report.unknownClasses) {
        diagnostics.push({
          severity: 'info',
          code: 'AST_UNKNOWN_NODE',
          message: `${count} unsupported ${className} statement(s)`,
          path: entry.path,
          details: { className, count },
        });
      }
      if (report.truncated || report.invalidStatements > 0) {
        diagnostics.push({
          severity: 'warning',
          code: 'AST_MALFORMED',
          message: 'some statements could not be read',
          path: entry.path,
          details: { invalidStatements: report.invalidStatements, truncated: report.truncated },
        });
      }
    } catch (error) {
      diagnostics.push(diagnosticFromError(error, entry.path));
    }
  }
  return { scripts, diagnostics };
}

/** Reads the small text files used to detect the Ren'Py version. */
export async function loadTexts(vfs: Vfs): Promise<Map<string, string>> {
  const wanted = new Set(versionFilePaths(vfs.gameDir));
  const texts = new Map<string, string>();
  for (const entry of vfs.entries) {
    if (!wanted.has(entry.path) || entry.shadowedBy !== null || texts.has(entry.path)) continue;
    try {
      const bytes = await readRange(entry.source, 0, MAX_TEXT_BYTES);
      texts.set(entry.path, decodeUtf8(bytes, 'surrogateescape'));
    } catch {
      // Version files are optional hints: an unreadable one is simply skipped.
    }
  }
  return texts;
}

/** True when the game ships translations: tl/ scripts or translate statements. */
export function hasTranslations(scripts: readonly ScriptFile[]): boolean {
  if (scripts.some((s) => s.gamePath.startsWith('tl/'))) return true;
  let found = false;
  walkStatements(scripts, (stmt) => {
    if (found) return;
    if (stmt.kind === 'translate-string') found = true;
    else if (stmt.kind === 'translate' && stmt.language !== null) found = true;
    else if (stmt.kind === 'say' && stmt.language !== null) found = true;
  });
  return found;
}

/**
 * Default-language translation identifiers of statements: `translate None`
 * wrappers (Ren'Py 6.99-7.x, and blocks with several statements) and
 * TranslateSay nodes (Ren'Py 8), as found in slot 2.
 */
export function translationIdsOf(script: ScriptFile, statements: readonly Stmt[]): TranslationId[] {
  const out: TranslationId[] = [];
  const wrapped = new Set<Stmt>();
  walkStatements([{ ...script, statements }], (stmt, ctx) => {
    if (stmt.kind === 'translate' && stmt.language === null) {
      for (const inner of stmt.block) wrapped.add(inner);
      out.push({
        id: stmt.identifier,
        loc: stmt.loc,
        label: ctx.label,
        hasSay: stmt.block.some((s) => s.kind === 'say'),
        script: script.path,
      });
    } else if (
      stmt.kind === 'say' &&
      stmt.language === null &&
      stmt.identifier !== null &&
      ctx.language === null &&
      !wrapped.has(stmt)
    ) {
      out.push({
        id: stmt.identifier,
        loc: stmt.loc,
        label: ctx.label,
        hasSay: true,
        script: script.path,
      });
    }
  });
  return out;
}

/**
 * Reads the translation identifiers Ren'Py stored in slot 2 of every
 * default-language script (computed by renpy/translation/__init__.py). Slot 1,
 * the one analyzed, has none, and recomputing them is not reliable across
 * Ren'Py versions (docs/analyses.md).
 */
export async function loadTranslationIds(
  vfs: Vfs,
  scripts: readonly ScriptFile[],
  options: { rpyc?: RpycOptions; onProgress?: (p: ScriptLoadProgress) => void } = {},
): Promise<{ translationIds: TranslationIds; diagnostics: Diagnostic[] }> {
  const ids: TranslationId[] = [];
  const unavailable: string[] = [];
  const diagnostics: Diagnostic[] = [];
  const targets = scripts.filter((s) => !s.gamePath.startsWith('tl/'));
  const sources = new Map(vfs.entries.map((e) => [e.path, e.source]));
  for (const [i, script] of targets.entries()) {
    options.onProgress?.({ done: i, total: targets.length, path: script.path });
    if (script.slot === 2) {
      ids.push(...translationIdsOf(script, script.statements));
      continue;
    }
    const source = sources.get(script.path);
    try {
      if (!source) throw new Error('script source not found');
      const payload = await readRpycPayload(source, { ...options.rpyc, slots: [2] });
      const stmts = sequenceItems(payload.value)?.[1];
      const { statements } = mapStatements(sequenceItems(stmts) ?? [], script.gamePath);
      ids.push(...translationIdsOf(script, statements));
    } catch (error) {
      unavailable.push(script.path);
      const d = diagnosticFromError(error, script.path, 'info');
      diagnostics.push({ ...d, code: 'TL_IDS_UNAVAILABLE', details: { cause: d.code } });
    }
  }
  return { translationIds: { ids, unavailable }, diagnostics };
}
