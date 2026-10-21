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
  type RpycOptions,
} from '@phanes/renpy-formats';
import { mapStatements, newAclReport } from '../acl/map';
import { type Diagnostic, diagnosticFromError } from '../model/diagnostic';
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
