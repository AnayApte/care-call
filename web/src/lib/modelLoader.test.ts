import { test } from "node:test";
import assert from "node:assert/strict";
import { createMonotonicClock, fetchCached, loadOnce } from "./modelLoader.ts";

test("loadOnce runs the loader once and shares the result", async () => {
  let calls = 0;
  const load = loadOnce(async () => { calls += 1; return "model"; });
  const [a, b] = await Promise.all([load(), load()]);
  assert.equal(a, "model");
  assert.equal(b, "model");
  assert.equal(await load(), "model");
  assert.equal(calls, 1);
});

test("loadOnce retries after a failure", async () => {
  let calls = 0;
  const load = loadOnce(async () => { calls += 1; if (calls === 1) throw new Error("offline"); return "model"; });
  await assert.rejects(load(), /offline/);
  assert.equal(await load(), "model");
  assert.equal(calls, 2);
});

test("monotonic clock never repeats or goes back", () => {
  const clock = createMonotonicClock();
  assert.equal(clock(100), 100);
  assert.equal(clock(100), 101);
  assert.equal(clock(50), 102);
  assert.equal(clock(500), 500);
});

/** In-memory stand-in for the browser Cache API. */
function fakeCaches() {
  const store = new Map<string, Response>();
  return {
    store,
    open: async () => ({
      match: async (url: string) => store.get(url)?.clone(),
      put: async (url: string, res: Response) => { store.set(url, res); },
    }),
  };
}

test("fetchCached downloads once, then serves from the cache", async () => {
  const caches = fakeCaches();
  let downloads = 0;
  const fetcher = async () => { downloads += 1; return new Response(new Uint8Array([1, 2, 3])); };
  assert.deepEqual([...await fetchCached("https://x/model.task", "m", fetcher, caches)], [1, 2, 3]);
  assert.deepEqual([...await fetchCached("https://x/model.task", "m", fetcher, caches)], [1, 2, 3]);
  assert.equal(downloads, 1);
});

test("fetchCached does not cache a failed download", async () => {
  const caches = fakeCaches();
  const fetcher = async () => new Response("nope", { status: 503 });
  await assert.rejects(fetchCached("https://x/model.task", "m", fetcher, caches), /503/);
  assert.equal(caches.store.size, 0);
});

test("fetchCached still works without the Cache API", async () => {
  const fetcher = async () => new Response(new Uint8Array([7]));
  assert.deepEqual([...await fetchCached("https://x/model.task", "m", fetcher, undefined)], [7]);
});
