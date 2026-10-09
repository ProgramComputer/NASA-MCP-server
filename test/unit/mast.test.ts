import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { downloadUrl, formatBytes, mjdToDate } from '../../src/handlers/nasa/mast';
import { executeTool } from '../../src/tools/execute';
import { resolveTool } from '../../src/tools/registry';
import { testContext, textOf } from '../helpers/context';
import { fakeFetch, jsonResponse, type RecordedRequest, type Responder } from '../helpers/fake-fetch';

interface MastRequest {
  service: string;
  params: Record<string, unknown> & { filters?: Array<{ paramName: string; values: unknown[] }> };
  format: string;
  pagesize?: number;
}

const INVOKE = 'mast.stsci.edu/api/v0/invoke';
const SECTORS = 'mast.stsci.edu/tesscut/api/v0.1/sector';

function mastRequest(request: RecordedRequest): MastRequest {
  return JSON.parse(new URLSearchParams(String(request.body)).get('request')!) as MastRequest;
}

/** Answers MAST API calls by service name; any other service fails the test. */
function mast(handlers: Record<string, (request: MastRequest) => unknown>): [string, Responder] {
  return [
    INVOKE,
    (request) => {
      const parsed = mastRequest(request);
      const handler = handlers[parsed.service];
      if (!handler) throw new Error(`unexpected MAST service ${parsed.service}`);
      const body = handler(parsed);
      return body instanceof Response ? body : jsonResponse(body);
    }
  ];
}

const table = (data: unknown[], total = data.length) => ({
  status: 'COMPLETE',
  msg: '',
  data,
  fields: [],
  paging: { page: 1, pageSize: data.length, pagesFiltered: 1, rows: data.length, rowsFiltered: total, rowsTotal: total }
});

const piMensae = {
  resolvedCoordinate: [{ searchString: 'pi mensae', resolver: 'SIMBAD', canonicalName: '* pi. Men', ra: 84.2911951861308, decl: -80.46912070924 }],
  status: ''
};

const filterValues = (request: MastRequest, name: string) => request.params.filters?.find((f) => f.paramName === name)?.values;
const services = (calls: RecordedRequest[]) => calls.filter((c) => `${c.url.host}${c.url.pathname}` === INVOKE).map((c) => mastRequest(c).service);

async function call(name: string, args: Record<string, unknown>, routes: Array<[string, Responder]>) {
  const definition = resolveTool(name);
  assert.ok(definition, name);
  const fake = fakeFetch(routes);
  const result = await executeTool(definition, args, testContext(fake.fetch, { nasaApiKey: undefined }));
  return { result, calls: fake.calls, text: textOf(result) };
}

