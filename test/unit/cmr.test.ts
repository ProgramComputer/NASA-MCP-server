import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cmrTool, planSearch } from '../../src/handlers/nasa/cmr';
import { decodeCursor, encodeCursor } from '../../src/handlers/nasa/cmr/cursor';
import { cmrInputSchema, cmrOutputSchema, type CmrEnvelope } from '../../src/handlers/nasa/cmr/schema';
import { executeTool, type CallToolResult } from '../../src/tools/execute';
import type { ToolDefinition } from '../../src/tools/types';
import { testContext, textOf } from '../helpers/context';
import { FACETS_V2, feed, jsonCollection, jsonGranule, ummCollection, ummGranule } from '../helpers/cmr-fixtures';
import { fakeFetch, jsonResponse, textResponse, type RecordedRequest } from '../helpers/fake-fetch';

const tool = cmrTool as unknown as ToolDefinition;

function envelope(result: CallToolResult): CmrEnvelope {
  assert.ok(result.structuredContent, 'expected structuredContent');
  return cmrOutputSchema.parse(result.structuredContent);
}

function cmrOk(body: unknown, headers: Record<string, string> = {}) {
  return () => jsonResponse(body, { headers: { 'cmr-hits': '42', 'cmr-request-id': 'req-1', 'cmr-took': '12', ...headers } });
}

/**
 * Minimal CMR emulator for Search After: 5 collections, pages driven by the
 * CMR-Search-After header, exactly as CMR behaves (empty final page, no header).
 */
function pagingCmr(total = 5) {
  const all = Array.from({ length: total }, (_, i) => jsonCollection(i));
  return fakeFetch([
    [
      'cmr.earthdata.nasa.gov/search/collections.json',
      (request: RecordedRequest) => {
        const pageSize = Number(request.url.searchParams.get('page_size'));
        const after = request.headers.get('cmr-search-after');
        const start = after ? (JSON.parse(after) as [number, string])[0] : 0;
        const page = all.slice(start, start + pageSize);
        const headers: Record<string, string> = { 'cmr-hits': String(total) };
        if (page.length) headers['cmr-search-after'] = JSON.stringify([start + page.length, `C-${start + page.length}`]);
        return jsonResponse(feed(page), { headers });
      }
    ]
  ]);
}

