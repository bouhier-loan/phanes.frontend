import { useEffect, useRef, useState } from 'react';
import { workerQueries } from '../worker/client';

/**
 * An object URL for a game file, created on demand from the worker's lazy
 * Blob and revoked when the component unmounts. Null while loading or when
 * the file cannot be opened. `archive` picks between two entries of the same
 * path (see openAsset).
 */
export function useAssetUrl(
  path: string | null,
  enabled = true,
  archive?: string | null,
): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path || !enabled) return;
    let created: string | null = null;
    let active = true;
    void workerQueries.openAsset(path, archive).then((blob) => {
      if (!active || !blob) return;
      created = URL.createObjectURL(blob);
      setUrl(created);
    });
    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
      setUrl(null);
    };
  }, [path, enabled, archive]);
  return url;
}

/**
 * Object URLs for several game files, kept until the component unmounts:
 * going back to a file already seen shows it at once, without flicker.
 */
export function useAssetUrls(paths: readonly string[]): ReadonlyMap<string, string> {
  const [urls, setUrls] = useState<ReadonlyMap<string, string>>(() => new Map());
  const owned = useRef(new Map<string, string>());
  const pending = useRef(new Set<string>());
  const mounted = useRef(false);
  const key = [...new Set(paths)].sort().join('\n');

  useEffect(() => {
    mounted.current = true;
    const map = owned.current;
    const waiting = pending.current;
    return () => {
      mounted.current = false;
      for (const url of map.values()) URL.revokeObjectURL(url);
      map.clear();
      waiting.clear();
    };
  }, []);

  useEffect(() => {
    for (const path of key.split('\n')) {
      if (path === '' || owned.current.has(path) || pending.current.has(path)) continue;
      pending.current.add(path);
      void workerQueries.openAsset(path).then((blob) => {
        pending.current.delete(path);
        if (!blob || !mounted.current || owned.current.has(path)) return;
        owned.current.set(path, URL.createObjectURL(blob));
        setUrls(new Map(owned.current));
      });
    }
  }, [key]);
  return urls;
}
