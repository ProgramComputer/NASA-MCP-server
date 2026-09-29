import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildFirmsRequest, firmsInputSchema, firmsOutputSchema, firmsTool, pointRadiusToBbox } from '../../src/handlers/nasa/firms';
import { executeTool, type CallToolResult } from '../../src/tools/execute';
import type { ToolDefinition } from '../../src/tools/types';
import { TEST_FIRMS_KEY, TEST_NASA_KEY, testContext, textOf } from '../helpers/context';
import { fakeFetch } from '../helpers/fake-fetch';

const tool = firmsTool as unknown as ToolDefinition;
const VIIRS_HEADER = 'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight';

function firms(body: string, init: { status?: number; contentType?: string } = {}) {
  return fakeFetch([['firms.modaps.eosdis.nasa.gov', () => new Response(body, { status: init.status ?? 200, headers: { 'content-type': init.contentType ?? 'text/csv' } })]]);
}

function everything(result: CallToolResult): string {
  return JSON.stringify(result);
}

describe('FIRMS request construction', () => {
  it('uses FIRMS_MAP_KEY in the documented path, never NASA_API_KEY', async () => {
    const { fetch, calls } = firms(`${VIIRS_HEADER}\n`);
    await executeTool(tool, { bbox: '-10,-5,10,5', days: 3, date: '2026-09-20', source: 'MODIS_NRT' }, testContext(fetch));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url.pathname, `/api/area/csv/${TEST_FIRMS_KEY}/MODIS_NRT/-10,-5,10,5/3/2026-09-20`);
    assert.equal(calls[0].url.search, '');
    assert.doesNotMatch(calls[0].url.toString(), new RegExp(TEST_NASA_KEY));
  });

  it('defaults to VIIRS_SNPP_NRT, one day and no date', () => {
    const args = firmsInputSchema.parse({ bbox: [0, 0, 1, 1] });
    const { url } = buildFirmsRequest(args, TEST_FIRMS_KEY);
    assert.equal(url, `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${TEST_FIRMS_KEY}/VIIRS_SNPP_NRT/0,0,1,1/1`);
  });

  it('converts latitude/longitude/radius_km to a bbox with latitude-dependent longitude span', () => {
    const [w, s, e, n] = pointRadiusToBbox(0, 0, 111.32);
    assert.deepEqual([w, s, e, n], [-1, -1, 1, 1]);
    const [w60, , e60] = pointRadiusToBbox(60, 10, 111.32);
    assert.ok(Math.abs(e60 - w60 - 4) < 1e-6, 'at 60 degrees the longitude span doubles');
  });

  it('rejects polar and antimeridian cases instead of querying another region', async () => {
    const { fetch, calls } = firms('');
    for (const args of [
      { latitude: 89.9, longitude: 0, radius_km: 50 },
      { latitude: 0, longitude: 179.9, radius_km: 50 },
      { bbox: [170, -5, -170, 5] }
    ]) {
      const result = await executeTool(tool, args, testContext(fetch));
      assert.equal(result.isError, true, JSON.stringify(args));
      assert.match(textOf(result), /pole|antimeridian/);
    }
    assert.equal(calls.length, 0);
  });

  it('gives explicit migration errors for the old interface', async () => {
    const { fetch, calls } = firms('');
    const cases: Array<[Record<string, unknown>, RegExp]> = [
      [{ latitude: 10, longitude: 20 }, /radius_km must all be provided together/],
      [{ latitude: 10, longitude: 20, radius: 1 }, /radius had no defined units/],
      [{ latitude: 10, longitude: 20, days: 7, radius_km: 5 }, /days/],
      [{ bbox: '0,0,1,1', latitude: 1, longitude: 1, radius_km: 1 }, /either bbox or latitude/],
      [{}, /an area is required/],
      [{ bbox: '0,0,1,1', source: 'VIIRS_BOGUS' }, /source/],
      [{ bbox: '0,0,1,1', date: '2026-10-05' }, /in the future/]
    ];
    for (const [args, pattern] of cases) {
      const result = await executeTool(tool, args, testContext(fetch));
      assert.equal(result.isError, true, JSON.stringify(args));
      assert.match(textOf(result), pattern);
    }
    assert.equal(calls.length, 0);
  });

  it('requires FIRMS_MAP_KEY and does not fall back to NASA_API_KEY', async () => {
    const { fetch, calls } = firms('');
    const result = await executeTool(tool, { bbox: '0,0,1,1' }, testContext(fetch, { firmsMapKey: undefined }));
    assert.equal(result.isError, true);
    assert.match(textOf(result), /FIRMS_MAP_KEY is not set/);
    assert.equal(calls.length, 0);
  });
});