describe('nasa_cmr request construction', () => {
  it('applies deterministic defaults and never builds an undefined endpoint', async () => {
    const { fetch, calls } = fakeFetch([['cmr.earthdata.nasa.gov', cmrOk(feed([jsonCollection(1)]))]]);
    const result = await executeTool(tool, {}, testContext(fetch));
    assert.equal(result.isError, undefined);
    const url = calls[0].url;
    assert.equal(url.pathname, '/search/collections.json');
    assert.equal(url.searchParams.get('page_size'), '10');
    assert.equal(url.searchParams.has('page_num'), false);
    assert.doesNotMatch(url.toString(), /undefined/);
    assert.match(calls[0].headers.get('client-id') ?? '', /^nasa-mcp-server\//);
  });

  it('translates bbox to bounding_box and maps every filter family', async () => {
    const { fetch, calls } = fakeFetch([['cmr.earthdata.nasa.gov', cmrOk(feed([]))]]);
    await executeTool(
      tool,
      {
        keyword: 'sea surface temperature',
        bbox: '-10,-5.5,10,5',
        temporal: '2020-01-01T00:00:00Z,2020-02-01',
        platform: ['Aqua', 'Terra'],
        instrument: 'MODIS',
        project: 'GHRSST',
        processing_level_id: '4',
        granule_data_format: 'netCDF-4',
        provider: 'POCLOUD',
        downloadable: true,
        browsable: false,
        has_granules: true,
        cloud_hosted: true,
        include_facets: true,
        sort_key: '-start_date',
        limit: 25
      },
      testContext(fetch)
    );
    const params = calls[0].url.searchParams;
    assert.equal(params.get('bounding_box'), '-10,-5.5,10,5');
    assert.equal(params.has('bbox'), false);
    assert.equal(params.get('keyword'), 'sea surface temperature');
    assert.equal(params.get('temporal'), '2020-01-01T00:00:00Z,2020-02-01');
    assert.deepEqual(params.getAll('platform[]'), ['Aqua', 'Terra']);
    assert.equal(params.get('instrument'), 'MODIS');
    assert.equal(params.get('project'), 'GHRSST');
    assert.equal(params.get('processing_level_id'), '4');
    assert.equal(params.get('granule_data_format'), 'netCDF-4');
    assert.equal(params.get('downloadable'), 'true');
    assert.equal(params.get('browsable'), 'false');
    assert.equal(params.get('has_granules'), 'true');
    assert.equal(params.get('cloud_hosted'), 'true');
    assert.equal(params.get('include_facets'), 'v2');
    assert.equal(params.get('sort_key'), '-start_date');
    assert.equal(params.get('page_size'), '25');
  });

  it('supports granule searches by collection_concept_id and granule-only filters', async () => {
    const { fetch, calls } = fakeFetch([['cmr.earthdata.nasa.gov', cmrOk(feed([jsonGranule(1)]))]]);
    const result = await executeTool(
      tool,
      { search_type: 'granules', collection_concept_id: 'C1996881146-POCLOUD', cloud_cover: '0,50', day_night_flag: 'day', readable_granule_name: '*2020*', point: '10,20', online_only: true },
      testContext(fetch)
    );
    assert.equal(result.isError, undefined, textOf(result));
    const params = calls[0].url.searchParams;
    assert.equal(calls[0].url.pathname, '/search/granules.json');
    assert.equal(params.get('collection_concept_id'), 'C1996881146-POCLOUD');
    assert.equal(params.get('cloud_cover'), '0,50');
    assert.equal(params.get('day_night_flag'), 'DAY');
    assert.equal(params.get('point'), '10,20');
    assert.equal(params.get('online_only'), 'true');
  });

  it('preserves concept_id for granule searches (collection concept IDs select the collection)', async () => {
    const { fetch, calls } = fakeFetch([['cmr.earthdata.nasa.gov', cmrOk(feed([jsonGranule(1)]))]]);
    const result = await executeTool(tool, { search_type: 'granules', concept_id: 'C1996881146-POCLOUD' }, testContext(fetch));
    assert.equal(result.isError, undefined, textOf(result));
    assert.equal(calls[0].url.searchParams.get('concept_id'), 'C1996881146-POCLOUD');
  });

  it('keeps antimeridian-crossing bounding boxes unchanged', async () => {
    const { fetch, calls } = fakeFetch([['cmr.earthdata.nasa.gov', cmrOk(feed([]))]]);
    await executeTool(tool, { bounding_box: [170, -10, -170, 10] }, testContext(fetch));
    assert.equal(calls[0].url.searchParams.get('bounding_box'), '170,-10,-170,10');
  });
});

describe('nasa_cmr validation', () => {
  const invalid: Array<[string, Record<string, unknown>, RegExp]> = [
    ['keyword on granules', { search_type: 'granules', collection_concept_id: 'C1-P', keyword: 'x' }, /keyword applies only to collection/],
    ['granules without collection constraint', { search_type: 'granules', temporal: '2020-01-01,' }, /must identify collections/],
    ['collection_concept_id on collections', { collection_concept_id: 'C1-P' }, /apply only to granule|applies only to granule/],
    ['conflicting bbox aliases', { bbox: '0,0,1,1', bounding_box: '0,0,2,2' }, /bbox and bounding_box are aliases/],
    ['bad bbox order', { bounding_box: '0,10,1,5' }, /south must not be greater than north/],
    ['bad temporal', { temporal: 'yesterday,today' }, /not an ISO 8601/],
    ['reversed temporal', { temporal: '2021-01-01,2020-01-01' }, /start must not be after end/],
    ['open polygon', { polygon: '0,0,1,0,1,1,0,1' }, /must be closed/],
    ['bad circle radius', { circle: '0,0,5' }, /radius must be between 10 and 6000000/],
    ['invalid sort key for collections', { sort_key: 'cloud_cover' }, /sort_key cloud_cover is not valid for collections/],
    ['stac on collections', { format: 'stac' }, /only available for granule/],
    ['compact on xml', { format: 'echo10', response_mode: 'compact' }, /compact needs format json or umm_json/],
    ['fields in raw mode', { response_mode: 'raw', fields: ['title'] }, /fields only applies to response_mode compact/],
    ['granule field on collections', { fields: ['cloud_cover'] }, /not available for collections/],
    ['limit above application cap', { limit: 101 }, /limit/],
    ['page and offset', { page: 2, offset: 10 }, /page and offset cannot be combined/],
    ['deep paging', { page: 20000, limit: 100 }, /1000000-item paging limit/],
    ['retired iso_smap format', { format: 'iso_smap' }, /format/],
    ['unknown parameter', { nonsense: true }, /unknown parameter/]
  ];
  for (const [label, args, pattern] of invalid) {
    it(`rejects ${label} before calling CMR`, async () => {
      const { fetch, calls } = fakeFetch([]);
      const result = await executeTool(tool, args, testContext(fetch));
      assert.equal(result.isError, true);
      assert.match(textOf(result), pattern);
      assert.equal(calls.length, 0);
    });
  }
});

describe('nasa_cmr compact output', () => {
  it('normalizes JSON collections, keeps identity, drops summary by default and reads CMR-Hits', async () => {
    const { fetch } = fakeFetch([['cmr.earthdata.nasa.gov', cmrOk(feed([jsonCollection(1), jsonCollection(2)]), { 'cmr-hits': '1429' })]]);
    const result = await executeTool(tool, { keyword: 'sst', limit: 2 }, testContext(fetch));
    const env = envelope(result);
    assert.equal(env.status, 'success');
    assert.equal(env.returned_count, 2);
    assert.equal(env.total_hits, 1429);
    assert.equal(env.response_mode, 'compact');
    assert.equal(env.raw, undefined);
    assert.equal(env.source.request_id, 'req-1');
    assert.equal(env.source.took_ms, 12);
    assert.equal(env.retrieved_at, '2026-09-29T12:00:00.000Z');
    const [first] = env.results;
    assert.equal(first.concept_id, 'C1001-TESTPROV');
    assert.equal(first.title, 'Test Collection 1');
    assert.equal(first.version, '1');
    assert.equal('summary' in first, false);
    assert.equal(first.instruments, null, 'json collections carry no instruments; must stay unknown');
    assert.deepEqual(first.links, [{ url: 'https://data.example.nasa.gov/1', type: 'data', title: 'Download' }]);
  });

  it('does not label page length as the total when CMR-Hits is absent', async () => {
    const { fetch } = fakeFetch([['cmr.earthdata.nasa.gov', () => jsonResponse(feed([jsonCollection(1)]))]]);
    const env = envelope(await executeTool(tool, {}, testContext(fetch)));
    assert.equal(env.total_hits, null);
    assert.equal(env.returned_count, 1);
  });

  it('normalizes UMM-JSON collections and granules through separate adapters', async () => {
    const collections = fakeFetch([['cmr.earthdata.nasa.gov', () => jsonResponse({ hits: 7, took: 3, items: [ummCollection(1)] })]]);
    const c = envelope(await executeTool(tool, { format: 'umm_json' }, testContext(collections.fetch)));
    assert.equal(c.total_hits, 7, 'falls back to the authoritative UMM hits field');
    assert.deepEqual(c.results[0].instruments, ['MODIS', 'AMSR-E']);
    assert.equal(c.results[0].doi, '10.5067/TEST-DOI');
    assert.equal(c.results[0].time_end, null);
    assert.equal(c.results[0].cloud_hosted, null);
    assert.deepEqual(c.results[0].links, [{ url: 'https://podaac.example/data', type: 'GET DATA', title: 'Data access' }]);

    const granules = fakeFetch([['cmr.earthdata.nasa.gov', cmrOk({ hits: 1, items: [ummGranule(1)] })]]);
    const g = envelope(await executeTool(tool, { format: 'umm_json', search_type: 'granules', collection_concept_id: 'C1996881146-POCLOUD' }, testContext(granules.fetch)));
    assert.deepEqual(g.results[0], {
      concept_id: 'G4001-UMMPROV',
      title: 'umm_granule_1',
      collection_concept_id: 'C1996881146-POCLOUD',
      provider: 'UMMPROV',
      producer_granule_id: 'pgid_1',
      time_start: '2002-05-31T21:00:00.000Z',
      time_end: '2002-06-01T21:00:00.000Z',
      day_night_flag: 'Unspecified',
      cloud_cover: 3,
      online_access: null,
      browse_available: null,
      links: [{ url: 'https://archive.example/umm_1.nc', type: 'GET DATA', title: 'Download' }]
    });
  });

  it('normalizes JSON granules, excluding inherited and metadata links', async () => {
    const { fetch } = fakeFetch([['cmr.earthdata.nasa.gov', cmrOk(feed([jsonGranule(1, { links: [...jsonGranule(1).links, { rel: 'http://esipfed.org/ns/fedsearch/1.1/metadata#', href: 'https://x/md5' }] })]))]]);
    const env = envelope(await executeTool(tool, { search_type: 'granules', collection_concept_id: 'C1996881146-POCLOUD' }, testContext(fetch)));
    assert.equal(env.results[0].cloud_cover, 12.5);
    assert.deepEqual(env.results[0].links?.map((l) => l.type), ['data', 's3']);
  });

  it('applies fields selection to both structured and text output, always keeping concept_id', async () => {
    const { fetch } = fakeFetch([['cmr.earthdata.nasa.gov', cmrOk(feed([jsonCollection(1)]))]]);
    const result = await executeTool(tool, { fields: ['title', 'summary'] }, testContext(fetch));
    const env = envelope(result);
    assert.deepEqual(env.results, [{ concept_id: 'C1001-TESTPROV', title: 'Test Collection 1', summary: 'A long abstract that compact mode leaves out by default.' }]);
    const text = textOf(result);
    assert.match(text, /"summary"/);
    assert.doesNotMatch(text, /"links"/);
    assert.doesNotMatch(text, /"platforms"/);
  });

  it('includes normalized facets when requested', async () => {
    const { fetch } = fakeFetch([['cmr.earthdata.nasa.gov', cmrOk(feed([jsonCollection(1)], FACETS_V2))]]);
    const env = envelope(await executeTool(tool, { include_facets: true }, testContext(fetch)));
    assert.deepEqual(env.facets, [{ name: 'Platforms', values: [{ title: 'Space-based Platforms', count: 542 }, { title: 'Other', count: 110 }] }]);
  });

  it('distinguishes successful empty results from errors', async () => {
    const empty = fakeFetch([['cmr.earthdata.nasa.gov', cmrOk(feed([]), { 'cmr-hits': '0' })]]);
    const ok = await executeTool(tool, { keyword: 'zzzz' }, testContext(empty.fetch));
    assert.equal(ok.isError, undefined);
    assert.equal(envelope(ok).status, 'no_results');
    assert.equal(envelope(ok).next_cursor, null);
  });
});

describe('nasa_cmr raw mode and upstream failures', () => {
  it('returns upstream JSON only when raw is requested', async () => {
    const body = feed([jsonCollection(1)]);
    const { fetch } = fakeFetch([['cmr.earthdata.nasa.gov', cmrOk(body)]]);
    const env = envelope(await executeTool(tool, { response_mode: 'raw' }, testContext(fetch)));
    assert.deepEqual(env.raw, body);
    assert.deepEqual(env.results, []);
    assert.equal(env.returned_count, 1);
  });

  it('passes non-JSON formats through raw with an unknown returned_count', async () => {
    const xml = '<?xml version="1.0"?><results><hits>3</hits></results>';
    const { fetch, calls } = fakeFetch([['cmr.earthdata.nasa.gov', () => new Response(xml, { headers: { 'content-type': 'application/echo10+xml', 'cmr-hits': '3' } })]]);
    const result = await executeTool(tool, { format: 'echo10' }, testContext(fetch));
    const env = envelope(result);
    assert.equal(calls[0].url.pathname, '/search/collections.echo10');
    assert.equal(env.response_mode, 'raw');
    assert.equal(env.raw, xml);
    assert.equal(env.returned_count, null);
    assert.equal(env.total_hits, 3);
    assert.ok(textOf(result).includes(xml));
  });

  const failures: Array<[string, () => Response, RegExp, number | null]> = [
    ['CMR 400 JSON errors', () => jsonResponse({ errors: ['The polygon boundary points are listed in the wrong order.'] }, { status: 400 }), /wrong order/, 400],
    ['429 rate limiting', () => jsonResponse({ errors: ['Too many requests'] }, { status: 429, headers: { 'retry-after': '5' } }), /rate limit.*retry after 5/, 429],
    ['non-JSON 500 error', () => new Response('<html><title>Gateway</title></html>', { status: 500, headers: { 'content-type': 'text/html' } }), /HTML error page: Gateway/, 500],
    ['200 with HTML instead of JSON', () => textResponse('<html>maintenance</html>'), /non-JSON response/, 200],
    ['JSON without feed.entry', () => jsonResponse({ unexpected: true }), /without the expected feed.entry/, null]
  ];
  for (const [label, respond, pattern, status] of failures) {
    it(`reports ${label} as status error, never no_results`, async () => {
      const { fetch } = fakeFetch([['cmr.earthdata.nasa.gov', respond]]);
      const result = await executeTool(tool, { keyword: 'x' }, testContext(fetch));
      assert.equal(result.isError, true);
      const env = envelope(result);
      assert.equal(env.status, 'error');
      assert.match(env.error?.message ?? '', pattern);
      assert.equal(env.error?.http_status ?? null, status);
      assert.equal(env.next_cursor, null);
    });
  }

  it('reports timeouts as errors', async () => {
    const { fetch } = fakeFetch([['cmr.earthdata.nasa.gov', () => Promise.reject(Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }))]]);
    const env = envelope(await executeTool(tool, {}, testContext(fetch)));
    assert.equal(env.status, 'error');
    assert.equal(env.error?.kind, 'timeout');
  });
});

