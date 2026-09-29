import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { executeTool } from '../../src/tools/execute';
import { resolveTool } from '../../src/tools/registry';
import type { ToolDefinition } from '../../src/tools/types';
import { TEST_NASA_KEY, testContext, textOf } from '../helpers/context';
import { fakeFetch, jsonResponse, textResponse, type Responder } from '../helpers/fake-fetch';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

function tool(name: string): ToolDefinition {
  const definition = resolveTool(name);
  assert.ok(definition, name);
  return definition;
}

async function call(name: string, args: Record<string, unknown>, routes: Array<[string | RegExp, Responder]>, config = {}) {
  const fake = fakeFetch(routes);
  const result = await executeTool(tool(name), args, testContext(fake.fetch, config));
  return { result, calls: fake.calls, text: textOf(result) };
}

describe('api.nasa.gov tools', () => {
  it('nasa_apod sends the key as api_key and embeds only real images from nasa.gov', async () => {
    const apod = [
      { date: '2024-01-01', title: 'Galaxy', media_type: 'image', url: 'https://apod.nasa.gov/a.png', explanation: 'x' },
      { date: '2024-01-02', title: 'Video', media_type: 'video', url: 'https://www.youtube.com/embed/x', explanation: 'y' }
    ];
    const { result, calls } = await call('nasa_apod', { start_date: '2024-01-01', end_date: '2024-01-02', max_images: 5 }, [
      ['api.nasa.gov/planetary/apod', () => jsonResponse(apod)],
      ['apod.nasa.gov', () => new Response(PNG, { headers: { 'content-type': 'image/png' } })]
    ]);
    assert.equal(calls[0].url.searchParams.get('api_key'), TEST_NASA_KEY);
    assert.equal(calls[0].url.searchParams.get('start_date'), '2024-01-01');
    const images = result.content.filter((c) => c.type === 'image');
    assert.equal(images.length, 1);
    assert.equal((images[0] as { mimeType: string }).mimeType, 'image/png');
    assert.equal(calls.length, 2, 'video URLs and non-NASA hosts are never downloaded');
    assert.doesNotMatch(JSON.stringify(result), new RegExp(TEST_NASA_KEY));
  });

  it('nasa_apod never emits image content when the download is not an image', async () => {
    const { result } = await call('nasa_apod', { date: '2024-01-01' }, [
      ['api.nasa.gov/planetary/apod', () => jsonResponse({ date: '2024-01-01', title: 'T', media_type: 'image', url: 'https://apod.nasa.gov/a.jpg' })],
      ['apod.nasa.gov', () => textResponse('<html>not an image</html>', { headers: { 'content-type': 'text/html' } })]
    ]);
    assert.equal(result.isError, undefined);
    assert.equal(result.content.some((c) => c.type === 'image'), false);
    assert.match(textOf(result), /not embedded: response was text\/html/);
  });

  it('nasa_apod validates date combinations and needs NASA_API_KEY', async () => {
    const both = await call('nasa_apod', { date: '2024-01-01', count: 3 }, []);
    assert.match(both.text, /count cannot be combined/);
    const noKey = await call('nasa_apod', {}, [], { nasaApiKey: undefined });
    assert.match(noKey.text, /NASA_API_KEY is not set/);
    assert.equal(noKey.calls.length, 0);
  });

  it('nasa_neo enforces the 7-day feed window and supports asteroid lookup', async () => {
    const tooLong = await call('nasa_neo', { start_date: '2024-01-01', end_date: '2024-01-10' }, []);
    assert.match(tooLong.text, /limited to 7 days/);
    const { calls } = await call('nasa_neo', { asteroid_id: '3542519' }, [['api.nasa.gov/neo/rest/v1/neo/3542519', () => jsonResponse({ id: '3542519', name: 'x', close_approach_data: [] })]]);
    assert.equal(calls[0].url.pathname, '/neo/rest/v1/neo/3542519');
    const today = await call('nasa_neo', {}, [['api.nasa.gov/neo/rest/v1/feed', () => jsonResponse({ element_count: 0, near_earth_objects: {} })]]);
    assert.equal(today.calls[0].url.searchParams.get('start_date'), '2026-09-29');
  });

  it('nasa_donki handles an empty body as no events and lower-cases type', async () => {
    const { result, calls } = await call('nasa_donki', { type: 'FLR', startDate: '2024-01-01' }, [['api.nasa.gov/DONKI/FLR', () => new Response('', { status: 200 })]]);
    assert.equal(result.isError, undefined);
    assert.match(textOf(result), /No DONKI FLR events/);
    assert.equal(calls[0].url.searchParams.get('startDate'), '2024-01-01');
  });

  it('nasa_mars_rover reports the retired upstream accurately instead of fabricating photos', async () => {
    const { result } = await call('nasa/mars-rover', { rover: 'curiosity', sol: 1000 }, [
      ['api.nasa.gov/mars-photos', () => new Response('<html><head><title>No such app</title></head></html>', { status: 404, headers: { 'content-type': 'text/html' } })]
    ]);
    assert.equal(result.isError, true);
    assert.match(textOf(result), /No such app.*appears to be retired/);
    assert.doesNotMatch(JSON.stringify(result), new RegExp(TEST_NASA_KEY));
  });
});

