/*
 * Automatic image names follow Ren'Py's renpy/common/00images.rpy
 * (_scan_images_directory) and the audio namespace renpy/common/00audio.rpy.
 * Ren'Py is MIT licensed (see NOTICE).
 */
import type { ImageSpec, Location, Stmt } from '../model/ast';
import type { Project } from '../model/project';
import { parseCall } from '../python-lite/call';
import { stringLiteralValue } from '../python-lite/literal';
import { tokenize } from '../python-lite/tokens';
import { effectiveGameEntries, type VfsEntry } from '../vfs/vfs';
import type { Analysis } from './analysis';
import { dialogueIndex } from './dialogue';
import { walkStatements } from './walk';

export type AssetFile = {
  /** VFS path, to open the file. */
  path: string;
  gamePath: string;
  size: number;
  archive: string | null;
};

export type AssetSite = { loc: Location; label: string | null; code: string };

export type ImageCategory = 'background' | 'cg' | 'sprite' | 'other';

export type ImageAsset = {
  /** Image name, e.g. "eileen happy". */
  name: string;
  tag: string;
  attributes: string[];
  category: ImageCategory;
  /** An `image` statement, or Ren'Py's automatic definition from images/. */
  declaration: 'statement' | 'automatic';
  loc: Location | null;
  value: string | null;
  file: AssetFile | null;
  /** A file named by the definition but absent from the game. */
  missingFile: string | null;
  /** scene/show statements that display it (or may, for a bare tag). */
  displays: AssetSite[];
};

export type MissingImage = {
  name: string;
  site: AssetSite;
  reason: 'undeclared' | 'file-missing';
  /** Declared name close to the missing one. */
  suggestion: string | null;
  file: string | null;
};

export type AudioPlay = AssetSite & { channel: string; file: string | null };

export type AudioAsset = { file: AssetFile; plays: AudioPlay[] };

export type VideoAsset = { file: AssetFile; uses: AssetSite[] };

export type AssetsResult = {
  images: {
    entries: ImageAsset[];
    missing: MissingImage[];
    /** `show expression …`: not resolved. */
    dynamic: AssetSite[];
    totals: {
      declared: number;
      statement: number;
      automatic: number;
      displayed: number;
      neverDisplayed: number;
      missing: number;
    };
  };
  audio: {
    files: AudioAsset[];
    /** Played files that the game does not contain. */
    missing: AudioPlay[];
    totals: { files: number; played: number; neverPlayed: number; missing: number };
  };
  video: {
    files: VideoAsset[];
    missing: (AssetSite & { file: string })[];
    totals: { files: number; used: number; missing: number };
  };
};

/** Extensions Ren'Py turns into automatic images (renpy/common/00images.rpy). */
const AUTOMATIC_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.avif', '.svg'];
const AUDIO_STATEMENT = /^(play|queue)\s+(\w+)\s+([\s\S]+)$/;
const AUDIO_OPTION = /\s+(?:fadein|fadeout|loop|noloop|if_changed|volume|in|channel)\b/;

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function stripExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row.push(
        Math.min((row[j - 1] ?? 0) + 1, (previous[j] ?? 0) + 1, (previous[j - 1] ?? 0) + cost),
      );
    }
    previous = row;
  }
  return previous[b.length] ?? max + 1;
}

function fileOf(entry: VfsEntry & { gamePath: string }): AssetFile {
  return {
    path: entry.path,
    gamePath: entry.gamePath,
    size: entry.size,
    archive: entry.origin.type === 'archive' ? entry.origin.archive : null,
  };
}

function imageCode(kind: string, image: ImageSpec): string {
  const name = image.expression ? `expression ${image.expression}` : image.name.join(' ');
  const at = image.atList.length > 0 ? ` at ${image.atList.join(', ')}` : '';
  return `${kind} ${name}${at}`;
}

/** String arguments of `fn("…")` calls in Python source (e.g. renpy.movie_cutscene). */
function callStrings(code: string, names: ReadonlySet<string>): string[] {
  const tokens = tokenize(code);
  const out: string[] = [];
  for (let i = 0; i + 2 < tokens.length; i++) {
    const t = tokens[i];
    if (t?.type !== 'name') continue;
    let name = t.value;
    let j = i + 1;
    for (;;) {
      const dot = tokens[j];
      const part = tokens[j + 1];
      if (dot?.type !== 'op' || dot.value !== '.' || part?.type !== 'name') break;
      name += `.${part.value}`;
      j += 2;
    }
    const open = tokens[j];
    const arg = tokens[j + 1];
    if (names.has(name) && open?.type === 'op' && open.value === '(' && arg?.type === 'string')
      out.push(arg.value);
  }
  return out;
}

/**
 * Images, sounds and videos: what the game declares and contains, compared
 * with what the script displays and plays (docs/analyses.md).
 */
