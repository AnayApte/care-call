/** Helpers that keep the hand model loaded once per page and on disk between visits. No MediaPipe import, so they test in node. */

/** Runs `load` once and shares the result. A failure is forgotten so the next call retries. */
export function loadOnce<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () => {
    pending ??= load().catch((err: unknown) => { pending = null; throw err; });
    return pending;
  };
}

/** MediaPipe VIDEO mode rejects a timestamp that is not larger than the last one. A shared detector needs one clock across camera restarts. */
export function createMonotonicClock(): (now: number) => number {
  let last = -Infinity;
  return (now) => (last = Math.max(now, last + 1));
}

type ModelCache = { match(url: string): Promise<Response | undefined>; put(url: string, res: Response): Promise<void> };
type ModelCacheStorage = { open(name: string): Promise<ModelCache> };

/**
 * Fetches `url` through the Cache API. The model CDN only allows a one-hour browser cache, so without this every
 * visit after an hour downloads ~8 MB again. Model URLs are versioned, so a cached copy never goes stale.
 */
export async function fetchCached(
  url: string,
  cacheName: string,
  fetcher: (url: string) => Promise<Response> = fetch,
  cacheStorage: ModelCacheStorage | undefined = globalThis.caches,
): Promise<Uint8Array> {
  const cache = await cacheStorage?.open(cacheName).catch(() => undefined);
  const hit = await cache?.match(url).catch(() => undefined);
  if (hit) return new Uint8Array(await hit.arrayBuffer());
  const res = await fetcher(url);
  if (!res.ok) throw new Error(`Hand model download failed (${res.status})`);
  await cache?.put(url, res.clone()).catch(() => undefined);
  return new Uint8Array(await res.arrayBuffer());
}
