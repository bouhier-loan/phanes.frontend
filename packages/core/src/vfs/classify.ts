/** What a file is, from its name. */
export type FileKind =
  | 'script'
  | 'compiled-script'
  | 'archive'
  | 'image'
  | 'audio'
  | 'video'
  | 'font'
  | 'python'
  | 'text'
  | 'other';

export const FILE_KINDS: readonly FileKind[] = [
  'script',
  'compiled-script',
  'archive',
  'image',
  'audio',
  'video',
  'font',
  'python',
  'text',
  'other',
];

const EXTENSIONS: ReadonlyMap<string, FileKind> = new Map<string, FileKind>([
  ...['rpy', 'rpym'].map((e) => [e, 'script'] as const),
  ...['rpyc', 'rpymc'].map((e) => [e, 'compiled-script'] as const),
  ...['rpa', 'rpi'].map((e) => [e, 'archive'] as const),
  ...['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'bmp', 'tga', 'svg', 'ico', 'jxl'].map(
    (e) => [e, 'image'] as const,
  ),
  ...['ogg', 'oga', 'opus', 'mp3', 'wav', 'flac', 'm4a', 'aac', 'mp2'].map(
    (e) => [e, 'audio'] as const,
  ),
  ...['webm', 'ogv', 'mkv', 'mp4', 'm4v', 'avi', 'mpg', 'mpeg', 'mov'].map(
    (e) => [e, 'video'] as const,
  ),
  ...['ttf', 'otf', 'ttc', 'woff', 'woff2', 'fnt'].map((e) => [e, 'font'] as const),
  ...['py', 'pyc', 'pyo', 'pyd', 'pyi', 'rpyb'].map((e) => [e, 'python'] as const),
  ...['txt', 'json', 'csv', 'tsv', 'md', 'xml', 'yaml', 'yml', 'ini', 'cfg', 'log', 'html'].map(
    (e) => [e, 'text'] as const,
  ),
]);

export function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase();
}

export function kindOf(path: string): FileKind {
  // Ren'Py 8 also loads scripts written as Python files named *_ren.py.
  if (path.toLowerCase().endsWith('_ren.py')) return 'script';
  return EXTENSIONS.get(extensionOf(path)) ?? 'other';
}

/** Where a file lives relative to the game. */
export type FileZone = 'game' | 'cache' | 'saves' | 'engine' | 'outside';

export const FILE_ZONES: readonly FileZone[] = ['game', 'cache', 'saves', 'engine', 'outside'];

const LAUNCHER_EXTENSIONS = new Set(['exe', 'sh', 'py', 'app', 'command', 'dll', 'so', 'dylib']);

/**
 * `gamePath` is the path relative to the game directory (null outside it);
 * `outerPath` the path relative to the distribution root.
 */
export function zoneOf(gamePath: string | null, outerPath: string): FileZone {
  if (gamePath !== null) {
    const lower = gamePath.toLowerCase();
    if (lower.startsWith('cache/') || lower.endsWith('.rpyb')) return 'cache';
    if (lower.startsWith('saves/')) return 'saves';
    return 'game';
  }
  const first = outerPath.split('/')[0]?.toLowerCase() ?? '';
  if (first === 'renpy' || first === 'lib' || first.endsWith('.app')) return 'engine';
  if (!outerPath.includes('/') && LAUNCHER_EXTENSIONS.has(extensionOf(outerPath))) return 'engine';
  return 'outside';
}
