import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { unwrapTypedJson } from '../../src/handlers/nasa/ssc';
import { parseTrekCapabilities } from '../../src/handlers/nasa/trek';
import { executeTool } from '../../src/tools/execute';
import { resolveTool } from '../../src/tools/registry';
import { TEST_NASA_KEY, testContext, textOf } from '../helpers/context';
import { fakeFetch, jsonResponse, textResponse, type Responder } from '../helpers/fake-fetch';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

async function call(name: string, args: Record<string, unknown>, routes: Array<[string | RegExp, Responder]>, config = {}) {
  const definition = resolveTool(name);
  assert.ok(definition, name);
  const fake = fakeFetch(routes);
  const result = await executeTool(definition, args, testContext(fake.fetch, config));
  return { result, calls: fake.calls, text: textOf(result) };
}

describe('nasa_insight_weather', () => {
  const feed = {
    '675': {
      AT: { av: -62.314, mn: -96.872, mx: -15.908, ct: 177556 },
      PRE: { av: 750.563, mn: 722.09, mx: 768.791, ct: 887776 },
      HWS: { av: 7.233, mn: 1.051, mx: 22.455, ct: 88628 },
      WD: { most_common: { compass_point: 'WNW', compass_degrees: 292.5 } },
      First_UTC: '2020-10-19T18:32:20Z',
      Last_UTC: '2020-10-20T19:11:55Z',
      Northern_season: 'early winter',
      Southern_season: 'early summer'
    },
    '676': { PRE: { av: 749.09, mn: 722.5, mx: 767.1 }, WD: { most_common: null }, Last_UTC: '2020-10-21T19:51:31Z' },
    sol_keys: ['675', '676'],
    validity_checks: {}
  };

  it('labels the frozen feed as historical and summarizes each sol with units', async () => {
    const { calls, text } = await call('nasa_insight_weather', {}, [['api.nasa.gov/insight_weather/', () => jsonResponse(feed)]]);
    const params = calls[0].url.searchParams;
    assert.equal(params.get('api_key'), TEST_NASA_KEY);
    assert.equal(params.get('feedtype'), 'json');
    assert.equal(params.get('ver'), '1.0');
    assert.match(text, /^HISTORICAL DATA: the InSight weather feed is no longer updated/);
    assert.match(text, /latest sol is 676, ending 2020-10-21/);
    assert.match(text, /## Sol 675 \(2020-10-19 to 2020-10-20 UTC\)/);
    assert.match(text, /Air temperature: avg -62\.3 °C \(min -96\.9, max -15\.9\)/);
    assert.match(text, /Most common wind direction: from WNW \(292\.5°\)/);
    assert.match(text, /## Sol 676[\s\S]*Air temperature: no valid data[\s\S]*Most common wind direction: no valid data/);
    assert.doesNotMatch(text, new RegExp(TEST_NASA_KEY));
  });

  it('needs NASA_API_KEY', async () => {
    const { text, calls } = await call('nasa_insight_weather', {}, [], { nasaApiKey: undefined });
    assert.match(text, /NASA_API_KEY is not set/);
    assert.equal(calls.length, 0);
  });
});

describe('nasa_tle', () => {
  const iss = { satelliteId: 25544, name: 'ISS (ZARYA)', date: '2026-09-29T19:40:36+00:00', line1: '1 25544U 98067A   26272.81986231', line2: '2 25544  51.6313 142.2618' };

  it('fetches one satellite by NORAD number without a key', async () => {
    const { calls, text } = await call('nasa_tle', { satellite_id: 25544 }, [['tle.ivanstanojevic.me/api/tle/25544', () => jsonResponse(iss)]], { nasaApiKey: undefined });
    assert.equal(calls[0].url.pathname, '/api/tle/25544');
    assert.equal(calls[0].url.search, '');
    assert.match(text, /## ISS \(ZARYA\) \(NORAD 25544\)\nEpoch: 2026-09-29T19:40:36\+00:00\n1 25544U/);
  });

  it('searches the collection with the upstream parameter names and reports paging', async () => {
    const { calls, text } = await call('nasa_tle', { search: 'ISS', sort: 'name', sort_dir: 'asc', page: 2, page_size: 1 }, [
      ['tle.ivanstanojevic.me/api/tle/', () => jsonResponse({ totalItems: 3, member: [iss], parameters: { page: 2, 'page-size': 1 }, view: { next: 'x' } })]
    ]);
    const params = calls[0].url.searchParams;
    assert.equal(calls[0].url.pathname, '/api/tle/');
    assert.deepEqual([params.get('search'), params.get('sort'), params.get('sort-dir'), params.get('page'), params.get('page-size')], ['ISS', 'name', 'asc', '2', '1']);
    assert.match(text, /^3 TLE records matching "ISS"; page 2 of 3 \(1 shown\)\. Next: page 3\./);
  });

  it('surfaces the API error message and rejects mixed modes', async () => {
    const missing = await call('nasa_tle', { satellite_id: 99999999 }, [
      ['tle.ivanstanojevic.me', () => jsonResponse({ response: { message: 'Unable to find record with id 99999999' } }, { status: 404 })]
    ]);
    assert.equal(missing.result.isError, true);
    assert.match(missing.text, /TLE API returned HTTP 404: Unable to find record with id 99999999/);
    const mixed = await call('nasa_tle', { satellite_id: 1, search: 'x' }, []);
    assert.match(mixed.text, /satellite_id cannot be combined/);
    assert.match((await call('nasa_tle', { page_size: 101 }, [])).text, /page_size/);
  });
});

const typed = (className: string, value: unknown) => [className, value];
const list = (items: unknown[]) => typed('java.util.ArrayList', items);

describe('Satellite Situation Center tools', () => {
  it('unwraps Jackson typed JSON', () => {
    const wrapped = typed('gov.nasa.gsfc.sscweb.schema.Response', { Result: typed('gov.nasa.gsfc.sscweb.schema.DataResult', { X: list([1, 2]), Name: 'iss' }) });
    assert.deepEqual(unwrapTypedJson(wrapped), { Result: { X: [1, 2], Name: 'iss' } });
    assert.deepEqual(unwrapTypedJson(['plain', 'array']), ['plain', 'array']);
  });

  it('nasa_ssc_observatories filters by text and by the day data is available', async () => {
    const observatories = typed('gov.nasa.gsfc.sscweb.schema.ObservatoryResponse', {
      Observatory: list([
        typed('gov.nasa.gsfc.sscweb.schema.ObservatoryDescription', { Id: 'mms1', Name: 'MMS 1', Resolution: 60, StartTime: typed('javax.xml.datatype.XMLGregorianCalendar', '2015-03-13T00:00:00.000+00:00'), EndTime: '2027-04-12T00:00:00.000+00:00' }),
        typed('gov.nasa.gsfc.sscweb.schema.ObservatoryDescription', { Id: 'active', Name: 'Active', Resolution: 60, StartTime: '1989-09-29T00:00:00.000+00:00', EndTime: '1991-10-04T08:00:00.000+00:00' })
      ])
    });
    const { calls, text } = await call('nasa_ssc_observatories', { search: 'MMS', active_on: '2026-09-29' }, [['sscweb.gsfc.nasa.gov/WS/sscr/2/observatories', () => jsonResponse(observatories)]]);
    assert.equal(calls[0].headers.get('accept'), 'application/json');
    assert.match(text, /^1 of 2 SSC observatories matching "MMS" with data on 2026-09-29\.\n- mms1: MMS 1 \(2015-03-13 to 2027-04-12, 60 s resolution\)$/);
  });

  const locations = (status = 'SUCCESS') =>
    typed('gov.nasa.gsfc.sscweb.schema.Response', {
      Result: typed('gov.nasa.gsfc.sscweb.schema.DataResult', {
        StatusCode: status,
        StatusSubCode: status === 'SUCCESS' ? 'SUCCESS' : 'INVALID_SATELLITE',
        ...(status === 'SUCCESS' ? {} : { StatusText: list(["Invalid satellite name 'nope'"]) }),
        Data: list([
          typed('gov.nasa.gsfc.sscweb.schema.SatelliteData', {
            Id: 'iss',
            Time: list(['2026-09-29T00:00:00.000+00:00', '2026-09-29T00:01:00.000+00:00']),
            Coordinates: list([
              typed('gov.nasa.gsfc.sscweb.schema.CoordinateData', {
                CoordinateSystem: 'GEO',
                X: list([-1273.1083505, -906.82]),
                Y: list([-4283.12, -4502.37]),
                Z: list([5115.54, 5003.92]),
                Latitude: list([48.8634071, 47.45311]),
                Longitude: list([253.44603, 258.61234]),
                LocalTime: list([16.896388, 17.2575])
              })
            ]),
            RadialLength: list([6792.2517, 6792.1248])
          })
        ])
      })
    });

  it('nasa_ssc_locations builds the REST path and returns a CSV table per observatory', async () => {
    const { calls, text } = await call('nasa_ssc_locations', { observatories: 'ISS, moon', start_time: '2026-09-29T00:00:00Z', end_time: '2026-09-29T01:00:00Z' }, [
      ['sscweb.gsfc.nasa.gov/WS/sscr/2/locations/', () => jsonResponse(locations())]
    ]);
    assert.equal(calls[0].url.pathname, '/WS/sscr/2/locations/iss,moon/20260929T000000Z,20260929T010000Z/geo/');
    assert.equal(calls[0].url.searchParams.has('resolutionFactor'), false, 'one hour fits without thinning');
    assert.match(text, /^SSC locations for iss, moon from 2026-09-29T00:00:00Z to 2026-09-29T01:00:00Z\./);
    assert.match(text, /## iss: 2 points\ntime_utc,GEO_x_km,GEO_y_km,GEO_z_km,GEO_lat_deg,GEO_lon_deg,GEO_local_time_h,radial_km\n2026-09-29T00:00:00Z,-1273\.1,-4283\.1,5115\.5,48\.863,253\.446,16\.896,6792\.3/);
  });

  it('nasa_ssc_locations bounds long ranges with a resolution factor and reports SSC errors', async () => {
    const month = await call('nasa_ssc_locations', { observatories: ['iss'], start_time: '2026-09-01', end_time: '2026-09-30T00:00:00Z', coordinate_systems: 'GEO' }, [
      ['sscweb.gsfc.nasa.gov', () => jsonResponse(locations())]
    ]);
    // 29 days at 60 s is 41,761 points; 8000 values / 8 per point allows 1000.
    assert.equal(month.calls[0].url.searchParams.get('resolutionFactor'), '42');
    assert.match(month.text, /resolution factor 42/);

    const tooFine = await call('nasa_ssc_locations', { observatories: ['iss'], start_time: '2026-09-01', end_time: '2026-09-30', resolution_factor: 2 }, []);
    assert.match(tooFine.text, /resolution_factor 2 could return about \d+ points per observatory; use 42 or more/);

    const invalid = await call('nasa_ssc_locations', { observatories: ['nope'], start_time: '2026-09-01', end_time: '2026-09-02' }, [['sscweb.gsfc.nasa.gov', () => jsonResponse(locations('ERROR'))]]);
    assert.equal(invalid.result.isError, true);
    assert.match(invalid.text, /rejected the request: Invalid satellite name 'nope'/);

    for (const [args, pattern] of [
      [{ observatories: ['iss'], start_time: '2026-09-02', end_time: '2026-09-01' }, /end_time must be after start_time/],
      [{ observatories: ['iss'], start_time: '2025-01-01', end_time: '2026-09-01' }, /limited to 366 days/],
      [{ observatories: ['iss'], start_time: '2026-09-01T12:00:00', end_time: '2026-09-02' }, /UTC time/],
      [{ observatories: ['../x'], start_time: '2026-09-01', end_time: '2026-09-02' }, /SSC observatory ID/]
    ] as Array<[Record<string, unknown>, RegExp]>) {
      assert.match((await call('nasa_ssc_locations', args, [])).text, pattern);
    }
  });
});

describe('nasa_techport', () => {
  const project = {
    projectId: 4789,
    title: 'Solar Sail Demonstration',
    status: 'Canceled',
    startDate: '2011-10-01T00:00:00Z',
    endDate: '2014-12-19T00:00:00Z',
    trlBegin: 5,
    trlCurrent: 5,
    trlEnd: 6,
    program: { title: 'Technology Demonstration Missions', acronym: 'TDM' },
    responsibleMd: { organization_name: 'Space Technology Mission Directorate' },
    primaryTx: { code: 'TX01.4.1', title: 'Solar Sails' },
    destinationTypes: ['Sun', ''],
    description: '<p>Deploy a <b>solar sail</b> &amp; test it.</p>',
    projectContacts: [{ full_name: 'A Person', email: 'a.person@nasa.gov' }]
  };

  it('searches with query and limit, and keeps contact emails out of the output', async () => {
    const { calls, text } = await call('nasa_techport', { query: 'solar sail', limit: 3 }, [['techport.nasa.gov/api/projects/search', () => jsonResponse({ total: 184, results: [project] })]]);
    assert.equal(calls[0].url.searchParams.get('query'), 'solar sail');
    assert.equal(calls[0].url.searchParams.get('limit'), '3');
    assert.match(text, /^184 TechPort projects match "solar sail"; showing the 1 most relevant\./);
    assert.match(text, /Canceled · 2011-10-01 to 2014-12-19 · TRL 5 start, 5 current, 6 target/);
    assert.match(text, /Responsible directorate: Space Technology Mission Directorate/);
    assert.match(text, /Destinations: Sun\n/);
    assert.match(text, /Page: https:\/\/techport\.nasa\.gov\/projects\/4789/);
    assert.match(text, /Description: Deploy a solar sail & test it\./);
    assert.doesNotMatch(text, /@nasa\.gov/);
  });

  it('fetches one project by ID and validates the mode', async () => {
    const detail = { ...project, leadOrganization: { organizationName: 'Nexolve' }, benefits: '<p>Lighter sails.</p>', destinationType: ['Others_Inside_the_Solar_System'] };
    const { calls, text } = await call('nasa_techport', { project_id: 94703 }, [['techport.nasa.gov/api/projects/94703', () => jsonResponse({ projectId: 94703, project: detail })]]);
    assert.equal(calls[0].url.pathname, '/api/projects/94703');
    assert.match(text, /Lead organization: Nexolve/);
    assert.match(text, /Benefits: Lighter sails\./);
    assert.match((await call('nasa_techport', {}, [])).text, /exactly one of query or project_id/);
    assert.match((await call('nasa_techport', { project_id: 1, limit: 5 }, [])).text, /limit applies only to query searches/);
  });
});

describe('nasa_techtransfer', () => {
  const row = (id: string, title: string) => ['64e71c1a', id, title, `<p>About <span class="highlight">${title}</span>.</p>`, id, 'data and image processing', 'Open Source', '', 'https://github.com/nasa/x', 'JPL', '', '', 15.3];

  it('searches technology.nasa.gov by path, applies limit locally and links catalog pages', async () => {
    const results = [row('NPO-53560-1', 'Cloud Tomography <span class="highlight">Visualization</span>'), row('GSC-1', 'Other')];
    const { calls, text } = await call('nasa_techtransfer', { query: 'cloud visualization', collection: 'software', limit: 1 }, [
      ['technology.nasa.gov/api/api/software/', () => jsonResponse({ results, count: 2, total: 2, perpage: 10, page: 0 })]
    ]);
    assert.equal(calls[0].url.pathname, '/api/api/software/cloud%20visualization');
    assert.equal(calls[0].url.searchParams.has('api_key'), false);
    assert.match(text, /^2 NASA software match "cloud visualization"; showing 1\./);
    assert.match(text, /## Cloud Tomography Visualization \(NPO-53560-1\)\nCategory: data and image processing · Center: JPL · Release: Open Source/);
    assert.match(text, /Page: https:\/\/software\.nasa\.gov\/software\/NPO-53560-1\nLink: https:\/\/github\.com\/nasa\/x/);
    assert.doesNotMatch(text, /<span|GSC-1/);
  });

  it('defaults to patents, has no page link for spinoffs, and rejects path characters', async () => {
    const patent = await call('nasa_techtransfer', { query: 'engine' }, [['technology.nasa.gov/api/api/patent/engine', () => jsonResponse({ results: [], total: 0 })]]);
    assert.match(patent.text, /No NASA patents match "engine"\./);
    const spinoff = await call('nasa_techtransfer', { query: 'polymers', collection: 'spinoff' }, [['technology.nasa.gov/api/api/spinoff/', () => jsonResponse({ results: [row('GSFC-SO-113', 'Polymers')], total: 1 })]]);
    assert.doesNotMatch(spinoff.text, /Page:/);
    assert.match((await call('nasa_techtransfer', { query: '../patent' }, [])).text, /must not contain/);
  });
});

const CAPABILITIES = `<?xml version="1.0"?>
<Capabilities><Contents>
<Layer><ows:Identifier>LAYER</ows:Identifier><Style isDefault="true"><ows:Title>Default Style</ows:Title><ows:Identifier>default</ows:Identifier></Style>
<Format>image/jpeg</Format><TileMatrixSetLink><TileMatrixSet>default028mm</TileMatrixSet></TileMatrixSetLink>
<ResourceURL format="image/jpeg" resourceType="tile" template="https://trek.nasa.gov/tiles/Moon/EQ/LAYER/1.0.0//{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.jpg"/></Layer>
<!--TileMatrixSet--><TileMatrixSet><ows:Title>default</ows:Title><ows:Identifier>default028mm</ows:Identifier>
<TileMatrix><ows:Identifier>0</ows:Identifier><TopLeftCorner>-180.0 90.0</TopLeftCorner><TileWidth>256</TileWidth><TileHeight>256</TileHeight><MatrixWidth>2.0</MatrixWidth><MatrixHeight>1.0</MatrixHeight></TileMatrix>
<TileMatrix><ows:Identifier>1</ows:Identifier><TopLeftCorner>-180.0 90.0</TopLeftCorner><TileWidth>256</TileWidth><TileHeight>256</TileHeight><MatrixWidth>4.0</MatrixWidth><MatrixHeight>2.0</MatrixHeight></TileMatrix>
<!--<TileMatrix><ows:Identifier>0</ows:Identifier><MatrixWidth>3</MatrixWidth><MatrixHeight>2</MatrixHeight></TileMatrix>-->
</TileMatrixSet></Contents></Capabilities>`;

describe('NASA Trek tools', () => {
  it('nasa_trek_layers filters the catalog by body, projection and keywords', async () => {
    const doc = {
      productLabel: 'olympus_mons.eq',
      title: 'MRO CTX, Mosaic Olympus Mons',
      mission: 'Mars Reconnaissance Orbiter',
      instrument: 'CTX',
      productCat1: 'Imagery',
      productCat2: 'Mosaic',
      coverage: 'Global',
      thumbnailURLDir: 'https://trek.nasa.gov/tiles/Mars/EQ/olympus_mons.eq/thumbnail/olympus-'
    };
    const { calls, text } = await call('nasa_trek_layers', { body: 'mars', search: 'olympus', limit: 5 }, [['trek.nasa.gov/mars/TrekServices/ws/index/eq/searchItems', () => jsonResponse({ response: { numFound: 1, docs: [doc] } })]]);
    const params = calls[0].url.searchParams;
    assert.equal(params.get('key'), 'olympus');
    assert.equal(params.get('rows'), '5');
    assert.match(params.get('facetValues')!, /\|"urn:ogc:def:crs:EPSG::104905"$/);
    assert.match(text, /^1 Mars Trek equirectangular layers matching "olympus"; showing 1\./);
    assert.match(text, /- olympus_mons\.eq: MRO CTX, Mosaic Olympus Mons \(Mars Reconnaissance Orbiter, CTX\), Imagery \/ Mosaic, global coverage\n {2}WMTS: https:\/\/trek\.nasa\.gov\/tiles\/Mars\/EQ\/olympus_mons\.eq$/);

    const polar = await call('nasa_trek_layers', { body: 'moon', projection: 'south_pole' }, [['trek.nasa.gov/moon/TrekServices/ws/index/polar/searchItems', () => jsonResponse({ response: { numFound: 0, docs: [] } })]]);
    assert.match(polar.calls[0].url.searchParams.get('facetValues')!, /IAU2000::30120"$/);
    assert.match(polar.text, /No Moon Trek south pole layers\./);
  });

  it('parses WMTS capabilities and ignores commented-out tile matrices', () => {
    const caps = parseTrekCapabilities(CAPABILITIES)!;
    assert.equal(caps.style, 'default');
    assert.equal(caps.matrixSet, 'default028mm');
    assert.deepEqual(caps.matrices.map((m) => `${m.id}:${m.width}x${m.height}`), ['0:2x1', '1:4x2']);
  });

  it('nasa_trek_tile fills the tile template, picks tiles by latitude/longitude and embeds the image', async () => {
    const { calls, result, text } = await call('nasa_trek_tile', { body: 'moon', layer: 'LAYER', zoom: 1, latitude: -10, longitude: 200 }, [
      ['trek.nasa.gov/tiles/Moon/EQ/LAYER/1.0.0/WMTSCapabilities.xml', () => textResponse(CAPABILITIES, { headers: { 'content-type': 'text/xml' } })],
      ['trek.nasa.gov/tiles/Moon/EQ/LAYER/1.0.0/default', () => new Response(PNG, { headers: { 'content-type': 'image/jpeg' } })]
    ]);
    assert.equal(calls[1].url.pathname, '/tiles/Moon/EQ/LAYER/1.0.0/default/default028mm/1/1/0.jpg', 'longitude 200 E is -160, row 1 is the southern half');
    assert.match(text, /zoom 1, row 1, column 0 of a 4×2 grid \(256×256 px\)\.\nCovers longitude -180 to -90, latitude -90 to 0 \(degrees\)\.\nZoom levels: 0-1\./);
    assert.equal(result.content.filter((c) => c.type === 'image').length, 1);
  });

  it('nasa_trek_tile explains unknown layers, missing coverage and invalid tiles', async () => {
    const caps = (): Response => textResponse(CAPABILITIES, { headers: { 'content-type': 'text/xml' } });
    const unknown = await call('nasa_trek_tile', { body: 'mars', layer: 'Nope' }, [['trek.nasa.gov', () => textResponse('missing', { status: 404 })]]);
    assert.match(unknown.text, /Mars Trek has no equirectangular layer "Nope"; find layer IDs with nasa_trek_layers/);

    const empty = await call('nasa_trek_tile', { body: 'moon', layer: 'LAYER', zoom: 1, row: 0, col: 3 }, [
      ['trek.nasa.gov/tiles/Moon/EQ/LAYER/1.0.0/WMTSCapabilities.xml', caps],
      ['trek.nasa.gov/tiles/Moon/EQ/LAYER/1.0.0/default', () => textResponse('', { status: 404 })]
    ]);
    assert.equal(empty.result.isError, undefined);
    assert.match(empty.text, /No tile exists here: the layer has no data coverage/);

    const outside = await call('nasa_trek_tile', { body: 'moon', layer: 'LAYER', zoom: 1, row: 2 }, [['trek.nasa.gov', caps]]);
    assert.match(outside.text, /zoom 1 has rows 0-1 and columns 0-3/);
    const zoom = await call('nasa_trek_tile', { body: 'moon', layer: 'LAYER', zoom: 5 }, [['trek.nasa.gov', caps]]);
    assert.match(zoom.text, /zoom 5 is not available for LAYER; zoom levels are 0, 1/);

    const elsewhere = CAPABILITIES.replace('https://trek.nasa.gov/tiles', 'https://example.com/tiles');
    const offsite = await call('nasa_trek_tile', { body: 'moon', layer: 'LAYER' }, [['trek.nasa.gov', () => textResponse(elsewhere)]]);
    assert.equal(offsite.result.isError, true);
    assert.match(offsite.text, /outside trek\.nasa\.gov; it was not fetched/);
    assert.equal(offsite.calls.length, 1);

    for (const [args, pattern] of [
      [{ body: 'ceres', layer: 'x' }, /body/],
      [{ body: 'moon', layer: '../x' }, /Trek layer ID/],
      [{ body: 'moon', layer: 'x', row: 0, latitude: 1, longitude: 1 }, /not both/],
      [{ body: 'moon', layer: 'x', projection: 'north_pole', latitude: 1, longitude: 1 }, /equirectangular/]
    ] as Array<[Record<string, unknown>, RegExp]>) {
      assert.match((await call('nasa_trek_tile', args, [])).text, pattern);
    }
  });
});

describe('jpl_mission_design', () => {
  it('object mode passes the selector and summarizes stored missions', async () => {
    const { calls, text } = await call('jpl_mission_design', { sstr: 'apophis', class: true }, [
      ['ssd-api.jpl.nasa.gov/mdesign.api', () => jsonResponse({ object: { fullname: '99942 Apophis (2004 MN4)' }, fields: ['MJD0'], selectedMissions: [[65909], [63399]] })]
    ]);
    const params = calls[0].url.searchParams;
    assert.equal(params.get('sstr'), 'apophis');
    assert.equal(params.get('class'), 'true');
    assert.equal(params.has('lim'), false);
    assert.equal(params.has('api_key'), false);
    assert.match(text, /^Mission options to 99942 Apophis \(2004 MN4\): 2 pre-computed ballistic missions\./);
  });

  it('list mode sends crit, years and hyphenated SBDB filters', async () => {
    const { calls, text } = await call('jpl_mission_design', { year: [2027, 2028], sb_group: 'neo', sb_class: 'APO,ATE', sb_sat: false }, [
      ['ssd-api.jpl.nasa.gov/mdesign.api', () => jsonResponse({ count: 20, fields: ['name'], data: [] })]
    ]);
    const params = calls[0].url.searchParams;
    assert.deepEqual(
      [params.get('lim'), params.get('crit'), params.get('year'), params.get('sb-group'), params.get('sb-class'), params.get('sb-sat')],
      ['20', '1', '2027,2028', 'neo', 'APO,ATE', 'false']
    );
    assert.match(text, /^20 accessible small bodies, best first by criterion 1\./);
  });

  it('validates modes and years, and reports unknown objects', async () => {
    assert.match((await call('jpl_mission_design', { des: '433', crit: 2 }, [])).text, /crit apply only to list mode/);
    assert.match((await call('jpl_mission_design', { des: '433', lim: 5 }, [])).text, /lim applies only to list mode/);
    assert.match((await call('jpl_mission_design', { class: true }, [])).text, /class applies only to object mode/);
    assert.match((await call('jpl_mission_design', { des: '433', spk: 2000433 }, [])).text, /only one of des, spk or sstr/);
    assert.match((await call('jpl_mission_design', { year: [2080] }, [])).text, /year must be between 2026 and 2046/);
    const missing = await call('jpl_mission_design', { sstr: 'nosuch' }, [['ssd-api.jpl.nasa.gov', () => jsonResponse({ message: 'specified object was not found', code: '200' })]]);
    assert.equal(missing.result.isError, undefined);
    assert.match(missing.text, /Mission Design: specified object was not found \("nosuch"\)\./);
  });
});