describe('other NASA tools', () => {
  it('nasa_gibs requests WMS 1.3.0 with lat,lon axis order and rejects XML exceptions', async () => {
    const ok = await call('nasa_gibs', { layer: 'MODIS_Terra_CorrectedReflectance_TrueColor', date: '2024-01-01', bbox: '-20,-10,20,10', resolution: 4 }, [
      ['gibs.earthdata.nasa.gov', () => new Response(PNG, { headers: { 'content-type': 'image/png' } })]
    ]);
    const params = ok.calls[0].url.searchParams;
    assert.equal(params.get('BBOX'), '-10,-20,10,20');
    assert.equal(params.get('WIDTH'), '160');
    assert.equal(params.get('HEIGHT'), '80');
    assert.equal(ok.result.content.filter((c) => c.type === 'image').length, 1);

    const bad = await call('nasa_gibs', { layer: 'NoSuchLayer', date: '2024-01-01' }, [
      ['gibs.earthdata.nasa.gov', () => textResponse('<ServiceExceptionReport><ServiceException>Invalid LAYERS</ServiceException></ServiceExceptionReport>', { headers: { 'content-type': 'text/xml' } })]
    ]);
    assert.equal(bad.result.isError, true);
    assert.match(bad.text, /did not return an image: Invalid LAYERS/);
  });

  it('nasa_exoplanet uses the TAP service with a bounded ADQL query', async () => {
    const { calls, text } = await call('nasa_exoplanet', { table: 'ps', select: 'pl_name,disc_year', where: 'disc_year > 2020', order: 'pl_name', limit: 5 }, [
      ['exoplanetarchive.ipac.caltech.edu/TAP/sync', () => jsonResponse([{ pl_name: 'A b', disc_year: 2022 }])]
    ]);
    assert.equal(calls[0].url.searchParams.get('query'), 'select top 5 pl_name,disc_year from ps where disc_year > 2020 order by pl_name');
    assert.match(text, /Found 1 rows/);
    const injected = await call('nasa_exoplanet', { table: 'ps; drop' }, []);
    assert.equal(injected.result.isError, true);
  });

  it('nasa_eonet sends filters exactly and never broadens silently', async () => {
    const { calls, text } = await call('nasa_eonet', { category: 'wildfires', status: 'open', days: 5 }, [['eonet.gsfc.nasa.gov', () => jsonResponse({ events: [] })]]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url.searchParams.get('category'), 'wildfires');
    assert.equal(calls[0].url.searchParams.get('days'), '5');
    assert.match(text, /No EONET events matched/);
  });

  it('nasa_power sends time-standard with the documented hyphen', async () => {
    const { calls } = await call('nasa_power', { parameters: 'T2M', community: 're', latitude: 40.7, longitude: -74, start: '20220101', end: '20220102', time_standard: 'utc' }, [
      ['power.larc.nasa.gov', () => jsonResponse({ properties: { parameter: { T2M: { '20220101': 1 } } }, header: {} })]
    ]);
    assert.equal(calls[0].url.searchParams.get('time-standard'), 'utc');
    assert.equal(calls[0].url.searchParams.get('community'), 'RE');
    assert.equal(calls[0].url.searchParams.has('time_standard'), false);
  });

  it('nasa_images embeds previews, not full-resolution originals', async () => {
    const body = {
      collection: {
        metadata: { total_hits: 1 },
        items: [{ href: 'https://images-assets.nasa.gov/image/x/collection.json', data: [{ nasa_id: 'x', title: 'Moon', media_type: 'image' }], links: [{ rel: 'preview', href: 'https://images-assets.nasa.gov/image/x/x~thumb.jpg', render: 'image' }] }]
      }
    };
    const { calls, result } = await call('nasa_images', { q: 'moon' }, [
      ['images-api.nasa.gov', () => jsonResponse(body)],
      ['images-assets.nasa.gov', () => new Response(PNG, { headers: { 'content-type': 'image/jpeg' } })]
    ]);
    assert.equal(calls[1].url.pathname, '/image/x/x~thumb.jpg');
    assert.equal(result.content.filter((c) => c.type === 'image').length, 1);
  });
});

