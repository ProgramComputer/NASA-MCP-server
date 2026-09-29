import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CsvParseError, parseCsv } from '../../src/util/csv';
import { UpstreamError } from '../../src/util/errors';
import { httpRequest, summarizeErrorBody } from '../../src/util/http';
import { clearRegisteredSecrets, redact, redactDeep, registerSecret } from '../../src/util/redact';
import { boundingBoxSchema, canonicalJson, formatNumber, isIsoDate } from '../../src/util/validation';
import { fakeFetch, hangingFetch, jsonResponse, textResponse } from '../helpers/fake-fetch';

describe('parseCsv', () => {
  it('parses quoted fields, doubled quotes, embedded commas and newlines', () => {
    const table = parseCsv('a,b,c\r\n"x, y","say ""hi""","line1\nline2"\r\n1,,3\r\n');
    assert.deepEqual(table.header, ['a', 'b', 'c']);
    assert.deepEqual(table.rows, [
      ['x, y', 'say "hi"', 'line1\nline2'],
      ['1', '', '3']
    ]);
  });

  it('handles LF endings, BOM, missing trailing newline and blank lines', () => {
    const table = parseCsv('﻿latitude,longitude\n10,20\n\n30,40');
    assert.deepEqual(table.header, ['latitude', 'longitude']);
    assert.deepEqual(table.rows, [
      ['10', '20'],
      ['30', '40']
    ]);
  });

  it('returns no rows for header-only and empty input', () => {
    assert.deepEqual(parseCsv('latitude,longitude\n'), { header: ['latitude', 'longitude'], rows: [] });
    assert.deepEqual(parseCsv(''), { header: [], rows: [] });
  });

  it('rejects unterminated quotes, stray quotes and ragged rows', () => {
    assert.throws(() => parseCsv('a,b\n"open,1\n'), CsvParseError);
    assert.throws(() => parseCsv('a,b\nx"y,1\n'), CsvParseError);
    assert.throws(() => parseCsv('a,b\n1,2,3\n'), /Record 2 has 3 fields/);
  });
});

describe('redact', () => {
  it('removes api_key query values, FIRMS path keys and registered secrets', () => {
    clearRegisteredSecrets();
    registerSecret('SuperSecretValue123');
    assert.equal(redact('https://api.nasa.gov/x?date=1&api_key=ABCDEF&b=2'), 'https://api.nasa.gov/x?date=1&api_key=[REDACTED]&b=2');
    assert.equal(
      redact('https://firms.modaps.eosdis.nasa.gov/api/area/csv/abcdef0123456789abcdef0123456789/VIIRS_SNPP_NRT/1,2,3,4/1'),
      'https://firms.modaps.eosdis.nasa.gov/api/area/csv/[REDACTED]/VIIRS_SNPP_NRT/1,2,3,4/1'
    );
    assert.equal(redact('token SuperSecretValue123 leaked'), 'token [REDACTED] leaked');
    assert.deepEqual(redactDeep({ a: ['x SuperSecretValue123'], n: 1 }), { a: ['x [REDACTED]'], n: 1 });
    clearRegisteredSecrets();
  });
});

describe('validation helpers', () => {
  it('validates real calendar dates', () => {
    assert.equal(isIsoDate('2024-02-29'), true);
    assert.equal(isIsoDate('2023-02-29'), false);
    assert.equal(isIsoDate('2024-13-01'), false);
    assert.equal(isIsoDate('2024-1-01'), false);
  });

  it('parses bounding boxes in west,south,east,north order and rejects bad ones', () => {
    assert.deepEqual(boundingBoxSchema.parse('-10,-5,10,5'), [-10, -5, 10, 5]);
    assert.deepEqual(boundingBoxSchema.parse([170, -5, -170, 5]), [170, -5, -170, 5]);
    assert.equal(boundingBoxSchema.safeParse('-10,5,10,-5').success, false);
    assert.equal(boundingBoxSchema.safeParse('-10,-5,10').success, false);
    assert.equal(boundingBoxSchema.safeParse('-190,-5,10,5').success, false);
    assert.equal(boundingBoxSchema.safeParse('a,b,c,d').success, false);
  });

  it('formats numbers without exponents or rounding', () => {
    assert.equal(formatNumber(1e-7), '0.0000001');
    assert.equal(formatNumber(-12.3456789), '-12.3456789');
  });

  it('serializes canonically regardless of key order', () => {
    assert.equal(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] }), canonicalJson({ a: [2, { c: 2, d: 1 }], b: 1 }));
  });
});