describe('MAST helpers', () => {
  it('converts MJD to dates, formats sizes and builds anonymous download links', () => {
    assert.equal(mjdToDate(58324.81304390046), '2018-07-25');
    assert.equal(mjdToDate(null), undefined);
    assert.equal(formatBytes(2013120), '2.0 MB');
    assert.equal(formatBytes(512), '512 B');
    assert.equal(formatBytes(null), 'size unknown');
    assert.equal(
      downloadUrl('mast:TESS/product/tess2023209231226-s0068-0000000261136679-0262-s_lc.fits'),
      'https://mast.stsci.edu/api/v0.1/Download/file?uri=mast%3ATESS%2Fproduct%2Ftess2023209231226-s0068-0000000261136679-0262-s_lc.fits'
    );
    assert.equal(downloadUrl('https://archive.stsci.edu/hlsps/x.fits'), 'https://archive.stsci.edu/hlsps/x.fits');
    assert.equal(downloadUrl('ftp://example.org/x.fits'), undefined);
  });

  it('requires exactly one of target, tic_id, or ra and dec', async () => {
    for (const tool of ['nasa_mast_observations', 'nasa_tess_ffi']) {
      for (const [args, pattern] of [
        [{}, /exactly one of target, tic_id, or ra and dec/],
        [{ target: 'Pi Mensae', tic_id: 261136679 }, /exactly one of target, tic_id, or ra and dec/],
        [{ ra: 84.29 }, /dec: ra and dec must be given together/],
        [{ ra: 360.5, dec: 0 }, /ra: /],
        [{ ra: 10, dec: -91 }, /dec: /]
      ] as Array<[Record<string, unknown>, RegExp]>) {
        const { result, calls, text } = await call(tool, args, []);
        assert.equal(result.isError, true, `${tool} ${JSON.stringify(args)}`);
        assert.match(text, pattern);
        assert.equal(calls.length, 0);
      }
    }
  });

  it('resolves names with Mast.Name.Lookup and reports names MAST cannot resolve', async () => {
    const unknown = await call('nasa_tess_ffi', { target: 'notastar xyz123' }, [mast({ 'Mast.Name.Lookup': () => ({ resolvedCoordinate: [], status: '' }) })]);
    assert.equal(unknown.result.isError, true);
    assert.match(unknown.text, /MAST could not resolve "notastar xyz123" to a sky position/);
    const request = unknown.calls[0];
    assert.equal(request.method, 'POST');
    assert.equal(request.headers.get('content-type'), 'application/x-www-form-urlencoded');
    assert.deepEqual(mastRequest(request), { service: 'Mast.Name.Lookup', params: { input: 'notastar xyz123', format: 'json' }, format: 'json' });
  });

  it('re-sends a stalled request, at most three times', async () => {
    const stall = () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    };
    let attempts = 0;
    const recovered = await call('nasa_mast_observations', { tic_id: 261136679 }, [
      mast({ 'Mast.Caom.Filtered': () => (++attempts === 1 ? stall() : table([])) })
    ]);
    assert.equal(recovered.result.isError, undefined, recovered.text);
    assert.equal(attempts, 2);

    const stalled = await call('nasa_mast_observations', { tic_id: 261136679 }, [[INVOKE, stall]]);
    assert.equal(stalled.result.isError, true);
    assert.equal(stalled.calls.length, 3);
    assert.match(stalled.text, /^MAST did not answer within 90 seconds \(3 attempts\)\. MAST keeps running slow searches/);
  });

  it('re-requests a query MAST is still executing and surfaces MAST errors', async () => {
    let attempts = 0;
    const executing = await call('nasa_mast_observations', { tic_id: 261136679 }, [
      mast({ 'Mast.Caom.Filtered': () => (++attempts === 1 ? { status: 'EXECUTING', msg: '' } : table([])) })
    ]);
    assert.equal(executing.result.isError, undefined, executing.text);
    assert.equal(attempts, 2);
    assert.match(executing.text, /No TESS light curves in MAST for TIC 261136679/);

    const failed = await call('nasa_mast_observations', { tic_id: 261136679 }, [mast({ 'Mast.Caom.Filtered': () => ({ status: 'ERROR', msg: 'Request failed.' }) })]);
    assert.equal(failed.result.isError, true);
    assert.match(failed.text, /MAST Mast\.Caom\.Filtered failed: Request failed\./);
  });
});