export function assets(project: Project): AssetsResult {
  const index = dialogueIndex(project);
  const entries = effectiveGameEntries(project.vfs).filter(
    (e): e is VfsEntry & { gamePath: string } => e.gamePath !== null && e.zone === 'game',
  );
  const byGamePath = new Map(entries.map((e) => [e.gamePath, e]));
  const byLowerPath = new Map(entries.map((e) => [e.gamePath.toLowerCase(), e]));
  const resolve = (path: string, prefixes: readonly string[]) => {
    for (const prefix of prefixes) {
      const hit = byGamePath.get(prefix + path) ?? byLowerPath.get((prefix + path).toLowerCase());
      if (hit) return hit;
    }
    return undefined;
  };

  const spriteTags = new Set<string>();
  for (const def of index.definitions.values()) {
    if (def.imageTag) spriteTags.add(def.imageTag.toLowerCase());
    if (def.name && !def.dynamic) spriteTags.add(def.name.toLowerCase());
  }
  const category = (tag: string): ImageCategory =>
    tag === 'bg' ? 'background' : tag === 'cg' ? 'cg' : spriteTags.has(tag) ? 'sprite' : 'other';

  const images = new Map<string, ImageAsset>();
  const videoUses = new Map<string, AssetSite[]>();
  const videoMissing: (AssetSite & { file: string })[] = [];
  const videoUse = (path: string, site: AssetSite) => {
    const entry = resolve(path, ['']);
    if (!entry) {
      videoMissing.push({ ...site, file: path });
      return;
    }
    videoUses.set(entry.gamePath, [...(videoUses.get(entry.gamePath) ?? []), site]);
  };

  walkStatements(project.scripts, (stmt, ctx) => {
    if (ctx.language !== null || stmt.kind !== 'image' || stmt.name.length === 0) return;
    const name = stmt.name.join(' ');
    if (images.has(name)) return;
    const value = stmt.value;
    let path = value === null ? null : stringLiteralValue(value);
    const call = value === null ? null : parseCall(value);
    const site = { loc: stmt.loc, label: ctx.label, code: `image ${name} = ${value ?? '…'}` };
    if (call && (call.callee.split('.').pop() ?? '') === 'Movie') {
      const play = call.keywords.get('play')?.string ?? call.positional[0]?.string;
      if (play) videoUse(play, site);
    } else if (path === null && call) {
      const first = call.positional[0]?.string ?? null;
      if (first !== null && /\.\w{2,5}$/.test(first)) path = first;
    }
    const entry = path === null ? undefined : resolve(path, ['', 'images/']);
    const [tag = '', ...attributes] = stmt.name;
    images.set(name, {
      name,
      tag,
      attributes,
      category: category(tag),
      declaration: 'statement',
      loc: stmt.loc,
      value,
      file: entry ? fileOf(entry) : null,
      missingFile: path !== null && !entry ? path : null,
      displays: [],
    });
  });
  for (const entry of entries) {
    if (!entry.gamePath.startsWith('images/')) continue;
    const file = basename(entry.gamePath);
    const ext = file.slice(file.lastIndexOf('.')).toLowerCase();
    if (!AUTOMATIC_EXTENSIONS.includes(ext)) continue;
    const parts = stripExtension(file).toLowerCase().split(/\s+/).filter(Boolean);
    const name = parts.join(' ');
    if (parts.length === 0 || images.has(name)) continue;
    const [tag = '', ...attributes] = parts;
    images.set(name, {
      name,
      tag,
      attributes,
      category: category(tag),
      declaration: 'automatic',
      loc: null,
      value: null,
      file: fileOf(entry),
      missingFile: null,
      displays: [],
    });
  }

  const byTag = new Map<string, ImageAsset[]>();
  for (const image of images.values())
    byTag.set(image.tag, [...(byTag.get(image.tag) ?? []), image]);
  const missing: MissingImage[] = [];
  const dynamic: AssetSite[] = [];
  const audioPlays: AudioPlay[] = [];
  const audioDefines = new Map<string, string>();
  // Ren'Py 7+ also names each file of audio/ in the audio namespace.
  const autoAudio = new Map<string, string>();
  for (const e of entries) {
    if (e.kind !== 'audio' || !e.gamePath.startsWith('audio/')) continue;
    const key = stripExtension(basename(e.gamePath))
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_');
    if (!autoAudio.has(key)) autoAudio.set(key, e.gamePath);
  }

  walkStatements(project.scripts, (stmt: Stmt, ctx) => {
    if (ctx.language !== null) return;
    if (stmt.kind === 'define' && stmt.store === 'store.audio') {
      const value = stringLiteralValue(stmt.value);
      if (value !== null) audioDefines.set(stmt.name, value);
    }
  });

  walkStatements(project.scripts, (stmt: Stmt, ctx) => {
    if (ctx.language !== null) return;
    const label = ctx.label;
    if ((stmt.kind === 'scene' && stmt.image) || stmt.kind === 'show') {
      const image = stmt.image;
      if (!image) return;
      const site = { loc: stmt.loc, label, code: imageCode(stmt.kind, image) };
      if (image.expression) {
        dynamic.push(site);
        return;
      }
      const name = image.name.join(' ');
      const exact = images.get(name);
      const [tag = '', ...attrs] = image.name;
      const candidates = exact
        ? [exact]
        : (byTag.get(tag) ?? []).filter((img) => attrs.every((a) => img.attributes.includes(a)));
      for (const img of candidates) img.displays.push(site);
      if (exact?.missingFile) {
        missing.push({
          name,
          site,
          reason: 'file-missing',
          suggestion: null,
          file: exact.missingFile,
        });
      } else if (candidates.length === 0) {
        // Closest declared name, same tag first, within a quarter of the length.
        const max = Math.max(2, Math.floor(name.length / 4));
        let suggestion: string | null = null;
        let best = max + 1;
        for (const other of [...(byTag.get(tag) ?? []), ...images.values()]) {
          const d = distance(other.name, name, max);
          if (d < best) {
            best = d;
            suggestion = other.name;
          }
        }
        missing.push({ name, site, reason: 'undeclared', suggestion, file: null });
      }
    } else if (stmt.kind === 'user') {
      const line = stmt.line.trim();
      const play = AUDIO_STATEMENT.exec(line);
      const voice = /^voice\s+([\s\S]+)$/.exec(line);
      const channel = play?.[2] ?? (voice ? 'voice' : null);
      const rest = play?.[3] ?? voice?.[1];
      if (channel === null || rest === undefined) return;
      const expr = rest.split(AUDIO_OPTION)[0]?.trim() ?? '';
      const files: (string | null)[] = [];
      const literal = stringLiteralValue(expr);
      if (literal !== null) files.push(literal);
      else if (/^\[[\s\S]*\]$/.test(expr)) {
        for (const t of tokenize(expr)) if (t.type === 'string') files.push(t.value);
      } else if (/^[A-Za-z_][\w.]*$/.test(expr)) {
        const name = expr.replace(/^audio\./, '');
        files.push(audioDefines.get(name) ?? autoAudio.get(name) ?? null);
      } else files.push(null);
      for (const file of files)
        audioPlays.push({ loc: stmt.loc, label, code: line, channel, file });
    } else if (stmt.kind === 'python') {
      const site = { loc: stmt.loc, label, code: `$ ${stmt.code.trim()}` };
      for (const path of callStrings(stmt.code, new Set(['renpy.movie_cutscene', 'Movie'])))
        videoUse(path, site);
      for (const path of callStrings(stmt.code, new Set(['renpy.music.play', 'renpy.sound.play'])))
        audioPlays.push({ ...site, channel: 'python', file: path });
    } else if (stmt.kind === 'define' || stmt.kind === 'default') {
      const site = { loc: stmt.loc, label, code: `${stmt.kind} ${stmt.name} = ${stmt.value}` };
      for (const path of callStrings(stmt.value, new Set(['Movie']))) videoUse(path, site);
    }
  });

  const audioFiles = entries.filter((e) => e.kind === 'audio');
  const playsByFile = new Map<string, AudioPlay[]>();
  const audioMissing: AudioPlay[] = [];
  for (const play of audioPlays) {
    if (play.file === null) continue;
    const entry = resolve(play.file, ['', 'audio/']);
    if (!entry) audioMissing.push(play);
    else playsByFile.set(entry.gamePath, [...(playsByFile.get(entry.gamePath) ?? []), play]);
  }
  const audio = audioFiles.map((e) => ({
    file: fileOf(e),
    plays: playsByFile.get(e.gamePath) ?? [],
  }));
  const video = entries
    .filter((e) => e.kind === 'video')
    .map((e) => ({ file: fileOf(e), uses: videoUses.get(e.gamePath) ?? [] }));
  const imageList = [...images.values()].sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  return {
    images: {
      entries: imageList,
      missing,
      dynamic,
      totals: {
        declared: imageList.length,
        statement: imageList.filter((i) => i.declaration === 'statement').length,
        automatic: imageList.filter((i) => i.declaration === 'automatic').length,
        displayed: imageList.filter((i) => i.displays.length > 0).length,
        neverDisplayed: imageList.filter((i) => i.displays.length === 0).length,
        missing: missing.length,
      },
    },
    audio: {
      files: audio,
      missing: audioMissing,
      totals: {
        files: audio.length,
        played: audio.filter((a) => a.plays.length > 0).length,
        neverPlayed: audio.filter((a) => a.plays.length === 0).length,
        missing: audioMissing.length,
      },
    },
    video: {
      files: video,
      missing: videoMissing,
      totals: {
        files: video.length,
        used: video.filter((v) => v.uses.length > 0).length,
        missing: videoMissing.length,
      },
    },
  };
}

export const assetsAnalysis: Analysis<AssetsResult> = { id: 'assets', run: assets };