describe('httpRequest', () => {
  it('enforces a finite deadline', async () => {
    await assert.rejects(httpRequest(hangingFetch, { service: 'Svc', url: 'https://example.nasa.gov/', timeoutMs: 50 }), (error: unknown) => {
      assert.ok(error instanceof UpstreamError);
      assert.equal(error.kind, 'timeout');
      return true;
    });
  });

  it('rejects oversized bodies by declared and streamed length', async () => {
    const declared = fakeFetch([['example.nasa.gov', () => new Response('x'.repeat(10), { headers: { 'content-length': '5000' } })]]);
    await assert.rejects(httpRequest(declared.fetch, { service: 'Svc', url: 'https://example.nasa.gov/', maxBytes: 100 }), /100-byte limit/);
    const streamed = fakeFetch([['example.nasa.gov', () => new Response('y'.repeat(500))]]);
    await assert.rejects(httpRequest(streamed.fetch, { service: 'Svc', url: 'https://example.nasa.gov/', maxBytes: 100 }), (error: unknown) => {
      assert.ok(error instanceof UpstreamError && error.kind === 'too_large');
      return true;
    });
  });

  it('maps 429 with Retry-After to rate_limited', async () => {
    const { fetch } = fakeFetch([['example.nasa.gov', () => jsonResponse({ error: { message: 'slow down' } }, { status: 429, headers: { 'retry-after': '30' } })]]);
    await assert.rejects(httpRequest(fetch, { service: 'Svc', url: 'https://example.nasa.gov/' }), (error: unknown) => {
      assert.ok(error instanceof UpstreamError);
      assert.equal(error.kind, 'rate_limited');
      assert.equal(error.retryAfterSeconds, 30);
      assert.match(error.message, /slow down/);
      return true;
    });
  });

  it('summarizes HTML and plain-text error bodies without leaking keys', async () => {
    const { fetch } = fakeFetch([['example.nasa.gov', () => new Response('<html><head><title>No such app</title></head></html>', { status: 404, headers: { 'content-type': 'text/html' } })]]);
    await assert.rejects(httpRequest(fetch, { service: 'Svc', url: 'https://example.nasa.gov/?api_key=SHOULDNOTAPPEAR' }), (error: unknown) => {
      assert.ok(error instanceof UpstreamError);
      assert.equal(error.status, 404);
      assert.match(error.message, /HTML error page: No such app/);
      assert.doesNotMatch(error.message, /SHOULDNOTAPPEAR/);
      return true;
    });
    assert.equal(summarizeErrorBody('Invalid MAP_KEY.', 'text/plain'), 'Invalid MAP_KEY.');
    assert.equal(summarizeErrorBody('{"errors":["a","b"]}', 'application/json'), 'a; b');
  });

  it('reports network failures and invalid JSON distinctly', async () => {
    const network = fakeFetch([['example.nasa.gov', () => Promise.reject(new TypeError('fetch failed'))]]);
    await assert.rejects(httpRequest(network.fetch, { service: 'Svc', url: 'https://example.nasa.gov/' }), (error: unknown) => {
      assert.ok(error instanceof UpstreamError && error.kind === 'network');
      return true;
    });
    const html = fakeFetch([['example.nasa.gov', () => textResponse('<html>oops</html>')]]);
    const response = await httpRequest(html.fetch, { service: 'Svc', url: 'https://example.nasa.gov/' });
    assert.throws(() => response.json(), (error: unknown) => error instanceof UpstreamError && error.kind === 'invalid_response');
  });
});