describe('JPL tools', () => {
  it('jpl_sbdb maps cad to ca-data and handles ambiguous (HTTP 300) matches', async () => {
    const { calls, text } = await call('jpl_sbdb', { sstr: 'Ceres', cad: true }, [['ssd-api.jpl.nasa.gov/sbdb.api', () => jsonResponse({ object: { fullname: '1 Ceres' } })]]);
    assert.equal(calls[0].url.searchParams.get('ca-data'), 'true');
    assert.equal(calls[0].url.searchParams.has('api_key'), false, 'JPL SSD APIs never receive the NASA key');
    assert.match(text, /SBDB data for "Ceres"/);
    const many = await call('jpl_sbdb', { sstr: 'a*' }, [['ssd-api.jpl.nasa.gov/sbdb.api', () => jsonResponse({ count: 2, list: [] }, { status: 300 })]]);
    assert.equal(many.result.isError, undefined);
    assert.match(many.text, /Several SBDB objects match/);
  });

  it('jpl_fireball hyphenates parameters and applies the documented default limit', async () => {
    const { calls } = await call('jpl_fireball', { date_min: '2020-01-01', energy_min: 0.3, req_vel_comp: true }, [['ssd-api.jpl.nasa.gov/fireball.api', () => jsonResponse({ count: '0' })]]);
    const params = calls[0].url.searchParams;
    assert.equal(params.get('date-min'), '2020-01-01');
    assert.equal(params.get('energy-min'), '0.3');
    assert.equal(params.get('req-vel-comp'), 'true');
    assert.equal(params.get('limit'), '50');
    const retired = await call('jpl_fireball', { req_energy: true }, []);
    assert.match(retired.text, /rejects req-energy/);
  });

  it('jpl_sentry applies limit locally and explains the retired date filters', async () => {
    const { calls, result } = await call('jpl_sentry', { ip_min: 1e-5, limit: 2 }, [
      ['ssd-api.jpl.nasa.gov/sentry.api', () => jsonResponse({ count: '4', data: [{ des: 'a' }, { des: 'b' }, { des: 'c' }, { des: 'd' }] })]
    ]);
    assert.equal(calls[0].url.searchParams.has('limit'), false);
    assert.equal(calls[0].url.searchParams.get('ip-min'), '0.00001');
    assert.match(textOf(result), /returned 4 records; showing the first 2/);
    assert.equal((JSON.parse(result.content[1].type === 'text' ? result.content[1].text : '{}') as { data: unknown[] }).data.length, 2);
    const retired = await call('jpl_sentry', { date_min: '2020-01-01' }, []);
    assert.match(retired.text, /no date filter/);
  });

  it('jpl_scout uses documented parameters and explains retired ones', async () => {
    const { calls } = await call('jpl_scout', { tdes: 'P21Eolo', plot: 'el:ca', file: 'list', n_orbits: 10 }, [['ssd-api.jpl.nasa.gov/scout.api', () => jsonResponse({ data: [] })]]);
    const params = calls[0].url.searchParams;
    assert.equal(params.get('plot'), 'el:ca');
    assert.equal(params.get('n-orbits'), '10');
    for (const [args, pattern] of [
      [{ orbit_id: '1' }, /does not accept orbit-id/],
      [{ summary: true }, /does not accept a summary/],
      [{ plot: true, tdes: 'X' }, /plot/],
      [{ file: 'summary', tdes: 'X' }, /file/],
      [{ plot: 'el' }, /require tdes/]
    ] as Array<[Record<string, unknown>, RegExp]>) {
      const out = await call('jpl_scout', args, []);
      assert.equal(out.result.isError, true);
      assert.match(out.text, pattern);
    }
    const missing = await call('jpl_scout', { tdes: 'bogus' }, [['ssd-api.jpl.nasa.gov/scout.api', () => jsonResponse({ error: 'specified object does not exist' })]]);
    assert.equal(missing.result.isError, true);
    assert.match(missing.text, /specified object does not exist/);
  });

  it('jpl_horizons quotes values and jpl_horizons_file posts an input file', async () => {
    const get = await call('jpl_horizons', { COMMAND: '499', OBJ_DATA: 'YES', MAKE_EPHEM: 'NO' }, [['ssd.jpl.nasa.gov/api/horizons.api', () => jsonResponse({ result: 'Mars data' })]]);
    assert.equal(get.calls[0].url.searchParams.get('COMMAND'), "'499'");
    assert.match(get.text, /Mars data/);
    const post = await call('jpl_horizons_file', { COMMAND: '499', START_TIME: '2024-01-01' }, [['ssd.jpl.nasa.gov/api/horizons_file.api', () => jsonResponse({ result: 'ok' })]]);
    assert.equal(post.calls[0].method, 'POST');
    const form = post.calls[0].body as FormData;
    const input = await (form.get('input') as Blob).text();
    assert.equal(input, "!$$SOF\nCOMMAND='499'\nSTART_TIME='2024-01-01'\n!$$EOF\n");
    const error = await call('jpl_horizons', { COMMAND: '499' }, [['ssd.jpl.nasa.gov/api/horizons.api', () => jsonResponse({ error: 'no such object' })]]);
    assert.equal(error.result.isError, true);
  });

  it('jpl_jd_cal, jpl_cad, jpl_nhats and jpl_periodic_orbits map parameters and validate inputs', async () => {
    const jd = await call('jpl_jd_cal', { cd: '2000-01-01 12:00:00' }, [['ssd-api.jpl.nasa.gov/jd_cal.api', () => jsonResponse({ jd: '2451545.0' })]]);
    assert.equal(jd.calls[0].url.searchParams.get('cd'), '2000-01-01_12:00:00');
    assert.match((await call('jpl_jd_cal', {}, [])).text, /exactly one of jd or cd/);
    const cad = await call('jpl_cad', { dist_max: '10LD', date_min: 'now', sort: '-dist', neo: false }, [['ssd-api.jpl.nasa.gov/cad.api', () => jsonResponse({ count: 0 })]]);
    assert.equal(cad.calls[0].url.searchParams.get('dist-max'), '10LD');
    assert.equal(cad.calls[0].url.searchParams.get('neo'), 'false');
    const nhats = await call('jpl_nhats', { dv: 6, launch: '2025-2030' }, [['ssd-api.jpl.nasa.gov/nhats.api', () => jsonResponse({ count: '1' })]]);
    assert.equal(nhats.calls[0].url.searchParams.get('dv'), '6');
    assert.match((await call('jpl_nhats', { stay: 9 }, [])).text, /stay/);
    const po = await call('jpl_periodic_orbits', { sys: 'earth-moon', family: 'halo', libr: 1, branch: 'N' }, [['ssd-api.jpl.nasa.gov/periodic_orbits.api', () => jsonResponse({ count: '3' })]]);
    assert.equal(po.calls[0].url.searchParams.get('libr'), '1');
  });

  it('nasa_osdr_files accepts OSD- prefixes and encodes the accession', async () => {
    const { calls } = await call('nasa_osdr_files', { accession_number: 'OSD-87' }, [['osdr.nasa.gov', () => jsonResponse({ hits: 1, studies: {} })]]);
    assert.equal(calls[0].url.pathname, '/osdr/data/osd/files/87');
  });
});
