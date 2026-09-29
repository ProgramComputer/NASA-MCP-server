import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { feed, jsonCollection } from './cmr-fixtures';

export interface MockCmr {
  url: string;
  requests: URL[];
  close(): Promise<void>;
}

/**
 * Local stand-in for cmr.earthdata.nasa.gov used by transport tests. Echoes
 * the keyword into titles (to detect cross-talk between concurrent requests)
 * and implements Search After over 3 records.
 */
export async function startMockCmr(): Promise<MockCmr> {
  const requests: URL[] = [];
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    requests.push(url);
    if (url.pathname !== '/search/collections.json') {
      res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ errors: [`unsupported path ${url.pathname}`] }));
      return;
    }
    const keyword = url.searchParams.get('keyword') ?? 'none';
    if (keyword === 'fail') {
      res.writeHead(500, { 'content-type': 'text/html' }).end('<html><title>Upstream down</title></html>');
      return;
    }
    const pageSize = Number(url.searchParams.get('page_size') ?? '10');
    const after = req.headers['cmr-search-after'];
    const start = typeof after === 'string' ? (JSON.parse(after) as [number])[0] : 0;
    const all = [0, 1, 2].map((i) => jsonCollection(i, { title: `${keyword} #${i}` }));
    const page = all.slice(start, start + pageSize);
    const headers: Record<string, string> = { 'content-type': 'application/json', 'cmr-hits': String(all.length), 'cmr-request-id': `mock-${requests.length}` };
    if (page.length) headers['cmr-search-after'] = JSON.stringify([start + page.length]);
    setTimeout(() => res.writeHead(200, headers).end(JSON.stringify(feed(page))), Math.floor(Math.random() * 25));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/search`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  };
}
