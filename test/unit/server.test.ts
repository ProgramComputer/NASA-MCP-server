import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CallToolResultSchema, ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { createNasaMcpServer } from '../../src/server';
import { SERVER_VERSION } from '../../src/version';
import { FIXED_NOW, TEST_FIRMS_KEY, TEST_NASA_KEY, testConfig } from '../helpers/context';
import { feed, jsonCollection } from '../helpers/cmr-fixtures';
import { fakeFetch, jsonResponse, type FakeFetch } from '../helpers/fake-fetch';

function cmrAndApod(): FakeFetch {
  return fakeFetch([
    [
      'cmr.earthdata.nasa.gov',
      (request) => {
        const keyword = request.url.searchParams.get('keyword') ?? 'none';
        return jsonResponse(feed([jsonCollection(1, { title: `result for ${keyword}` })]), { headers: { 'cmr-hits': '1' } });
      }
    ],
    ['science.nasa.gov/wp-json/wp/v2/apod-basic/', (request) => jsonResponse({ date: `20${request.url.pathname.slice(-6, -4)}-${request.url.pathname.slice(-4, -2)}-${request.url.pathname.slice(-2)}`, title: 'Real APOD', media_type: 'other', basic_html: '<html></html>' })],
    ['ssd-api.jpl.nasa.gov/sbdb.api', () => jsonResponse({ object: { fullname: '1 Ceres (A801 AA)' } })]
  ]);
}