describe('nasa_cmr Search After pagination', () => {
  it('walks first, intermediate, final and empty pages with the cursor alone', async () => {
    const cmr = pagingCmr(5);
    const ctx = testContext(cmr.fetch);
    const first = envelope(await executeTool(tool, { keyword: 'sst', limit: 2, sort_key: '-start_date', bbox: '0,0,10,10' }, ctx));
    assert.deepEqual(first.results.map((r) => r.concept_id), ['C1000-TESTPROV', 'C1001-TESTPROV']);
    assert.ok(first.next_cursor);
    assert.equal(cmr.calls[0].headers.get('cmr-search-after'), null);

    const second = envelope(await executeTool(tool, { cursor: first.next_cursor }, ctx));
    assert.deepEqual(second.results.map((r) => r.concept_id), ['C1002-TESTPROV', 'C1003-TESTPROV']);
    const secondCall = cmr.calls[1];
    assert.equal(secondCall.headers.get('cmr-search-after'), '[2,"C-2"]', 'the real upstream token is sent back');
    assert.equal(secondCall.url.searchParams.get('keyword'), 'sst');
    assert.equal(secondCall.url.searchParams.get('bounding_box'), '0,0,10,10');
    assert.equal(secondCall.url.searchParams.get('sort_key'), '-start_date');
    assert.equal(secondCall.url.searchParams.get('page_size'), '2');
    assert.equal(secondCall.url.searchParams.has('page_num'), false, 'no implicit page_num on cursor requests');
    assert.equal(secondCall.url.searchParams.has('offset'), false);
    assert.ok(second.warnings.some((w) => /no snapshot isolation/.test(w)));

    const third = envelope(await executeTool(tool, { cursor: second.next_cursor }, ctx));
    assert.deepEqual(third.results.map((r) => r.concept_id), ['C1004-TESTPROV']);
    assert.equal(third.next_cursor, null, 'a short page ends the walk');
  });

  it('returns no_results with no cursor when a full final page is followed by an empty page', async () => {
    const cmr = pagingCmr(4);
    const ctx = testContext(cmr.fetch);
    const first = envelope(await executeTool(tool, { limit: 2 }, ctx));
    const second = envelope(await executeTool(tool, { cursor: first.next_cursor }, ctx));
    assert.ok(second.next_cursor);
    const third = envelope(await executeTool(tool, { cursor: second.next_cursor }, ctx));
    assert.equal(third.status, 'no_results');
    assert.equal(third.returned_count, 0);
    assert.equal(third.next_cursor, null);
  });

  it('accepts repeated identical filters and presentation changes but rejects conflicting ones', async () => {
    const cmr = pagingCmr(6);
    const ctx = testContext(cmr.fetch);
    const first = envelope(await executeTool(tool, { keyword: 'sst', limit: 2, bbox: '0,0,10,10' }, ctx));
    const same = await executeTool(tool, { cursor: first.next_cursor, keyword: 'sst', bounding_box: [0, 0, 10, 10], search_type: 'collections', limit: 3, fields: ['title'] }, ctx);
    assert.equal(same.isError, undefined, textOf(same));
    assert.equal(cmr.calls.at(-1)!.url.searchParams.get('page_size'), '3');
    assert.deepEqual(Object.keys(envelope(same).results[0]).sort(), ['concept_id', 'title']);

    const conflicts: Array<[Record<string, unknown>, RegExp]> = [
      [{ keyword: 'ozone' }, /keyword \(cursor: "sst", request: "ozone"\)/],
      [{ search_type: 'granules', collection_concept_id: 'C1-P' }, /search_type/],
      [{ sort_key: 'short_name' }, /sort_key \(cursor: \(not set\)/],
      [{ format: 'umm_json' }, /format \(cursor: json, request: umm_json\)/],
      [{ platform: 'Aqua' }, /platform/],
      [{ page: 2 }, /cannot be combined with page or offset/],
      [{ offset: 4 }, /cannot be combined with page or offset/]
    ];
    const callsBefore = cmr.calls.length;
    for (const [extra, pattern] of conflicts) {
      const result = await executeTool(tool, { cursor: first.next_cursor, ...extra }, ctx);
      assert.equal(result.isError, true, JSON.stringify(extra));
      assert.match(textOf(result), pattern);
    }
    assert.equal(cmr.calls.length, callsBefore, 'conflicts never silently restart the search');
  });

  it('keeps cursors free of credentials and hosts, and rejects malformed, oversized or tampered cursors', async () => {
    const cmr = pagingCmr(5);
    const ctx = testContext(cmr.fetch);
    const first = envelope(await executeTool(tool, { keyword: 'sst', limit: 2 }, ctx));
    const decoded = Buffer.from(first.next_cursor!.slice(5), 'base64url').toString('utf8');
    assert.doesNotMatch(decoded, /cmr\.earthdata|https?:|TESTNASAKEY|abcdef0123456789/);

    const tamper = (mutate: (payload: Record<string, unknown>) => void) => {
      const payload = JSON.parse(decoded) as Record<string, unknown>;
      mutate(payload);
      return `cmr1.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
    };
    const bad: Array<[string, RegExp]> = [
      ['garbage', /unrecognized cursor version/],
      ['cmr1.!!!', /not base64url/],
      [`cmr1.${Buffer.from('not json').toString('base64url')}`, /undecodable/],
      [`cmr1.${'A'.repeat(9000)}`, /too long|Too big|8192/],
      [tamper((p) => (p.v = 2)), /unexpected structure/],
      [tamper((p) => (p.tool = 'nasa_firms')), /unexpected structure/],
      [tamper((p) => (p.search_after = [])), /unexpected structure/],
      [tamper((p) => ((p.query as Record<string, unknown>).keyword = 5)), /query failed validation/],
      [tamper((p) => ((p.query as Record<string, unknown>).url = 'https://evil.example')), /query failed validation/],
      [tamper((p) => ((p.query as Record<string, unknown>).collection_concept_id = ['C1-P'])), /applies only to granule/],
      [tamper((p) => (p.limit = 5000)), /unexpected structure/]
    ];
    for (const [cursor, pattern] of bad) {
      const result = await executeTool(tool, { cursor }, ctx);
      assert.equal(result.isError, true, cursor.slice(0, 40));
      assert.match(textOf(result), pattern);
    }
  });

  it('round-trips cursor state and restores the query before defaults', () => {
    const cursor = encodeCursor({
      search_type: 'granules',
      format: 'umm_json',
      query: { collection_concept_id: ['C1-P'], temporal: '2020-01-01,' },
      search_after: [1, 'x', null],
      limit: 7,
      response_mode: 'raw'
    });
    const state = decodeCursor(cursor);
    assert.equal(state.search_type, 'granules');
    const args = cmrInputSchema.parse({ cursor });
    const plan = planSearch(args, new Set(['cursor']));
    assert.equal(plan.searchType, 'granules', 'defaults (collections/json/10) must not override the cursor');
    assert.equal(plan.format, 'umm_json');
    assert.equal(plan.limit, 7);
    assert.equal(plan.responseMode, 'raw');
    assert.deepEqual(plan.query, { collection_concept_id: ['C1-P'], temporal: '2020-01-01,' });
  });

  it('keeps page/offset as an explicit compatibility path without next_cursor', async () => {
    const { fetch, calls } = fakeFetch([['cmr.earthdata.nasa.gov', cmrOk(feed([jsonCollection(1)]), { 'cmr-search-after': '[1]' })]]);
    const env = envelope(await executeTool(tool, { page: 3, limit: 1 }, testContext(fetch)));
    assert.equal(calls[0].url.searchParams.get('page_num'), '3');
    assert.equal(calls[0].headers.get('cmr-search-after'), null);
    assert.equal(env.next_cursor, null);
    assert.ok(env.warnings.some((w) => /page is deprecated/.test(w)));
  });
});