describe('FIRMS response handling', () => {
  it('parses CSV with quotes, CRLF and missing values into typed detections', async () => {
    const csv = `${VIIRS_HEADER}\r\n10.5,-20.25,330.1,0.4,0.37,2026-09-28,0130,N,VIIRS,n,2.0NRT,290.2,5.3,N\r\n"11.0","-21.0",,0.5,0.4,2026-09-28,1405,N,VIIRS,h,"2.0NRT",291,,D\r\n`;
    const { fetch } = firms(csv);
    const result = await executeTool(tool, { bbox: '-30,0,0,20' }, testContext(fetch));
    assert.equal(result.isError, undefined, textOf(result));
    const out = firmsOutputSchema.parse(result.structuredContent);
    assert.equal(out.status, 'success');
    assert.equal(out.total_detections, 2);
    assert.equal(out.detections[0].latitude, 10.5);
    assert.equal(out.detections[0].acq_time, '0130', 'acq_time keeps leading zeros');
    assert.equal(out.detections[0].confidence, 'n');
    assert.equal(out.detections[1].bright_ti4, null);
    assert.equal(out.detections[1].frp, null);
    assert.equal(out.detections[1].version, '2.0NRT');
    assert.deepEqual(out.query.bbox, [-30, 0, 0, 20]);
  });

  it('treats header-only and empty bodies as successful zero-result queries', async () => {
    for (const body of [`${VIIRS_HEADER}\n`, '']) {
      const { fetch } = firms(body);
      const result = await executeTool(tool, { bbox: '0,0,1,1' }, testContext(fetch));
      assert.equal(result.isError, undefined);
      const out = firmsOutputSchema.parse(result.structuredContent);
      assert.equal(out.status, 'no_results');
      assert.equal(out.returned_count, 0);
    }
  });

  it('truncates to limit with an explicit warning', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => `1,${i},300,0.4,0.4,2026-09-28,0100,N,VIIRS,n,2.0NRT,290,1,N`).join('\n');
    const { fetch } = firms(`${VIIRS_HEADER}\n${rows}\n`);
    const out = firmsOutputSchema.parse((await executeTool(tool, { bbox: '0,0,5,5', limit: 2 }, testContext(fetch))).structuredContent);
    assert.equal(out.total_detections, 5);
    assert.equal(out.returned_count, 2);
    assert.ok(out.warnings.some((w) => /first 2 of 5/.test(w)));
  });

  const failures: Array<[string, string, number, string | undefined, RegExp]> = [
    ['invalid key (HTTP 400 text)', 'Invalid MAP_KEY.', 400, 'text/plain', /Invalid MAP_KEY/],
    ['error text with HTTP 200', 'Invalid source.', 200, 'text/plain', /reported an error: Invalid source/],
    ['HTML page with HTTP 200', '<!DOCTYPE html><html><head><title>Maintenance</title></head></html>', 200, 'text/html', /Maintenance/],
    ['malformed CSV', `${VIIRS_HEADER}\n1,2,"unterminated\n`, 200, 'text/csv', /malformed CSV/],
    ['CSV without coordinates', 'foo,bar\n1,2\n', 200, 'text/csv', /unexpected response/],
    ['rate limiting', 'Too many requests', 429, 'text/plain', /rate limit/]
  ];
  for (const [label, body, status, contentType, pattern] of failures) {
    it(`reports ${label} as an MCP error without leaking the MAP_KEY`, async () => {
      const { fetch } = firms(body, { status, contentType });
      const result = await executeTool(tool, { bbox: '0,0,1,1' }, testContext(fetch));
      assert.equal(result.isError, true);
      const out = firmsOutputSchema.parse(result.structuredContent);
      assert.equal(out.status, 'error');
      assert.match(out.error!.message, pattern);
      assert.doesNotMatch(everything(result), new RegExp(TEST_FIRMS_KEY));
      assert.match(out.source.url, /\/api\/area\/csv\/\[REDACTED\]\//);
    });
  }

  it('never includes the MAP_KEY in successful results or provenance', async () => {
    const { fetch } = firms(`${VIIRS_HEADER}\n1,2,300,0.4,0.4,2026-09-28,0100,N,VIIRS,n,2.0NRT,290,1,N\n`);
    const result = await executeTool(tool, { bbox: '0,0,5,5' }, testContext(fetch));
    assert.doesNotMatch(everything(result), new RegExp(TEST_FIRMS_KEY));
  });

  it('bounds request time', async () => {
    const { fetch } = fakeFetch([['firms.modaps.eosdis.nasa.gov', () => Promise.reject(Object.assign(new Error('aborted'), { name: 'TimeoutError' }))]]);
    const out = firmsOutputSchema.parse((await executeTool(tool, { bbox: '0,0,1,1' }, testContext(fetch))).structuredContent);
    assert.equal(out.error?.kind, 'timeout');
  });
});