async function connect(fake: FakeFetch = cmrAndApod(), resourceLimits?: { maxEntries: number; maxEntryBytes: number; maxTotalBytes: number }) {
  const nasa = createNasaMcpServer({ config: testConfig(), fetch: fake.fetch, now: () => FIXED_NOW, resourceLimits, logError: () => undefined });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await Promise.all([nasa.server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, nasa, fake };
}

describe('MCP server', () => {
  it('reports the package version and exposes no sample resources at startup', async () => {
    const { client } = await connect();
    assert.equal(client.getServerVersion()?.version, SERVER_VERSION);
    const { resources } = await client.listResources();
    assert.deepEqual(resources, []);
    const { resourceTemplates } = await client.listResourceTemplates();
    assert.deepEqual(resourceTemplates.map((t) => t.name), ['nasa-apod', 'nasa-epic', 'jpl-sbdb']);
    await client.close();
  });

  it('rejects unknown tools with a JSON-RPC InvalidParams error', async () => {
    const { client } = await connect();
    await assert.rejects(client.callTool({ name: 'nasa_does_not_exist', arguments: {} }), (error: unknown) => {
      assert.ok(error instanceof McpError);
      assert.equal(error.code, ErrorCode.InvalidParams);
      assert.match(error.message, /Unknown tool: nasa_does_not_exist/);
      return true;
    });
    await client.close();
  });

  it('validates structured CMR output against the advertised outputSchema through the SDK client', async () => {
    const { client } = await connect();
    await client.listTools();
    const result = await client.callTool({ name: 'nasa_cmr', arguments: { keyword: 'sst' } });
    assert.equal(result.isError, undefined);
    assert.equal((result.structuredContent as { status: string }).status, 'success');
    const alias = await client.callTool({ name: 'nasa/cmr', arguments: { keyword: 'sst' } });
    assert.equal((alias.structuredContent as { status: string }).status, 'success');
    await client.close();
  });

  it('routes legacy per-tool methods and tools/manifest through the validated registry', async () => {
    const { client } = await connect();
    const legacy = await client.request({ method: 'nasa/cmr', params: { keyword: 'sst', limit: 1 } } as never, CallToolResultSchema);
    assert.equal((legacy.structuredContent as { returned_count: number }).returned_count, 1);
    const invalid = await client.request({ method: 'nasa/cmr', params: { limit: 'ten' } } as never, CallToolResultSchema);
    assert.equal(invalid.isError, true);
    const manifest = await client.request({ method: 'tools/manifest', params: {} } as never, z.object({ apis: z.array(z.object({ name: z.string(), id: z.string() })) }));
    assert.equal(manifest.apis.length, 32);
    assert.ok(manifest.apis.some((api) => api.name === 'nasa_mars_rover' && api.id === 'nasa/mars_rover'));
    await client.close();
  });

  it('serves prompts and executes them through the tool path', async () => {
    const { client, fake } = await connect();
    const { prompts } = await client.listPrompts();
    assert.ok(prompts.some((p) => p.name === 'jpl_query-small-body-database'));
    const prompt = await client.getPrompt({ name: 'jpl/query-small-body-database', arguments: { object_name: 'Ceres' } });
    assert.match((prompt.messages[0].content as { text: string }).text, /jpl_sbdb.*"sstr":"Ceres"/);
    const executed = await client.request({ method: 'prompts/execute', params: { name: 'jpl/query-small-body-database', arguments: { object_name: 'Ceres' } } } as never, CallToolResultSchema);
    assert.equal(executed.isError, undefined);
    assert.equal(fake.calls.at(-1)!.url.searchParams.get('sstr'), 'Ceres');
    await assert.rejects(client.getPrompt({ name: 'nasa/browse-near-earth-objects', arguments: {} }), /Missing required prompt arguments/);
    await client.close();
  });

  it('reads resource templates from real upstream data, never fabricated records', async () => {
    const { client, fake } = await connect();
    const read = await client.readResource({ uri: 'nasa://apod/image?date=2024-01-01' });
    const body = JSON.parse((read.contents[0] as { text: string }).text) as { source: { url: string; retrieved_at: string }; data: { title: string } };
    const data = body.data as { title: string; date: string; basic_html?: string };
    assert.equal(data.title, 'Real APOD');
    assert.equal(data.date, '2024-01-01');
    assert.equal('basic_html' in data, false, 'the full HTML page is not retained');
    assert.equal(body.source.retrieved_at, FIXED_NOW.toISOString());
    assert.equal(body.source.url, 'https://science.nasa.gov/wp-json/wp/v2/apod-basic/240101');
    assert.equal(fake.calls.at(-1)!.url.pathname, '/wp-json/wp/v2/apod-basic/240101');
    await assert.rejects(client.readResource({ uri: 'nasa://apod/image?date=not-a-date' }), /Invalid resource URI/);
    await assert.rejects(client.readResource({ uri: 'nasa://apod/image?date=2024-01-01&evil=1' }), /unsupported query parameter/);
    await assert.rejects(client.readResource({ uri: 'nasa://mars-rover/photo?rover=curiosity&id=1' }), (error: unknown) => error instanceof McpError && error.code === -32002);
    await client.close();
  });

  it('stores tool results as resources keyed by the full query, bounded, and without secrets', async () => {
    const { client } = await connect(undefined, { maxEntries: 2, maxEntryBytes: 1_000_000, maxTotalBytes: 10_000_000 });
    await client.callTool({ name: 'nasa_cmr', arguments: { keyword: 'a' } });
    await client.callTool({ name: 'nasa_cmr', arguments: { keyword: 'a', limit: 5 } });
    let { resources } = await client.listResources();
    assert.equal(resources.length, 2, 'different arguments never overwrite each other');
    await client.callTool({ name: 'nasa_cmr', arguments: { keyword: 'a' } });
    ({ resources } = await client.listResources());
    assert.equal(resources.length, 2, 'repeating a query replaces its own entry');
    await client.callTool({ name: 'nasa_cmr', arguments: { keyword: 'b' } });
    ({ resources } = await client.listResources());
    assert.equal(resources.length, 2, 'the store is bounded');
    for (const resource of resources) {
      assert.match(resource.uri, /^nasa-mcp:\/\/results\/nasa_cmr\/[0-9a-f]{32}$/);
      const read = await client.readResource({ uri: resource.uri });
      const text = (read.contents[0] as { text: string }).text;
      assert.doesNotMatch(text + JSON.stringify(resource), new RegExp(`${TEST_NASA_KEY}|${TEST_FIRMS_KEY}`));
      assert.ok(JSON.parse(text).retrieved_at);
    }
    await client.close();
  });

  it('keeps resources isolated between server instances (as used per HTTP request)', async () => {
    const a = await connect();
    const b = await connect();
    await a.client.callTool({ name: 'nasa_cmr', arguments: { keyword: 'only-in-a' } });
    assert.equal((await a.client.listResources()).resources.length, 1);
    assert.equal((await b.client.listResources()).resources.length, 0);
    await a.client.close();
    await b.client.close();
  });
});
