import type { Project } from '../model/project';

export type VersionConfidence = 'exact' | 'approximate' | 'range';
export type VersionSource = 'vc_version' | 'version_tuple' | 'log' | 'script_version' | 'scripts';

export type VersionEvidence = { source: VersionSource; path: string | null; value: string };

export type RenpyVersionInfo = {
  /** Best guess: "8.5.3.26051504", "8.5.3", or a range such as "8.0–8.3". */
  version: string | null;
  confidence: VersionConfidence | null;
  source: VersionSource | null;
  /** Python major version the game runs on, when known. */
  python: 2 | 3 | null;
  evidence: VersionEvidence[];
};

/** Paths of the small text files that carry version information. */
export function versionFilePaths(gameDir: string): string[] {
  const slash = gameDir.lastIndexOf('/');
  const outer = slash < 0 ? '' : gameDir.slice(0, slash);
  const at = (dir: string, name: string) => (dir === '' ? name : `${dir}/${name}`);
  return [
    at(outer, 'renpy/vc_version.py'),
    at(outer, 'renpy/__init__.py'),
    at(outer, 'log.txt'),
    at(outer, 'traceback.txt'),
    at(gameDir, 'script_version.txt'),
  ];
}

const VC_VERSION_STRING = /^\s*version\s*=\s*['"](\d+(?:\.\d+)+)['"]/m;
const VC_VERSION_NUMBER = /^\s*vc_version\s*=\s*(\d+)/m;
// renpy/__init__.py up to 7.x: version_tuple = (7, 4, 11, vc_version)
const VERSION_TUPLE =
  /version_tuple\s*=\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d+)\s*)?,\s*vc_version\s*\)/;
const LOG_VERSION = /Ren'Py (\d+\.\d+\.\d+(?:\.\d+)*)/;
const SCRIPT_VERSION = /\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/;

export function detectRenpyVersion(project: Project): RenpyVersionInfo {
  const [vcPath, initPath, logPath, tracebackPath, scriptVersionPath] = versionFilePaths(
    project.vfs.gameDir,
  );
  const text = (path: string | undefined) =>
    path === undefined ? undefined : project.texts.get(path);
  const evidence: VersionEvidence[] = [];

  const vc = text(vcPath);
  if (vc !== undefined) {
    const exact = VC_VERSION_STRING.exec(vc)?.[1];
    const commit = VC_VERSION_NUMBER.exec(vc)?.[1];
    if (exact) evidence.push({ source: 'vc_version', path: vcPath ?? null, value: exact });
    else if (commit) {
      const tuple = VERSION_TUPLE.exec(text(initPath) ?? '');
      if (tuple) {
        const parts = [tuple[1], tuple[2], tuple[3], tuple[4]].filter((p) => p !== undefined);
        evidence.push({
          source: 'version_tuple',
          path: initPath ?? null,
          value: [...parts, commit].join('.'),
        });
      }
    }
  }
  for (const path of [logPath, tracebackPath]) {
    const found = LOG_VERSION.exec(text(path) ?? '')?.[1];
    if (found) evidence.push({ source: 'log', path: path ?? null, value: found });
  }
  const sv = SCRIPT_VERSION.exec(text(scriptVersionPath) ?? '');
  if (sv)
    evidence.push({
      source: 'script_version',
      path: scriptVersionPath ?? null,
      value: `${sv[1]}.${sv[2]}.${sv[3]}`,
    });

  const scripts = project.scripts;
  const python2 = scripts.some((s) => s.python2);
  if (scripts.length > 0) {
    let range: string;
    if (python2) range = '≤ 7';
    else if (scripts.some((s) => s.traits.cslots || s.traits.astsupport)) range = '≥ 8.4';
    else if (scripts.every((s) => s.pickleProtocol === 2)) range = '8.0–8.3';
    else range = '8';
    evidence.push({ source: 'scripts', path: null, value: range });
  }

  const best = evidence[0];
  const confidence: VersionConfidence | null = !best
    ? null
    : best.source === 'scripts'
      ? 'range'
      : best.source === 'script_version'
        ? 'approximate'
        : 'exact';
  const major = best && best.source !== 'scripts' ? Number(best.value.split('.')[0]) : null;
  const python: 2 | 3 | null = python2
    ? 2
    : major !== null
      ? major >= 8
        ? 3
        : 2
      : scripts.length > 0
        ? 3
        : null;
  return {
    version: best?.value ?? null,
    confidence,
    source: best?.source ?? null,
    python,
    evidence,
  };
}
