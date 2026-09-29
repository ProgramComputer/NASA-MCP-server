import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createNasaMcpServer } from '../../src/server';
import { loadConfig } from '../../src/config';
import { cmrOutputSchema } from '../../src/handlers/nasa/cmr/schema';
import { firmsOutputSchema } from '../../src/handlers/nasa/firms';

/**
 * Opt-in, low-volume checks against the real services. Run with
 *   NASA_MCP_LIVE=1 npm run test:live
 * Missing opt-in or credentials produce explicit skips (never passes), and
 * any requested check that fails exits nonzero.
 */
const live = process.env.NASA_MCP_LIVE === '1';
const skipLive = live ? false : 'set NASA_MCP_LIVE=1 to run live upstream checks';
const skipFirms = !live ? skipLive : process.env.FIRMS_MAP_KEY ? false : 'FIRMS_MAP_KEY not set: live FIRMS check skipped (deterministic FIRMS tests still ran)';

function server() {
  return createNasaMcpServer({ config: loadConfig(process.env, []) });
}

describe('live CMR', { skip: skipLive }, () => {
  it('collection search returns normalized records with CMR-Hits totals', async () => {
    const result = await server().callTool('nasa_cmr', { keyword: 'sea surface temperature', limit: 2 });
    const env = cmrOutputSchema.parse(result.structuredContent);
    assert.equal(env.status, 'success', JSON.stringify(env.error));
    assert.equal(env.returned_count, 2);
    assert.ok((env.total_hits ?? 0) >= 2);
    assert.match(env.results[0].concept_id, /^C\d+-/);
  });

  it('granule search by collection_concept_id works', async () => {
    const result = await server().callTool('nasa_cmr', { search_type: 'granules', collection_concept_id: 'C1996881146-POCLOUD', limit: 1, sort_key: '-start_date' });
    const env = cmrOutputSchema.parse(result.structuredContent);
    assert.equal(env.status, 'success', JSON.stringify(env.error));
    assert.equal(env.results[0].collection_concept_id, 'C1996881146-POCLOUD');
  });

  it('Search After cursor continues with the cursor alone and returns different records', async () => {
    const nasa = server();
    const first = cmrOutputSchema.parse((await nasa.callTool('nasa_cmr', { keyword: 'MODIS', limit: 2, bounding_box: '-10,-10,10,10' })).structuredContent);
    assert.ok(first.next_cursor, 'first page should offer a cursor');
    const second = cmrOutputSchema.parse((await nasa.callTool('nasa_cmr', { cursor: first.next_cursor })).structuredContent);
    assert.equal(second.status, 'success', JSON.stringify(second.error));
    const firstIds = new Set(first.results.map((r) => r.concept_id));
    assert.ok(second.results.every((r) => !firstIds.has(r.concept_id)), 'second page must not repeat the first');
  });

  it('upstream validation errors surface as status error', async () => {
    const result = await server().callTool('nasa_cmr', { polygon: '0,0,0,1,1,1,1,0,0,0' });
    const env = cmrOutputSchema.parse(result.structuredContent);
    assert.equal(env.status, 'error');
    assert.equal(env.error?.http_status, 400);
  });
});

describe('live FIRMS', { skip: skipFirms }, () => {
  it('area query with the configured MAP_KEY returns a valid result', async () => {
    const result = await server().callTool('nasa_firms', { bbox: '-125,32,-114,42', days: 1, limit: 5 });
    const out = firmsOutputSchema.parse(result.structuredContent);
    assert.notEqual(out.status, 'error', JSON.stringify(out.error));
    assert.doesNotMatch(JSON.stringify(result), new RegExp(process.env.FIRMS_MAP_KEY!));
  });
});
