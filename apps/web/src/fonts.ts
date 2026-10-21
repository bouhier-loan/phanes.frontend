import bricolage from '@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2?url';
import geist from '@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url';
import geistMono from '@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2?url';

/**
 * Self-hosted fonts (OFL-1.1, see NOTICE), registered and loaded at startup:
 * no unicode-range subset is fetched later, so an analysis never triggers a
 * font request. Glyphs outside the latin subset fall back to system fonts.
 */
const FACES: readonly (readonly [family: string, url: string])[] = [
  ['Bricolage Grotesque', bricolage],
  ['Geist', geist],
  ['Geist Mono', geistMono],
];

for (const [family, url] of FACES) {
  const face = new FontFace(family, `url(${url}) format('woff2')`, {
    weight: '100 900',
    style: 'normal',
    display: 'swap',
  });
  document.fonts.add(face);
  // A font that fails to load leaves the system fallback in place.
  face.load().catch(() => undefined);
}