describe('nasa_mast_observations', () => {
  const lightCurve = (overrides: Record<string, unknown>) => ({
    obs_collection: 'TESS',
    provenance_name: 'SPOC',
    instrument_name: 'Photometer',
    filters: 'TESS',
    dataproduct_type: 'timeseries',
    target_name: '261136679',
    t_exptime: 120,
    dataRights: 'PUBLIC',
    ...overrides
  });
  const rows = [
    lightCurve({ obsid: 1, sequence_number: 1, t_min: 58324.81, t_max: 58352.67, obs_id: 'tess2018206045859-s0001-0000000261136679-0120-s' }),
    lightCurve({ obsid: 2, sequence_number: 1, t_min: 58324.81, t_max: 58352.67, t_exptime: 20, obs_id: 'tess2018206045859-s0001-0000000261136679-0120-a_fast' }),
    lightCurve({ obsid: 3, sequence_number: 39, t_min: 58324.81, t_max: 59389.5, obs_id: 'tess2018206190142-s0001-s0039-0000000261136679' }),
    lightCurve({ obsid: 4, obs_collection: 'HLSP', provenance_name: 'QLP', sequence_number: 4, t_min: 58410.42, t_max: 58436.33, t_exptime: 1800, obs_id: 'hlsp_qlp_tess_ffi_s0004-0000000261136679_tess_v01_llc' }),
    lightCurve({ obsid: 5, obs_collection: 'HLSP', provenance_name: 'QLP', sequence_number: 1, t_min: 58324.81, t_max: 58352.67, t_exptime: 1800, obs_id: 'hlsp_qlp_tess_ffi_s0001-0000000261136679_tess_v01_llc' }),
    lightCurve({ obsid: 6, obs_collection: 'HLSP', provenance_name: 'DIAMANTE', sequence_number: -999, t_min: null, t_exptime: 1800, obs_id: 'hlsp_diamante_tess_lightcurve_tic-0000000261136679_tess_v1_llc' })
  ];

  it('matches TIC stars around a named target and lists SPOC and HLSP light curves by sector', async () => {
    let filtered: MastRequest | undefined;
    const { calls, text, result } = await call('nasa_mast_observations', { target: 'Pi Mensae', radius_arcsec: 30, limit: 4 }, [
      mast({
        'Mast.Name.Lookup': () => piMensae,
        'Mast.Catalogs.Tic.Cone': (request) => {
          assert.deepEqual(request.params, { ra: 84.2911951861308, dec: -80.46912070924, radius: 30 / 3600 });
          return table([
            { ID: 261139071, Tmag: 13.9952, dstArcSec: 22.02 },
            { ID: 261136679, Tmag: 5.1054, dstArcSec: 0.0054 }
          ]);
        },
        'Mast.Caom.Filtered': (request) => {
          filtered = request;
          return table(rows);
        }
      })
    ]);
    assert.equal(result.isError, undefined, text);
    assert.deepEqual(services(calls), ['Mast.Name.Lookup', 'Mast.Catalogs.Tic.Cone', 'Mast.Caom.Filtered']);
    assert.deepEqual(filterValues(filtered!, 'target_name'), ['261136679', '261139071'], 'nearest star first');
    assert.deepEqual(filterValues(filtered!, 'obs_collection'), ['TESS', 'HLSP']);
    assert.deepEqual(filterValues(filtered!, 'filters'), ['TESS']);
    assert.deepEqual(filterValues(filtered!, 'dataproduct_type'), ['timeseries']);
    assert.equal(filtered!.pagesize, 2000);
    assert.match(filtered!.params.columns as string, /^obsid,obs_collection,.*sequence_number/);

    assert.match(
      text,
      /^6 TESS light curve observations in MAST for TIC stars within 30″ of Pi Mensae \(\* pi\. Men; RA 84\.29120°, Dec -80\.46912°; resolved by SIMBAD\)\.\n/
    );
    assert.match(text, /Matched TIC 261136679 \(Tmag 5\.11, 0\.0″ away\); TIC 261139071 \(Tmag 14\.00, 22\.0″ away\)\./);
    assert.match(text, /TESS mission \(SPOC\) target light curves: sectors 1 \(cadence 120 s, 20 s\)\./, 'the multi-sector search is not a sector');
    assert.match(text, /High-level science product \(HLSP\) light curves: DIAMANTE \(no sector number\); QLP sectors 1, 4\./);
    assert.match(text, /Showing the 4 most recent; raise limit to see others\./);
    assert.match(text, /- obsid 4: HLSP Photometer timeseries; sector 4; 1800 s exposure; 2018-10-19 to 2018-11-14; pipeline QLP; target 261136679; obs_id hlsp_qlp/);
    assert.match(text, /- obsid 3: TESS Photometer timeseries; sectors 1-39 \(multi-sector search\); 120 s exposure; 2018-07-25 to 2021-06-24; pipeline SPOC/);
    assert.doesNotMatch(text, /obsid 6:/, 'rows without dates sort last');
  });

  it('uses a TIC ID directly, without name resolution or a cone search', async () => {
    for (const args of [{ tic_id: 261136679 }, { target: 'TIC 0261136679' }]) {
      let targets: unknown[] | undefined;
      const { calls, text } = await call('nasa_mast_observations', args, [
        mast({
          'Mast.Caom.Filtered': (request) => {
            targets = filterValues(request, 'target_name');
            return table(rows.slice(0, 1));
          }
        })
      ]);
      assert.deepEqual(services(calls), ['Mast.Caom.Filtered']);
      assert.deepEqual(targets, ['261136679']);
      assert.match(text, /^1 TESS light curve observation in MAST for TIC 261136679\./);
    }
  });

  it('explains when no TIC star or no light curve matches', async () => {
    const empty = await call('nasa_mast_observations', { ra: 10, dec: -30 }, [mast({ 'Mast.Catalogs.Tic.Cone': () => table([]) })]);
    assert.match(empty.text, /^No TESS Input Catalog stars lie within 10″ of RA 10\.00000°, Dec -30\.00000°\. Raise radius_arcsec, or use nasa_tess_ffi/);
    assert.deepEqual(services(empty.calls), ['Mast.Catalogs.Tic.Cone']);

    const none = await call('nasa_mast_observations', { tic_id: 1 }, [mast({ 'Mast.Caom.Filtered': () => table([]) })]);
    assert.match(none.text, /^No TESS light curves in MAST for TIC 1\.\nFull-frame images may still cover it: try nasa_tess_ffi\.$/);
  });

  it('uses the position search for other collections and data product types', async () => {
    let request: MastRequest | undefined;
    const jwst = await call('nasa_mast_observations', { target: 'TRAPPIST-1', collection: 'JWST', dataproduct_type: 'timeseries', radius_arcsec: 5 }, [
      mast({
        'Mast.Name.Lookup': () => ({ resolvedCoordinate: [{ canonicalName: 'TRAPPIST-1', ra: 346.6223683, decl: -5.0413976, resolver: 'SIMBAD' }], status: '' }),
        'Mast.Caom.Filtered.Position': (r) => {
          request = r;
          return table([
            {
              obsid: 233336015, obs_collection: 'JWST', instrument_name: 'MIRI/IMAGE', filters: 'F1280W', dataproduct_type: 'timeseries', sequence_number: -999,
              t_exptime: 15625.71, t_min: 60649.1, t_max: 60649.3, provenance_name: 'CALJWST', target_name: 'TRAPPIST-1', obs_id: 'jw05191004001_03101_00001-seg007_mirimage',
              proposal_id: '5191', proposal_pi: 'Ducrot, Elsa', dataRights: 'EXCLUSIVE_ACCESS'
            }
          ], 270);
        }
      })
    ]);
    assert.equal(request!.params.position, `346.6223683, -5.0413976, ${5 / 3600}`);
    assert.deepEqual(request!.params.filters, [
      { paramName: 'obs_collection', values: ['JWST'] },
      { paramName: 'dataproduct_type', values: ['timeseries'] }
    ]);
    assert.match(jwst.text, /^270 JWST timeseries observations within 5″ of TRAPPIST-1 \(RA 346\.62237°, Dec -5\.04140°; resolved by SIMBAD\)\. Counts below cover the first 1;/);
    assert.match(jwst.text, /\nBy type: timeseries 1\.\nBy instrument: MIRI\/IMAGE 1\.\n/);
    assert.match(
      jwst.text,
      /- obsid 233336015: JWST MIRI\/IMAGE timeseries; filter F1280W; 15625\.7 s exposure; 2024-12-05; pipeline CALJWST; target TRAPPIST-1; obs_id jw05191004001_03101_00001-seg007_mirimage; proposal 5191 \(PI Ducrot, Elsa\); EXCLUSIVE_ACCESS$/
    );

    const all = await call('nasa_mast_observations', { ra: 133.14921, dec: 28.33082, collection: 'all' }, [
      mast({
        'Mast.Caom.Filtered.Position': (r) => {
          request = r;
          return table([
            { obsid: 10, obs_collection: 'HST', instrument_name: 'FGS', dataproduct_type: 'timeseries', t_min: 50000 },
            { obsid: 11, obs_collection: 'TESS', filters: 'TESS', dataproduct_type: 'image', sequence_number: 44, obs_id: 'tess-s0044-1-1', t_min: 59000 },
            { obsid: 12, obs_collection: 'TESS', filters: 'TESS', dataproduct_type: 'timeseries', sequence_number: 21, t_min: 58800 }
          ]);
        }
      })
    ]);
    assert.equal(request!.params.position, `133.14921, 28.33082, ${60 / 3600}`, 'position searches default to 60″');
    assert.deepEqual(request!.params.filters, []);
    assert.match(all.text, /By collection: TESS 2, HST 1\.\nBy type: timeseries 2, image 1\.\nBy instrument: HST FGS 1\.\nTESS sectors with light curves: 21\.\nTESS sectors with full-frame images: 44 \(use nasa_tess_ffi for cutouts\)\./);

    const ffi = await call('nasa_mast_observations', { tic_id: 261136679, dataproduct_type: 'image' }, [
      mast({ 'Mast.Name.Lookup': () => piMensae, 'Mast.Caom.Filtered.Position': () => table([]) })
    ]);
    assert.deepEqual(services(ffi.calls), ['Mast.Name.Lookup', 'Mast.Caom.Filtered.Position']);
    assert.match(ffi.text, /^No TESS image observations within 60″ of TIC 261136679/);
  });
});

