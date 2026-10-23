import { publicFetch } from "~/lib/public-network-fetch.server";
const USER_AGENT =
  "siliconharbour.dev/1.0 (Community Directory Import; +https://siliconharbour.dev)";

export class RateLimitedError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    readonly body: string,
  ) {
    super(
      `Rate limited by Luma (HTTP ${status}) on ${path}; will retry next sync${body ? `: ${body.slice(0, 200)}` : ""}`,
    );
    this.name = "RateLimitedError";
  }
}

interface Transport {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  random: () => number;
}

export function createLumaHttp(transport: Partial<Transport> = {}) {
  const {
    fetch: request = (...args) => publicFetch(...args),
    sleep = (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    now = Date.now,
    random = Math.random,
  } = transport;
  let queue: Promise<unknown> = Promise.resolve();
  let nextRequestAt = 0;

  function enqueue<T>(run: () => Promise<T>): Promise<T> {
    const result = queue.then(run);
    queue = result.catch(() => {});
    return result;
  }

  return function createSession() {
    let retrySpent = 0;
    let limited: RateLimitedError | undefined;
    return async function get(url: string, accept = "*/*"): Promise<string> {
      if (limited) throw limited;
      return enqueue(async () => {
        if (limited) throw limited;
        for (let attempt = 0; ; attempt++) {
          await sleep(Math.max(0, nextRequestAt - now()));
          let response: Response;
          let body: string;
          try {
            response = await request(url, {
              headers: { accept, "x-luma-client-type": "luma-web", "User-Agent": USER_AGENT },
              signal: AbortSignal.timeout(30_000),
            });
            body = await response.text();
          } catch (error) {
            nextRequestAt = now() + 1000 + random() * 500;
            if (attempt > 0 || retrySpent + 1000 > 90_000) throw error;
            retrySpent += 1000;
            await sleep(1000);
            continue;
          }
          nextRequestAt = now() + 1000 + random() * 500;
          if (response.ok) return body;
          const path = new URL(url).pathname;
          if (response.status === 429 || response.status === 503) {
            const error = new RateLimitedError(response.status, path, body.slice(0, 200));
            if (attempt >= 2) {
              limited = error;
              throw error;
            }
            const retryAfter = response.headers.get("retry-after");
            const parsedDelay =
              retryAfter === null
                ? NaN
                : /^\d+(\.\d+)?$/.test(retryAfter)
                  ? Number(retryAfter) * 1000
                  : Date.parse(retryAfter) - now();
            const delay = Number.isFinite(parsedDelay)
              ? Math.max(0, parsedDelay)
              : [5000, 15000][attempt] + random() * 500;
            if (retrySpent + delay > 90_000) {
              limited = error;
              throw error;
            }
            retrySpent += delay;
            await sleep(delay);
            continue;
          }
          if (response.status >= 500 && attempt === 0 && retrySpent + 1000 <= 90_000) {
            retrySpent += 1000;
            await sleep(1000);
            continue;
          }
          throw new Error(`Luma HTTP ${response.status} on ${path}: ${body.slice(0, 200)}`);
        }
      });
    };
  };
}

// Luma currently sends neither ETag nor Last-Modified; there are no validators to cache.
export const createLumaSession = createLumaHttp();
export type LumaGet = ReturnType<typeof createLumaSession>;
