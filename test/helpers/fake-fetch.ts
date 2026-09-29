import type { FetchLike } from '../../src/util/http';

export interface RecordedRequest {
  url: URL;
  method: string;
  headers: Headers;
  body: unknown;
}

export type Responder = (request: RecordedRequest) => Response | Promise<Response>;

export interface FakeFetch {
  fetch: FetchLike;
  calls: RecordedRequest[];
}

/**
 * Deterministic stand-in for global fetch. Routes are matched in order by
 * host + path prefix; unmatched requests fail loudly so tests never reach
 * the network by accident.
 */
export function fakeFetch(routes: Array<[match: string | RegExp | ((url: URL) => boolean), respond: Responder]>): FakeFetch {
  const calls: RecordedRequest[] = [];
  const fetch: FetchLike = async (input, init) => {
    const url = new URL(String(input));
    const request: RecordedRequest = {
      url,
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers as ConstructorParameters<typeof Headers>[0]),
      body: init?.body
    };
    calls.push(request);
    if (init?.signal?.aborted) throw init.signal.reason;
    for (const [match, respond] of routes) {
      const target = `${url.host}${url.pathname}`;
      const hit = typeof match === 'string' ? target.startsWith(match) : match instanceof RegExp ? match.test(target) : match(url);
      if (hit) return respond(request);
    }
    throw new Error(`fakeFetch: no route for ${url.toString()}`);
  };
  return { fetch, calls };
}

export function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...init.headers }
  });
}

export function textResponse(body: string, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(body, { status: init.status ?? 200, headers: { 'content-type': 'text/plain', ...init.headers } });
}

/**
 * A fetch that never answers until its AbortSignal fires (for timeout tests).
 * AbortSignal.timeout() uses an unref'd timer, so a ref'd keep-alive stands in
 * for the open stdio/HTTP handles that keep a real server's event loop alive.
 */
export const hangingFetch: FetchLike = (_input, init) =>
  new Promise((_resolve, reject) => {
    const signal = init?.signal;
    if (!signal) return;
    const keepAlive = setTimeout(() => undefined, 60_000);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(keepAlive);
        reject(signal.reason);
      },
      { once: true }
    );
  });
