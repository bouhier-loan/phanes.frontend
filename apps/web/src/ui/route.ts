import { useSyncExternalStore } from 'react';

/** Report sections, in navigation order; also the URL fragment of each page. */
export const SECTIONS = [
  'vue-ensemble',
  'inventaire',
  'personnages',
  'labels',
  'diagnostics',
  'graphe',
  'choix',
  'variables',
  'lecteur',
  'ressources',
  'traductions',
  'export',
] as const;
export type Section = (typeof SECTIONS)[number];

export interface Route {
  readonly section: Section;
  /** Optional parameter: a label for the reader, a media type for resources… */
  readonly param: string | null;
}

const DEFAULT: Route = { section: 'vue-ensemble', param: null };

/** Parses `#/<section>[/<param>]`; anything else is the overview. */
export function parseRoute(hash: string): Route {
  const m = /^#\/([a-z-]+)(?:\/(.*))?$/.exec(hash);
  const section = SECTIONS.find((s) => s === m?.[1]);
  if (!section) return DEFAULT;
  let param: string | null;
  try {
    param = m?.[2] ? decodeURIComponent(m[2]) : null;
  } catch {
    param = null;
  }
  return { section, param };
}

export function href(section: Section, param?: string | null): string {
  return `#/${section}${param ? `/${encodeURIComponent(param)}` : ''}`;
}

function subscribe(callback: () => void): () => void {
  window.addEventListener('hashchange', callback);
  return () => {
    window.removeEventListener('hashchange', callback);
  };
}

/** The current route; changing `location.hash` makes no request. */
export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return parseRoute(hash);
}

export function navigate(section: Section, param?: string | null): void {
  window.location.hash = href(section, param);
}
