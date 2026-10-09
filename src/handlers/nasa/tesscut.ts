import { z } from 'zod';
import { defineTool, READ_ONLY_REMOTE } from '../../tools/types';
import { UpstreamError } from '../../util/errors';
import { httpRequest } from '../../util/http';
import { formatNumber } from '../../util/validation';
import { boundedText, buildUrl, json, sourceInfo, text } from '../common';
import { checkTarget, dateRange, mastQuery, resolveTarget, targetShape } from './mast';

const SERVICE = 'MAST TESSCut';
const TESSCUT_BASE_URL = 'https://mast.stsci.edu/tesscut/api/v0.1';
const TESS_PIXEL_ARCSEC = 21;

interface SectorResult {
  sectorName?: string;
  sector?: string;
  camera?: string;
  ccd?: string;
}

interface Sector {
  name: string;
  sector: number;
  camera: number;
  ccd: number;
  dates?: string;
  cutout_url: string;
}

interface FfiObservation {
  obs_id?: string;
  t_min?: number;
  t_max?: number;
}

export const tessFfiInputSchema = z
  .strictObject({
    ...targetShape,
    cutout_size: z
      .int()
      .min(1)
      .max(100)
      .default(10)
      .describe('Width and height of each cutout in TESS pixels (21″ each), 1-100. TESSCut limits a cutout to 10,000 pixels.'),
    sector: z.int().min(1).max(9999).describe('Only this sector.').optional()
  })
  .superRefine(checkTarget);

export const tessFfiTool = defineTool({
  name: 'nasa_tess_ffi',
  title: 'TESS full-frame image sectors and cutouts (TESSCut)',
  description:
    'Which TESS sectors, cameras and CCDs observed a sky position in their full-frame images (FFIs), with sector dates and a TESSCut download URL ' +
    'for a cutout of each sector (a ZIP of FITS target pixel files made from SPOC FFIs). Works for any star, including those without 2-minute light curves. ' +
    'Accepts an object name, TIC ID or coordinates. Cutouts are not downloaded. No API key needed.',
  inputSchema: tessFfiInputSchema,
  annotations: READ_ONLY_REMOTE,
  async handler({ args, ctx }) {
    const target = await resolveTarget(ctx, args);
    const position = { ra: formatNumber(target.ra), dec: formatNumber(target.dec) };
    const response = await httpRequest(ctx.fetch, { service: SERVICE, url: buildUrl(`${TESSCUT_BASE_URL}/sector`, position) });
    const source = sourceInfo(ctx, SERVICE, response.url);
    const results = response.json<{ results?: SectorResult[] }>().results;
    if (!Array.isArray(results)) throw new UpstreamError(SERVICE, 'invalid_response', `${SERVICE} returned no sector list.`);

    const cutoutUrl = (sector?: number) =>
      buildUrl(`${TESSCUT_BASE_URL}/astrocut`, { ...position, y: args.cutout_size, x: args.cutout_size, units: 'px', sector }).toString();
    const all: Sector[] = results
      .map((r) => ({ name: r.sectorName ?? '', sector: Number(r.sector), camera: Number(r.camera), ccd: Number(r.ccd) }))
      .filter((s) => s.name && Number.isInteger(s.sector))
      .sort((a, b) => a.sector - b.sector || a.camera - b.camera || a.ccd - b.ccd)
      .map((s) => ({ ...s, cutout_url: cutoutUrl(s.sector) }));
    const sectorNumbers = (sectors: Sector[]) => [...new Set(sectors.map((s) => s.sector))].join(', ');
    const resource = (sectors: Sector[]) => ({
      name: `TESS FFI sectors for ${target.label}`,
      mimeType: 'application/json',
      text: json({ source, target, cutout_size_px: args.cutout_size, sectors, all_sectors_cutout_url: args.sector ? undefined : cutoutUrl() }),
      source
    });

    if (all.length === 0) {
      return { content: [text(`No TESS full-frame images cover ${target.label} (TESSCut lists no sectors for this position).`)], resource: resource(all) };
    }
    const sectors = args.sector === undefined ? all : all.filter((s) => s.sector === args.sector);
    if (sectors.length === 0) {
      return {
        content: [text(`Sector ${args.sector} did not cover ${target.label}. TESS full-frame images cover it in sectors ${sectorNumbers(all)}.`)],
        resource: resource(all)
      };
    }

    const notes: string[] = [];
    try {
      const names = sectors.map((s) => s.name);
      const filters = [
        { paramName: 'obs_collection', values: ['TESS'] },
        { paramName: 'obs_id', values: names }
      ];
      const { rows } = await mastQuery<FfiObservation>(ctx, 'Mast.Caom.Filtered', { columns: 'obs_id,t_min,t_max', filters }, names.length);
      const dates = new Map(rows.map((row) => [row.obs_id, dateRange(row.t_min, row.t_max)]));
      for (const sector of sectors) sector.dates = dates.get(sector.name);
    } catch (error) {
      notes.push(`Sector dates are unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }

    const size = args.cutout_size;
    const arcmin = Number(((size * TESS_PIXEL_ARCSEC) / 60).toFixed(1));
    const count = new Set(sectors.map((s) => s.sector)).size;
    const lines = [
      `TESS full-frame images cover ${target.label} in ${count} sector${count === 1 ? '' : 's'}: ${sectorNumbers(sectors)}.`,
      `Each URL downloads a ZIP of FITS target pixel files cut from SPOC full-frame images by TESSCut: ${size} × ${size} pixels (${arcmin}′ × ${arcmin}′). ` +
        'This tool does not download them.',
      ...notes
    ];
    const sectorLines = sectors.map(
      (s) => `- Sector ${s.sector} (camera ${s.camera}, CCD ${s.ccd})${s.dates ? `, ${s.dates}` : ''}: ${s.cutout_url}`
    );
    if (args.sector === undefined) sectorLines.push(`All sectors in one ZIP: ${cutoutUrl()}`);
    return {
      content: [text(lines.join('\n')), boundedText(sectorLines.join('\n'), SERVICE, 'Pass sector to list one sector.')],
      resource: resource(sectors)
    };
  }
});
