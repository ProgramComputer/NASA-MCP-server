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

const APOD_API = 'science.nasa.gov/wp-json/wp/v2/apod-basic';
const APOD_ASSETS = 'https://assets.science.nasa.gov/content/dam/science/cds/apod/apod';

/** A post shaped like /wp/v2/apod-basic output (HTML fields included). */
function apodPost(date: string, overrides: Record<string, unknown> = {}) {
  const ymd = date.slice(2).replace(/-/g, '');
  return {
    date,
    post_id: Number(ymd),
    title: `Galaxy &#8220;${date}&#8221;`,
    permalink: `https://science.nasa.gov/image-article/apod-${date}/`,
    media_type: 'image',
    explanation: '<strong>Explanation:</strong> A <a href="https://example.org/g">galaxy</a> &amp; its stars.<br><br><strong>Tomorrow&#039;s picture:</strong> more',
    credit: '<b> Image Credit &amp; Copyright: </b> <a href="https://example.org/a">A. Astronomer</a> , Some Observatory',
    copyright: '<b> Image Credit &amp; Copyright: </b> <a href="https://example.org/a">A. Astronomer</a> , Some Observatory',
    alt: 'A spiral galaxy.',
    url: `https://science.nasa.gov/image-article/apod-${date}/`,
    hdurl: `https://assets.science.nasa.gov/dynamicimage/assets/science/cds/apod/apod/x/${ymd}.jpg?w=2000&h=1000&fit=clip`,
    basic_html:
      '<!doctype html><html><head><meta property="og:image" content="https://assets.science.nasa.gov/og.jpg"></head><body><center>' +
      `<a href="${APOD_ASSETS}/x/${ymd}.jpg"><IMG SRC="${APOD_ASSETS}/x/${ymd}.jpg" alt="A spiral galaxy."></a></center></body></html>`,
    basic_html_url: `https://science.nasa.gov/wp-json/wp/v2/apod-basic/${ymd}/html`,
    ...overrides
  };
}

const imageResponse = () => new Response(PNG, { headers: { 'content-type': 'image/png' } });

