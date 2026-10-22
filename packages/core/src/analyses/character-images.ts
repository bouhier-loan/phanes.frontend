import type { ImageAsset } from './assets';
import type { InventoryEntry } from './inventory';

/** Why an image tag is the character's: `image=`, its name or its variable. */
export type CharacterImageMatch = 'image' | 'name' | 'variable';

export type CharacterImageKey = { key: string; match: CharacterImageMatch };

export type CharacterImages = {
  /** Keys that matched at least one image or file. */
  matched: CharacterImageKey[];
  /** Declared images whose tag is one of the keys. */
  sprites: ImageAsset[];
  /** `side <key> …` images. */
  side: ImageAsset[];
  /** Image files named after a key (folder or file name prefix), not the file of a declared image. */
  files: InventoryEntry[];
  /** The image to show first: VFS path, and image name when declared. */
  portrait: { path: string; name: string | null } | null;
};

/** What a character definition says about its images. */
export type CharacterImageSource = {
  imageTag: string | null;
  name: string | null;
  dynamic: boolean;
  variable: string | null;
};

function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * Image tags that may be a character's, most reliable first (docs/analyses.md):
 * the `image=` tag, the name (lower case, without accents, spaces as `_` or
 * removed, first word of a longer name) and the variable (two characters or more).
 */
export function characterImageKeys(c: CharacterImageSource): CharacterImageKey[] {
  const out: CharacterImageKey[] = [];
  const add = (key: string, match: CharacterImageMatch) => {
    if (key !== '' && !/\s|\[|\{/.test(key) && !out.some((k) => k.key === key))
      out.push({ key, match });
  };
  if (c.imageTag) add(fold(c.imageTag), 'image');
  if (c.name && !c.dynamic) {
    const name = fold(c.name);
    const words = name.split(/\s+/).filter(Boolean);
    add(words.join('_'), 'name');
    add(words.join(''), 'name');
    if (words.length > 1 && (words[0]?.length ?? 0) >= 3) add(words[0] ?? '', 'name');
  }
  if (
    c.variable &&
    c.variable.length >= 2 &&
    c.variable !== 'narrator' &&
    !c.variable.includes('.')
  )
    add(fold(c.variable), 'variable');
  return out;
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** The images of a character, found by tag, side image tag and file path. */
export function characterImages(
  character: CharacterImageSource,
  images: readonly ImageAsset[],
  files: readonly InventoryEntry[],
): CharacterImages {
  const keys = characterImageKeys(character);
  const matched = new Set<string>();
  const keyOf = (tag: string) => {
    const k = fold(tag);
    const hit = keys.find((key) => key.key === k);
    if (hit) matched.add(hit.key);
    return hit;
  };
  const sprites = images.filter((i) => keyOf(i.tag) !== undefined);
  const side = images.filter((i) => i.tag === 'side' && keyOf(i.attributes[0] ?? '') !== undefined);

  const declared = new Set(images.flatMap((i) => (i.file ? [i.file.path] : [])));
  const matchesPath = (gamePath: string) => {
    const folded = fold(gamePath);
    const folders = folded.split('/').slice(0, -1);
    const file = basename(folded);
    return keys.find(
      (k) =>
        folders.includes(k.key) ||
        (file.startsWith(k.key) && /^[ _.-]/.test(file.slice(k.key.length))),
    );
  };
  const named = files
    .filter(
      (f) =>
        f.kind === 'image' &&
        f.zone === 'game' &&
        f.shadowedBy === null &&
        f.gamePath !== null &&
        !declared.has(f.path),
    )
    .flatMap((f) => {
      const key = matchesPath(f.gamePath ?? '');
      if (!key) return [];
      matched.add(key.key);
      return [f];
    })
    .sort((a, b) => ((a.gamePath ?? '') < (b.gamePath ?? '') ? -1 : 1));

  // The most displayed sprite, then the simplest name.
  const best = sprites
    .filter((i) => i.file !== null)
    .sort(
      (a, b) =>
        b.displays.length - a.displays.length ||
        a.attributes.length - b.attributes.length ||
        (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
    )[0];
  const sideImage = side.find((i) => i.file !== null);
  const portrait = best?.file
    ? { path: best.file.path, name: best.name }
    : sideImage?.file
      ? { path: sideImage.file.path, name: sideImage.name }
      : named[0]
        ? { path: named[0].path, name: null }
        : null;
  return {
    matched: keys.filter((k) => matched.has(k.key)),
    sprites,
    side,
    files: named,
    portrait,
  };
}
