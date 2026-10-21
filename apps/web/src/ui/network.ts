import { useSyncExternalStore } from 'react';

/**
 * Counts the page's network requests from `start()` on (blob: and data:
 * URLs stay in the page). Shown to the user instead of a hard-coded zero.
 */
let count = 0;
let observer: PerformanceObserver | null = null;
const listeners = new Set<() => void>();

function isNetwork(name: string): boolean {
  return !name.startsWith('blob:') && !name.startsWith('data:');
}

export function startNetworkWatch(): void {
  if (observer || typeof PerformanceObserver === 'undefined') return;
  const since = performance.now();
  observer = new PerformanceObserver((list) => {
    const added = list.getEntries().filter((e) => e.startTime >= since && isNetwork(e.name)).length;
    if (added === 0) return;
    count += added;
    for (const listener of listeners) listener();
  });
  try {
    observer.observe({ type: 'resource' });
  } catch {
    observer = null;
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useNetworkRequests(): number {
  return useSyncExternalStore(subscribe, () => count);
}