describe('nasa_apod (NASA Science WordPress API)', () => {
  it('fetches one date by YYMMDD without an API key, strips HTML and embeds a 1024-pixel rendition', async () => {
    const { result, calls, text } = await call(
      'nasa_apod',
      { date: '2024-01-01' },
      [
        [`${APOD_API}/240101`, () => jsonResponse(apodPost('2024-01-01'))],
        ['assets.science.nasa.gov', imageResponse]
      ],
      { nasaApiKey: undefined }
    );
    assert.equal(result.isError, undefined);
    assert.equal(calls[0].url.pathname, '/wp-json/wp/v2/apod-basic/240101');
    assert.equal(calls[0].url.search, '', 'the new API takes no key or query parameters');
    assert.match(text, /## Galaxy “2024-01-01” \(2024-01-01\)/);
    assert.match(text, /Credit: A\. Astronomer, Some Observatory\n/);
    assert.doesNotMatch(text, /Copyright:/, 'an identical copyright line is not repeated');
    assert.match(text, /Image: https:\/\/assets\.science\.nasa\.gov\/content\/dam\/science\/cds\/apod\/apod\/x\/240101\.jpg/);
    assert.match(text, /Alt text: A spiral galaxy\./);
    assert.match(text, /\nA galaxy & its stars\.\n\nTomorrow's picture: more$/);
    assert.doesNotMatch(text, /<|&amp;|Explanation:/);
    assert.equal(calls[1].url.pathname, '/dynamicimage/assets/science/cds/apod/apod/x/240101.jpg');
    assert.equal(calls[1].url.searchParams.get('w'), '1024');
    assert.equal(result.content.filter((c) => c.type === 'image').length, 1);
  });

  it('pages through a date range 25 posts at a time and lists it oldest first', async () => {
    const dates = Array.from({ length: 30 }, (_, i) => `2024-01-${String(30 - i).padStart(2, '0')}`);
    const { calls, text } = await call('nasa_apod', { start_date: '2024-01-01', end_date: '2024-01-30', max_images: 0 }, [
      [
        APOD_API,
        (request) => {
          const page = Number(request.url.searchParams.get('page'));
          return jsonResponse(dates.slice((page - 1) * 25, page * 25).map((d) => apodPost(d)), { headers: { 'x-wp-totalpages': '2' } });
        }
      ]
    ]);
    assert.equal(calls.length, 2);
    for (const [i, request] of calls.entries()) {
      assert.equal(request.url.searchParams.get('date_from'), '240101');
      assert.equal(request.url.searchParams.get('date_to'), '240130');
      assert.equal(request.url.searchParams.get('per_page'), '25');
      assert.equal(request.url.searchParams.get('page'), String(i + 1));
    }
    assert.match(text, /^30 APOD entries from 2024-01-01 to 2024-01-30/);
    const headings = [...text.matchAll(/^## .* \((\d{4}-\d{2}-\d{2})\)$/gm)].map((m) => m[1]);
    assert.deepEqual(headings, [...dates].reverse());
  });

  it('defaults to the latest post and reports video URLs from the page without downloading them', async () => {
    const video = apodPost('2026-09-29', {
      media_type: 'video',
      hdurl: 'https://assets.science.nasa.gov/dynamicimage/assets/science/cds/apod/apod/2026/september/frame.jpg?w=1280',
      basic_html: '<html><body><iframe width="960" height="540" src="//www.youtube.com/embed/abc123?rel=0&amp;x=1" allowfullscreen></iframe></body></html>'
    });
    const { calls, result, text } = await call('nasa_apod', { max_images: 5 }, [[APOD_API, () => jsonResponse([video])]]);
    assert.equal(calls.length, 1, 'videos and still frames are never downloaded');
    assert.equal(calls[0].url.searchParams.get('per_page'), '1');
    assert.match(text, /Video: https:\/\/www\.youtube\.com\/embed\/abc123\?rel=0&x=1/);
    assert.match(text, /Still frame: https:\/\/assets\.science\.nasa\.gov\/.*frame\.jpg/);
    assert.equal(result.content.some((c) => c.type === 'image'), false);
  });

  it('ignores the placeholder hdurl of old posts, falls back to the original image, and explains missing days', async () => {
    const placeholder = apodPost('1995-06-20', {
      hdurl: 'https://assets.science.nasa.gov/dynamicimage/assets/science/astro/programs/cosmic-origins/images/misc/news-thumbnail.png?w=594',
      basic_html: '<html><body><p>no picture element</p></body></html>'
    });
    const none = await call('nasa_apod', { date: '1995-06-20' }, [[`${APOD_API}/950620`, () => jsonResponse(placeholder)]]);
    assert.doesNotMatch(none.text, /Image:|news-thumbnail/);
    assert.equal(none.calls.length, 1);

    const gif = apodPost('1995-06-16', { basic_html: `<body><IMG SRC="${APOD_ASSETS}/1995/june/e_lens.gif"></body>` });
    const fallback = await call('nasa_apod', { date: '1995-06-16' }, [
      [`${APOD_API}/950616`, () => jsonResponse(gif)],
      ['assets.science.nasa.gov/dynamicimage', () => textResponse('not found', { status: 404 })],
      ['assets.science.nasa.gov/content/dam', () => new Response(PNG, { headers: { 'content-type': 'image/gif' } })]
    ]);
    assert.deepEqual(
      fallback.calls.map((c) => c.url.pathname.split('/')[1]),
      ['wp-json', 'dynamicimage', 'content']
    );
    assert.equal(fallback.result.content.filter((c) => c.type === 'image').length, 1);

    const missing = await call('nasa_apod', { date: '1995-06-17' }, [
      [`${APOD_API}/950617`, () => jsonResponse({ code: 'apod_basic_not_found', message: 'APOD not found.', data: { status: 404 } }, { status: 404 })]
    ]);
    assert.equal(missing.result.isError, true);
    assert.match(missing.text, /has no picture for 1995-06-17 \(HTTP 404: APOD not found\)/);
  });

  it('never emits image content when the download is not an image', async () => {
    const { result } = await call('nasa_apod', { date: '2024-01-01' }, [
      [`${APOD_API}/240101`, () => jsonResponse(apodPost('2024-01-01'))],
      ['assets.science.nasa.gov', () => textResponse('<html>not an image</html>', { headers: { 'content-type': 'text/html' } })]
    ]);
    assert.equal(result.isError, undefined);
    assert.equal(result.content.some((c) => c.type === 'image'), false);
    assert.match(textOf(result), /not embedded: response was text\/html/);
  });

  it('retires count and thumbs, and rejects future, pre-1995 and oversized requests before calling upstream', async () => {
    const cases: Array<[Record<string, unknown>, RegExp]> = [
      [{ count: 3 }, /count: The APOD API moved .* no random mode/],
      [{ thumbs: true }, /thumbs: The new APOD API has no thumbs option/],
      [{ date: '2026-09-30' }, /date 2026-09-30 is in the future \(today is 2026-09-29 UTC\)/],
      [{ date: '1995-06-15' }, /APOD starts on 1995-06-16/],
      [{ start_date: '2026-01-01' }, /limited to 100 days/],
      [{ date: '2024-01-01', start_date: '2024-01-01' }, /cannot be combined/],
      [{ end_date: '2024-01-01' }, /end_date requires start_date/]
    ];
    for (const [args, pattern] of cases) {
      const out = await call('nasa_apod', args, []);
      assert.equal(out.result.isError, true, JSON.stringify(args));
      assert.match(out.text, pattern);
      assert.equal(out.calls.length, 0);
    }
  });
});

describe('api.nasa.gov tools', () => {
  it('nasa_neo enforces the 7-day feed window and supports asteroid lookup', async () => {
    const tooLong = await call('nasa_neo', { start_date: '2024-01-01', end_date: '2024-01-10' }, []);
    assert.match(tooLong.text, /limited to 7 days/);
    const { calls } = await call('nasa_neo', { asteroid_id: '3542519' }, [['api.nasa.gov/neo/rest/v1/neo/3542519', () => jsonResponse({ id: '3542519', name: 'x', close_approach_data: [] })]]);
    assert.equal(calls[0].url.pathname, '/neo/rest/v1/neo/3542519');
    const today = await call('nasa_neo', {}, [['api.nasa.gov/neo/rest/v1/feed', () => jsonResponse({ element_count: 0, near_earth_objects: {} })]]);
    assert.equal(today.calls[0].url.searchParams.get('start_date'), '2026-09-29');
  });

  it('nasa_donki queries the CCMC DONKI API without a key and fills in the 30-day window DONKI expects', async () => {
    const { result, calls } = await call('nasa_donki', { type: 'FLR', startDate: '2026-09-10' }, [['ccmc.gsfc.nasa.gov/DONKI-API/get/FLR', () => new Response('', { status: 200 })]], {
      nasaApiKey: undefined
    });
    assert.equal(result.isError, undefined);
    assert.match(textOf(result), /No DONKI FLR events from 2026-09-10\./);
    assert.equal(calls[0].url.pathname, '/DONKI-API/get/FLR');
    assert.equal(calls[0].url.searchParams.get('startDate'), '2026-09-10');
    assert.equal(calls[0].url.searchParams.has('api_key'), false);
    assert.equal(calls[0].url.searchParams.has('endDate'), false, 'DONKI defaults the end to today');

    // CCMC counts its default start back from today, so an old endDate alone would fail upstream.
    const endOnly = await call('nasa_donki', { type: 'gst', endDate: '2010-01-31' }, [['ccmc.gsfc.nasa.gov/DONKI-API/get/GST', () => jsonResponse([])]]);
    assert.equal(endOnly.calls[0].url.searchParams.get('startDate'), '2010-01-01');
    assert.equal(endOnly.calls[0].url.searchParams.get('endDate'), '2010-01-31');
    assert.match(endOnly.text, /No DONKI GST events from 2010-01-01 to 2010-01-31\./);

    for (const [args, pattern] of [
      [{ type: 'flr', startDate: '2026-08-01', endDate: '2026-09-29' }, /endDate: DONKI returns at most 30 days per request/],
      [{ type: 'flr', startDate: '2026-01-01' }, /startDate 2026-01-01 is 271 days before today; also set endDate \(at most 2026-01-31\)/],
      [{ type: 'flr', startDate: '2026-10-01' }, /startDate 2026-10-01 is in the future/],
      [{ type: 'flr', startDate: '2026-09-02', endDate: '2026-09-01' }, /endDate must not be before startDate/],
      [{ type: 'flr', response_mode: 'full' }, /response_mode/]
    ] as Array<[Record<string, unknown>, RegExp]>) {
      const out = await call('nasa_donki', args, []);
      assert.equal(out.result.isError, true, JSON.stringify(args));
      assert.match(out.text, pattern);
      assert.equal(out.calls.length, 0);
    }
  });

  it('nasa_donki summarizes each event on one line by default and returns full records on request', async () => {
    const flares = [
      { flrID: '2026-09-01T21:04:00-FLR-001', classType: 'C5.7', beginTime: '2026-09-01T21:04Z', peakTime: '2026-09-01T21:10Z', endTime: '2026-09-01T21:12Z', sourceLocation: 'N15E90', activeRegionNum: 14524, instruments: [{ displayName: 'GOES-P: EXIS 1.0-8.0' }], linkedEvents: [{ activityID: '2026-09-01T23:00:00-CME-001' }], note: 'long note' },
      { flrID: '2026-09-02T18:57:00-FLR-001', classType: 'M3.0', beginTime: '2026-09-02T18:57Z', peakTime: '2026-09-02T19:20Z', endTime: '2026-09-02T19:48Z', sourceLocation: 'N12E90', activeRegionNum: null, linkedEvents: null }
    ];
    const flr = await call('nasa_donki', { type: 'flr', startDate: '2026-09-01', endDate: '2026-09-29' }, [['ccmc.gsfc.nasa.gov/DONKI-API/get/FLR', () => jsonResponse(flares)]]);
    assert.equal(
      flr.text,
      'Retrieved 2 FLR records from 2026-09-01 to 2026-09-29.\n' +
        '- 2026-09-01T21:04:00-FLR-001: class C5.7, peak 2026-09-01T21:10Z (2026-09-01T21:04Z to 2026-09-01T21:12Z), source N15E90 AR 14524; instruments: GOES-P: EXIS 1.0-8.0; linked: 2026-09-01T23:00:00-CME-001\n' +
        '- 2026-09-02T18:57:00-FLR-001: class M3.0, peak 2026-09-02T19:20Z (2026-09-02T18:57Z to 2026-09-02T19:48Z), source N12E90'
    );

    const cme = {
      activityID: '2026-09-02T10:24:00-CME-001',
      startTime: '2026-09-02T10:24Z',
      sourceLocation: '',
      cmeAnalyses: [
        { isMostAccurate: false, speed: 100 },
        { isMostAccurate: true, speed: 280, halfAngle: 38, type: 'S', latitude: 6, longitude: 27, enlilList: [{ estimatedShockArrivalTime: '2026-09-06T16:00Z', isEarthGB: true, kp_90: 2, kp_135: 3, kp_180: 3 }] }
      ],
      linkedEvents: [{ activityID: '2026-09-06T17:38:00-IPS-001' }]
    };
    const gst = { gstID: '2026-06-05T15:00:00-GST-001', startTime: '2026-06-05T15:00Z', allKpIndex: [{ kpIndex: 5.67, observedTime: '2026-06-05T15:00Z', source: 'NOAA' }, { kpIndex: 6.33, observedTime: '2026-06-05T18:00Z', source: 'NOAA' }] };
    const notice = { messageType: 'CME', messageID: '20260929-AL-001', messageURL: 'https://ccmc.gsfc.nasa.gov/x', messageIssueTime: '2026-09-29T01:01Z', messageBody: '## Summary:\n\nA fast CME was detected.' };
    const lines = async (type: string, record: unknown) =>
      (await call('nasa_donki', { type, startDate: '2026-09-01', endDate: '2026-09-29' }, [['ccmc.gsfc.nasa.gov', () => jsonResponse([record])]])).text.split('\n')[1];
    assert.equal(
      await lines('cme', cme),
      '- 2026-09-02T10:24:00-CME-001: start 2026-09-02T10:24Z; 280 km/s, half-angle 38°, type S, lat 6 lon 27; Earth arrival 2026-09-06T16:00Z (glancing blow, Kp up to 3); linked: 2026-09-06T17:38:00-IPS-001'
    );
    assert.equal(await lines('gst', gst), '- 2026-06-05T15:00:00-GST-001: start 2026-06-05T15:00Z, max Kp 6.33 at 2026-06-05T18:00Z (NOAA)');
    assert.equal(await lines('notifications', notice), '- 2026-09-29T01:01Z CME 20260929-AL-001: Summary: A fast CME was detected. https://ccmc.gsfc.nasa.gov/x');
    assert.equal(await lines('sep', { sepID: 'SEP-1', eventTime: '2026-09-05T15:45Z', linkedEvents: [{ activityID: 'FLR-1' }] }), '- SEP-1: 2026-09-05T15:45Z; linked: FLR-1');

    const recent = await call('nasa_donki', { type: 'flr', startDate: '2026-09-01', endDate: '2026-09-29', limit: 1, response_mode: 'raw' }, [['ccmc.gsfc.nasa.gov', () => jsonResponse(flares)]]);
    assert.match(recent.text, /^Retrieved 2 FLR records from 2026-09-01 to 2026-09-29; showing the 1 most recent\.\n\[/);
    const raw = JSON.parse(recent.text.slice(recent.text.indexOf('\n') + 1)) as Array<{ flrID: string }>;
    assert.deepEqual(raw.map((r) => r.flrID), ['2026-09-02T18:57:00-FLR-001']);
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
