import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { startMockCmr, type MockCmr } from '../helpers/mock-cmr-server';
import { serverCommand, serverEnv, spawnServer, stopServer, waitForExit } from '../helpers/server-process';

const EXPECTED_TOOL_COUNT = 23;
let cmr: MockCmr;
// Run from an empty directory so a developer's .env (and the checkout) is never picked up.
const isolatedCwd = mkdtempSync(join(tmpdir(), 'nasa-mcp-cwd-'));

before(async () => {
  cmr = await startMockCmr();
});
after(async () => {
  await cmr.close();
  rmSync(isolatedCwd, { recursive: true, force: true });
});

async function exerciseClient(client: Client) {
  const tools = await client.listTools();
  assert.equal(tools.tools.length, EXPECTED_TOOL_COUNT);
  const cmrTool = tools.tools.find((t) => t.name === 'nasa_cmr');
  assert.ok(cmrTool?.outputSchema, 'nasa_cmr advertises an outputSchema');

  // The SDK client validates structuredContent against outputSchema here.
  const first = await client.callTool({ name: 'nasa_cmr', arguments: { keyword: 'transport', limit: 2 } });
  assert.equal(first.isError, undefined);
  const envelope = first.structuredContent as { status: string; returned_count: number; total_hits: number; next_cursor: string | null; results: Array<{ title: string }> };
  assert.equal(envelope.status, 'success');
  assert.equal(envelope.returned_count, 2);
  assert.equal(envelope.total_hits, 3);
  assert.ok(envelope.next_cursor);

  const second = await client.callTool({ name: 'nasa_cmr', arguments: { cursor: envelope.next_cursor } });
  const page2 = second.structuredContent as { results: Array<{ title: string }>; next_cursor: string | null };
  assert.deepEqual(page2.results.map((r) => r.title), ['transport #2']);
  assert.equal(page2.next_cursor, null);

  const failing = await client.callTool({ name: 'nasa_cmr', arguments: { keyword: 'fail' } });
  assert.equal(failing.isError, true);
  assert.equal((failing.structuredContent as { status: string }).status, 'error');

  const invalid = await client.callTool({ name: 'nasa_cmr', arguments: { search_type: 'granules' } });
  assert.equal(invalid.isError, true);

  await assert.rejects(client.callTool({ name: 'nasa_unknown', arguments: {} }), /Unknown tool/);

  const noKey = await client.callTool({ name: 'nasa_apod', arguments: {} });
  assert.equal(noKey.isError, true);
  assert.match(JSON.stringify(noKey.content), /NASA_API_KEY is not set/);
}

describe('stdio transport', () => {
  it('initialize -> tools/list -> tools/call -> resources -> shutdown through the real CLI', async () => {
    const { command, args } = serverCommand();
    const transport = new StdioClientTransport({
      command,
      args,
      env: serverEnv({ NASA_MCP_CMR_URL: cmr.url }) as Record<string, string>,
      cwd: isolatedCwd,
      stderr: 'pipe'
    });
    let stderr = '';
    transport.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const protocolErrors: Error[] = [];
    const client = new Client({ name: 'stdio-test', version: '1.0.0' });
    client.onerror = (error) => protocolErrors.push(error);
    await client.connect(transport);
    await exerciseClient(client);

    const { resources } = await client.listResources();
    assert.ok(resources.length >= 2, 'stdio sessions retain results as resources');
    const read = await client.readResource({ uri: resources[0].uri });
    assert.ok((read.contents[0] as { text: string }).text.includes('retrieved_at'));

    await client.close();
    assert.deepEqual(protocolErrors, [], 'stdout carried only valid MCP messages');
    assert.doesNotMatch(stderr, /api_key=(?!\[REDACTED\])/);
  });

  it('writes nothing but JSON-RPC to stdout and exits cleanly when stdin closes', async () => {
    const child = spawnServer({ NASA_MCP_CMR_URL: cmr.url }, isolatedCwd);
    let stdout = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    const send = (message: unknown) => child.stdin.write(`${JSON.stringify(message)}\n`);
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'raw', version: '1' } } });
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'nasa_cmr', arguments: { keyword: 'raw' } } });
    send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'nasa_cmr', arguments: { keyword: 'fail' } } });
    // Responses can complete out of order, so wait for all four before closing stdin.
    const deadline = Date.now() + 15_000;
    while (![1, 2, 3, 4].every((id) => stdout.includes(`"id":${id}`)) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
    child.stdin.end();
    const code = await waitForExit(child, 10_000);
    assert.equal(code, 0);
    const lines = stdout.split('\n').filter((line) => line.trim() !== '');
    assert.ok(lines.length >= 4);
    for (const line of lines) {
      const message = JSON.parse(line) as { jsonrpc: string };
      assert.equal(message.jsonrpc, '2.0');
    }
    // JSON-RPC responses may complete out of order; each request gets exactly one.
    const ids = lines.map((line) => (JSON.parse(line) as { id?: number }).id).filter((id) => id !== undefined);
    assert.deepEqual([...ids].sort(), [1, 2, 3, 4]);
  });
});

describe('Streamable HTTP transport', () => {
  let child: ReturnType<typeof spawnServer>;
  let endpoint: URL;

  before(async () => {
    child = spawnServer({ MCP_TRANSPORT: 'http', MCP_HTTP_PORT: '0', NASA_MCP_CMR_URL: cmr.url }, isolatedCwd);
    let stderr = '';
    endpoint = await new Promise<URL>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`HTTP server did not start: ${stderr}`)), 15_000);
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
        const match = /listening on (http:\/\/\S+)/.exec(stderr);
        if (match) {
          clearTimeout(timer);
          resolve(new URL(match[1]));
        }
      });
      child.once('exit', (code) => reject(new Error(`server exited early (${code}): ${stderr}`)));
    });
    assert.equal(child.stdout.read(), null, 'HTTP mode prints nothing to stdout');
  });

  after(async () => {
    stopServer(child);
    const code = await waitForExit(child, 10_000);
    if (process.platform !== 'win32') assert.equal(code, 0, 'SIGTERM shuts the HTTP server down cleanly');
  });

  it('initialize -> tools/list -> tools/call over HTTP', async () => {
    const client = new Client({ name: 'http-test', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(endpoint));
    await exerciseClient(client);
    assert.deepEqual((await client.listResources()).resources, [], 'no state survives between stateless HTTP requests');
    await client.close();
  });

  it('keeps concurrent requests isolated', async () => {
    const keywords = Array.from({ length: 8 }, (_, i) => `client-${i}`);
    const results = await Promise.all(
      keywords.map(async (keyword) => {
        const client = new Client({ name: keyword, version: '1.0.0' });
        await client.connect(new StreamableHTTPClientTransport(endpoint));
        const result = await client.callTool({ name: 'nasa_cmr', arguments: { keyword, limit: 3 } });
        await client.close();
        return { keyword, titles: (result.structuredContent as { results: Array<{ title: string }> }).results.map((r) => r.title) };
      })
    );
    for (const { keyword, titles } of results) {
      assert.deepEqual(titles, [0, 1, 2].map((i) => `${keyword} #${i}`));
    }
  });

  it('rejects GET and DELETE on the endpoint', async () => {
    for (const method of ['GET', 'DELETE']) {
      const response = await fetch(endpoint, { method });
      assert.equal(response.status, 405);
      assert.equal(response.headers.get('allow'), 'POST');
    }
  });
});
