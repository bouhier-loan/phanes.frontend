import { useEffect, useState } from 'react';
import { workerQueries } from '../worker/client';

/**
 * An object URL for a game file, created on demand from the worker's lazy
 * Blob and revoked when the component unmounts. Null while loading or when
 * the file cannot be opened.
 */
export function useAssetUrl(path: string | null, enabled = true): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path || !enabled) return;
    let created: string | null = null;
    let active = true;
    void workerQueries.openAsset(path).then((blob) => {
      if (!active || !blob) return;
      created = URL.createObjectURL(blob);
      setUrl(created);
    });
    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
      setUrl(null);
    };
  }, [path, enabled]);
  return url;
}