describe('nasa_mast_products', () => {
  const product = (overrides: Record<string, unknown>) => ({
    obsID: 176755222,
    parent_obsid: 176755222,
    obs_collection: 'TESS',
    productType: 'SCIENCE',
    productGroupDescription: 'Minimum Recommended Products',
    dataRights: 'PUBLIC',
    calib_level: 3,
    ...overrides
  });
  const tess = [
    product({ productFilename: 'x_tp.fits', dataURI: 'mast:TESS/product/x_tp.fits', productSubGroupDescription: 'TP', description: 'Target pixel files', size: 92180160, calib_level: 2 }),
    product({ productFilename: 'x_lc.fits', dataURI: 'mast:TESS/product/x_lc.fits', productSubGroupDescription: 'LC', description: 'Light curves', size: 2013120 }),
    product({ productFilename: 'x_lc.fits', dataURI: 'mast:TESS/product/x_lc.fits', productSubGroupDescription: 'LC', description: 'Light curves', size: 2013120 }),
    product({ productFilename: 'x_dvr.pdf', dataURI: 'mast:TESS/product/x_dvr.pdf', productType: 'INFO', productSubGroupDescription: 'DVR', productGroupDescription: null, size: 14318908 }),
    product({ productFilename: 'x.png', dataURI: 'mast:TESS/product/x.png', productType: 'PREVIEW', productSubGroupDescription: null, productGroupDescription: null, size: 1000 })
  ];
  const hlsp = [
    product({
      obsID: 45092053, parent_obsid: 45092053, obs_collection: 'HLSP', productFilename: 'hlsp_qlp_llc.fits', dataURI: 'mast:HLSP/qlp/s0013/hlsp_qlp_llc.fits',
      productSubGroupDescription: null, description: 'FITS', size: 85504, calib_level: 4, dataRights: 'EXCLUSIVE_ACCESS'
    })
  ];

  it('lists science files with sizes and download links, newest calibration level first', async () => {
    let request: MastRequest | undefined;
    const { text } = await call('nasa_mast_products', { obsids: [176755222, '45092053', 176755222] }, [
      mast({
        'Mast.Caom.Products': (r) => {
          request = r;
          return table([...tess, ...hlsp]);
        }
      })
    ]);
    assert.deepEqual(request!.params, { obsid: '176755222,45092053' });
    assert.equal(request!.pagesize, 5000);
    assert.match(text, /^5 products for obsid 176755222, 45092053; 3 match types science\. Matching files total 94\.3 MB\.\n/, 'the duplicate light curve is dropped');
    assert.match(text, /By subgroup: LC 1, none 1, TP 1\./);
    assert.match(text, /Not listed because of product_types: info 1, preview 1\./);
    assert.match(text, /Files marked EXCLUSIVE_ACCESS are still proprietary and need a MAST token/);
    assert.match(
      text,
      /- x_lc\.fits \(LC, SCIENCE, 2\.0 MB, level 3, minimum recommended\): Light curves\n {2}https:\/\/mast\.stsci\.edu\/api\/v0\.1\/Download\/file\?uri=mast%3ATESS%2Fproduct%2Fx_lc\.fits\n- x_tp\.fits \(TP, SCIENCE, 92\.2 MB, level 2/
    );
    assert.match(text, /- hlsp_qlp_llc\.fits \(SCIENCE, 85\.5 KB, level 4, minimum recommended, EXCLUSIVE_ACCESS\): FITS\n {2}https:\/\/mast\.stsci\.edu\/api\/v0\.1\/Download\/file\?uri=mast%3AHLSP%2Fqlp/);
    assert.ok(text.indexOf('x_tp.fits') < text.indexOf('hlsp_qlp_llc.fits'), 'products follow the requested obsid order');
  });

  it('filters by type, subgroup and minimum recommended products, and notes obsids without products', async () => {
    const routes = [mast({ 'Mast.Caom.Products': () => table([...tess, ...hlsp]) })];
    const reports = await call('nasa_mast_products', { obsids: '176755222, 45092053, 99', product_types: 'INFO', subgroups: 'dvr' }, routes);
    assert.match(reports.text, /^5 products for obsid 176755222, 45092053, 99; 1 match types info, subgroups DVR\. Matching files total 14\.3 MB\.\nNo products are listed for obsid 99\./);
    assert.match(reports.text, /- x_dvr\.pdf \(DVR, INFO, 14\.3 MB, level 3\)/);

    const recommended = await call('nasa_mast_products', { obsids: ['176755222'], product_types: ['science', 'preview'], minimum_recommended: true, limit: 1 }, routes);
    assert.match(recommended.text, /; 3 match types science\/preview, minimum recommended only\./);
    assert.match(recommended.text, /Showing 1; raise limit or add subgroups to see others\./);

    const none = await call('nasa_mast_products', { obsids: '5' }, [mast({ 'Mast.Caom.Products': () => table([]) })]);
    assert.equal(none.text, 'MAST lists no products for obsid 5. Check the obsid values from nasa_mast_observations.');
  });

  it('validates obsids and product types before calling MAST', async () => {
    for (const [args, pattern] of [
      [{ obsids: 'tess2023209231226-s0068' }, /numeric MAST obsid/],
      [{ obsids: [] }, /obsids/],
      [{ obsids: '1', product_types: ['raw'] }, /product_types/],
      [{ obsids: '1', subgroups: ['L C'] }, /product subgroup/]
    ] as Array<[Record<string, unknown>, RegExp]>) {
      const { result, calls, text } = await call('nasa_mast_products', args, []);
      assert.equal(result.isError, true, JSON.stringify(args));
      assert.match(text, pattern);
      assert.equal(calls.length, 0);
    }
  });
});

describe('nasa_tess_ffi', () => {
  const sectors = {
    results: [
      { sectorName: 'tess-s0004-4-3', sector: '0004', camera: '4', ccd: '3' },
      { sectorName: 'tess-s0001-4-2', sector: '0001', camera: '4', ccd: '2' }
    ]
  };
  const dates = (request: MastRequest) => {
    assert.deepEqual(filterValues(request, 'obs_id'), ['tess-s0001-4-2', 'tess-s0004-4-3']);
    return table([
      { obs_id: 'tess-s0001-4-2', t_min: 58324.81304390046, t_max: 58352.666903854166 },
      { obs_id: 'tess-s0004-4-3', t_min: 58410.4159353, t_max: 58436.33232073 }
    ]);
  };

  it('lists sectors with dates and a TESSCut cutout URL for each', async () => {
    const { calls, text } = await call('nasa_tess_ffi', { tic_id: 261136679, cutout_size: 20 }, [
      mast({
        'Mast.Name.Lookup': (request) => {
          assert.equal(request.params.input, 'TIC 261136679');
          return { resolvedCoordinate: [{ canonicalName: 'TIC 261136679', ra: 84.2911879979852, decl: -80.4691197969941, resolver: 'TIC' }], status: '' };
        },
        'Mast.Caom.Filtered': dates
      }),
      [SECTORS, () => jsonResponse(sectors)]
    ]);
    const sectorCall = calls.find((c) => c.url.pathname.endsWith('/sector'))!;
    assert.equal(sectorCall.url.search, '?ra=84.2911879979852&dec=-80.4691197969941');
    assert.match(text, /^TESS full-frame images cover TIC 261136679 \(RA 84\.29119°, Dec -80\.46912°; resolved by TIC\) in 2 sectors: 1, 4\.\n/);
    assert.match(text, /20 × 20 pixels \(7′ × 7′\)\. This tool does not download them\./);
    const base = 'https://mast.stsci.edu/tesscut/api/v0.1/astrocut?ra=84.2911879979852&dec=-80.4691197969941&y=20&x=20&units=px';
    assert.ok(text.includes(`- Sector 1 (camera 4, CCD 2), 2018-07-25 to 2018-08-22: ${base}&sector=1\n- Sector 4 (camera 4, CCD 3), 2018-10-19 to 2018-11-14: ${base}&sector=4`), text);
    assert.ok(text.endsWith(`All sectors in one ZIP: ${base}`));
  });

  it('handles one sector, uncovered positions and missing dates', async () => {
    const position = { ra: 97.0968, dec: -65.5793 };
    const one = await call('nasa_tess_ffi', { ...position, sector: 4 }, [
      mast({ 'Mast.Caom.Filtered': () => ({ status: 'ERROR', msg: 'Request failed.' }) }),
      [SECTORS, () => jsonResponse(sectors)]
    ]);
    assert.match(one.text, /^TESS full-frame images cover RA 97\.09680°, Dec -65\.57930° in 1 sector: 4\.\n/);
    assert.match(one.text, /Sector dates are unavailable: MAST Mast\.Caom\.Filtered failed: Request failed\./);
    assert.match(one.text, /- Sector 4 \(camera 4, CCD 3\): https:\/\/mast\.stsci\.edu\/tesscut\/api\/v0\.1\/astrocut\?ra=97\.0968&dec=-65\.5793&y=10&x=10&units=px&sector=4$/);

    const missed = await call('nasa_tess_ffi', { ...position, sector: 2 }, [[SECTORS, () => jsonResponse(sectors)]]);
    assert.equal(missed.text, 'Sector 2 did not cover RA 97.09680°, Dec -65.57930°. TESS full-frame images cover it in sectors 1, 4.');

    const none = await call('nasa_tess_ffi', position, [[SECTORS, () => jsonResponse({ results: [] })]]);
    assert.equal(none.text, 'No TESS full-frame images cover RA 97.09680°, Dec -65.57930° (TESSCut lists no sectors for this position).');

    const tooBig = await call('nasa_tess_ffi', { ...position, cutout_size: 101 }, []);
    assert.match(tooBig.text, /cutout_size/);
    assert.equal(tooBig.calls.length, 0);
  });
});
