import { z } from 'zod';
import { defineTool, READ_ONLY_REMOTE, type SourceInfo, type TextContent, type ToolContext, type ToolOutput } from '../../tools/types';
import { ToolInputError, UpstreamError } from '../../util/errors';
import { httpRequest } from '../../util/http';
import { formatNumber, listInput } from '../../util/validation';
import { boundedText, json, sourceInfo, text } from '../common';

const SERVICE = 'MAST';
const MAST_INVOKE_URL = 'https://mast.stsci.edu/api/v0/invoke';
const MAST_DOWNLOAD_URL = 'https://mast.stsci.edu/api/v0.1/Download/file';
/** Uncached position searches have taken over a minute while MAST was busy. */
const MAST_TIMEOUT_MS = 90_000;
const NAME_LOOKUP_TIMEOUT_MS = 30_000;
const EXECUTING_POLL_MS = 1_000;
const RETRY_HINT = 'MAST keeps running slow searches and caches the result, so the same call often succeeds a minute later.';
/** MAST's row order changes between identical queries, so results are fetched in one page and sorted locally. */
const MAX_OBSERVATION_ROWS = 2000;
const MAX_PRODUCT_ROWS = 5000;
const MJD_UNIX_EPOCH = 40_587;

async function mastPost<T>(ctx: ToolContext, request: Record<string, unknown>, timeoutMs: number): Promise<{ data: T; source: SourceInfo }> {
  try {
    const response = await httpRequest(ctx.fetch, {
      service: SERVICE,
      url: MAST_INVOKE_URL,
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({ request: JSON.stringify(request) }).toString(),
      timeoutMs
    });
    return { data: response.json<T>(), source: sourceInfo(ctx, SERVICE, response.url) };
  } catch (error) {
    if (error instanceof UpstreamError && error.kind === 'timeout') throw new UpstreamError(SERVICE, 'timeout', `${error.message} ${RETRY_HINT}`);
    throw error;
  }
}

interface MastTable<T> {
  status?: string;
  msg?: string;
  data?: T[];
  paging?: { rowsFiltered?: number };
}

/**
 * Runs one MAST API service and returns its first page. A query MAST is
 * still working on comes back as EXECUTING and is re-requested.
 */
export async function mastQuery<T>(
  ctx: ToolContext,
  service: string,
  params: Record<string, unknown>,
  pagesize: number
): Promise<{ rows: T[]; total: number; source: SourceInfo }> {
  const request = { service, params, format: 'json', pagesize, page: 1 };
  const deadline = Date.now() + MAST_TIMEOUT_MS;
  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new UpstreamError(SERVICE, 'timeout', `MAST was still running ${service} after ${MAST_TIMEOUT_MS / 1000} seconds. ${RETRY_HINT}`);
    }
    const { data, source } = await mastPost<MastTable<T>>(ctx, request, remaining);
    if (data.status === 'EXECUTING') {
      await new Promise((resolve) => setTimeout(resolve, EXECUTING_POLL_MS));
      continue;
    }
    if (data.status !== 'COMPLETE') {
      throw new UpstreamError(SERVICE, 'invalid_response', `MAST ${service} failed: ${data.msg?.trim() || `status ${data.status ?? 'missing'}`}`);
    }
    const rows = Array.isArray(data.data) ? data.data : [];
    return { rows, total: data.paging?.rowsFiltered ?? rows.length, source };
  }
}

/** Target parameters shared by the MAST and TESSCut tools: a name, a TIC ID, or coordinates. */
export const targetShape = {
  target: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .describe('Object name resolved by MAST (SIMBAD, NED or the TESS Input Catalog), e.g. "Pi Mensae", "TRAPPIST-1", "M31" or "TIC 261136679".')
    .optional(),
  tic_id: z.int().min(1).max(99_999_999_999).describe('TESS Input Catalog (TIC) ID, e.g. 261136679.').optional(),
  ra: z.number().min(0).max(360).describe('Right ascension in decimal degrees (ICRS). Use with dec instead of target or tic_id.').optional(),
  dec: z.number().min(-90).max(90).describe('Declination in decimal degrees (ICRS). Use with ra.').optional()
};

interface TargetArgs {
  target?: string;
  tic_id?: number;
  ra?: number;
  dec?: number;
}

export function checkTarget(args: TargetArgs, ctx: z.RefinementCtx): void {
  const hasCoordinates = args.ra !== undefined || args.dec !== undefined;
  const forms = [args.target !== undefined, args.tic_id !== undefined, hasCoordinates].filter(Boolean).length;
  if (forms !== 1) {
    ctx.addIssue({ code: 'custom', message: 'give exactly one of target, tic_id, or ra and dec' });
  } else if (hasCoordinates && (args.ra === undefined || args.dec === undefined)) {
    ctx.addIssue({ code: 'custom', path: [args.ra === undefined ? 'ra' : 'dec'], message: 'ra and dec must be given together' });
  }
}

export interface ResolvedTarget {
  ra: number;
  dec: number;
  /** Human-readable target and position for summaries. */
  label: string;
}

interface NameLookup {
  resolvedCoordinate?: Array<{ canonicalName?: string; ra?: number; decl?: number; resolver?: string }>;
}

const degrees = (value: number) => `${value.toFixed(5)}°`;

/** Turns a name or TIC ID into coordinates with MAST's name resolver; coordinates pass through. */
export async function resolveTarget(ctx: ToolContext, args: TargetArgs): Promise<ResolvedTarget> {
  if (args.ra !== undefined && args.dec !== undefined) {
    return { ra: args.ra, dec: args.dec, label: `RA ${degrees(args.ra)}, Dec ${degrees(args.dec)}` };
  }
  const input = args.tic_id !== undefined ? `TIC ${args.tic_id}` : (args.target ?? '');
  const { data } = await mastPost<NameLookup>(ctx, { service: 'Mast.Name.Lookup', params: { input, format: 'json' }, format: 'json' }, NAME_LOOKUP_TIMEOUT_MS);
  const match = data.resolvedCoordinate?.find((c) => Number.isFinite(c.ra) && Number.isFinite(c.decl));
  if (!match) {
    throw new ToolInputError(`MAST could not resolve "${input}" to a sky position. Check the name, or pass ra and dec in degrees.`);
  }
  const ra = match.ra!;
  const dec = match.decl!;
  const details = [
    match.canonicalName && match.canonicalName.toLowerCase() !== input.toLowerCase() ? match.canonicalName : undefined,
    `RA ${degrees(ra)}, Dec ${degrees(dec)}`,
    match.resolver ? `resolved by ${match.resolver}` : undefined
  ].filter(Boolean);
  return { ra, dec, label: `${input} (${details.join('; ')})` };
}

export function mjdToDate(mjd: unknown): string | undefined {
  if (typeof mjd !== 'number' || !Number.isFinite(mjd)) return undefined;
  return new Date((mjd - MJD_UNIX_EPOCH) * 86_400_000).toISOString().slice(0, 10);
}

export function dateRange(start: unknown, end: unknown): string | undefined {
  const from = mjdToDate(start);
  const to = mjdToDate(end);
  if (!from) return undefined;
  return to && to !== from ? `${from} to ${to}` : from;
}

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

function countBy<T>(items: T[], key: (item: T) => string | undefined): string {
  const counts = new Map<string, number>();
  for (const item of items) {
    const value = key(item);
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([value, count]) => `${value} ${count}`).join(', ');
}

const OBSERVATION_COLUMNS = [
  'obsid', 'obs_collection', 'provenance_name', 'instrument_name', 'filters', 'dataproduct_type', 'target_name', 'obs_id',
  't_min', 't_max', 't_exptime', 'sequence_number', 'proposal_id', 'proposal_pi', 'dataRights', 'calib_level'
].join(',');

interface Observation {
  obsid?: string | number;
  obs_collection?: string | null;
  provenance_name?: string | null;
  instrument_name?: string | null;
  filters?: string | null;
  dataproduct_type?: string | null;
  target_name?: string | null;
  obs_id?: string | null;
  t_min?: number | null;
  t_max?: number | null;
  t_exptime?: number | null;
  sequence_number?: number | null;
  proposal_id?: string | null;
  proposal_pi?: string | null;
  dataRights?: string | null;
  calib_level?: number | null;
}

/** TESS mission rows, and high-level light curves made from TESS data (filter "TESS"). */
const isTess = (row: Observation) => row.obs_collection?.toUpperCase() === 'TESS' || row.filters?.toUpperCase() === 'TESS';
/** MAST uses -999 for observations without a sequence (sector, campaign or quarter). */
const sequenceOf = (row: Observation) => (typeof row.sequence_number === 'number' && row.sequence_number >= 0 ? row.sequence_number : undefined);
/**
 * Multi-sector transit searches (obs_id like ...-s0001-s0039-...) carry only
 * their last sector as sequence_number, so they must not count as observed sectors.
 */
const SECTOR_RANGE = /-s(\d{4})-s(\d{4})[-_]/;
const sectorRange = (row: Observation) => {
  const match = isTess(row) ? SECTOR_RANGE.exec(row.obs_id ?? '') : null;
  return match ? `${Number(match[1])}-${Number(match[2])}` : undefined;
};

function observationLine(row: Observation): string {
  const kind = [row.obs_collection, row.instrument_name, row.dataproduct_type].filter(Boolean).join(' ');
  const parts = [
    kind || 'unknown observation',
    row.filters && !isTess(row) ? `filter ${row.filters}` : undefined,
    sectorRange(row)
      ? `sectors ${sectorRange(row)} (multi-sector search)`
      : sequenceOf(row) !== undefined
        ? `${isTess(row) ? 'sector' : 'sequence'} ${sequenceOf(row)}`
        : undefined,
    typeof row.t_exptime === 'number' ? `${Number(row.t_exptime.toFixed(1))} s exposure` : undefined,
    dateRange(row.t_min, row.t_max),
    row.provenance_name ? `pipeline ${row.provenance_name}` : undefined,
    row.target_name ? `target ${row.target_name}` : undefined,
    row.obs_id ? `obs_id ${row.obs_id}` : undefined,
    row.proposal_id && row.proposal_id !== 'N/A' ? `proposal ${row.proposal_id}${row.proposal_pi ? ` (PI ${row.proposal_pi})` : ''}` : undefined,
    row.dataRights && row.dataRights.toUpperCase() !== 'PUBLIC' ? row.dataRights.toUpperCase() : undefined
  ];
  return `- obsid ${row.obsid}: ${parts.filter(Boolean).join('; ')}`;
}

function sectorList(rows: Observation[]): string {
  const sectors = new Set(rows.filter((row) => !sectorRange(row)).map(sequenceOf).filter((sector) => sector !== undefined));
  return [...sectors].sort((a, b) => a - b).join(', ');
}

/** The newest `limit` observations as text, plus the line that introduces them. */
function observationListing(rows: Observation[], limit: number, hint: string): { footer: string; listing: TextContent } {
  const sorted = [...rows].sort((a, b) => (b.t_min ?? -Infinity) - (a.t_min ?? -Infinity) || String(a.obsid).localeCompare(String(b.obsid)));
  const shown = sorted.slice(0, limit);
  return {
    footer:
      `Showing the ${shown.length} most recent${shown.length < rows.length ? `; ${hint}` : ''}. ` +
      'Pass an obsid to nasa_mast_products to list its files and download links.',
    listing: boundedText(shown.map(observationLine).join('\n'), SERVICE, 'Lower limit.')
  };
}

const DATAPRODUCT_TYPES = ['image', 'spectrum', 'timeseries', 'cube', 'measurements'] as const;

export const mastObservationsInputSchema = z
  .strictObject({
    ...targetShape,
    radius_arcsec: z
      .number()
      .positive()
      .max(600)
      .default(10)
      .describe(
        'Search radius in arcseconds (default 10, max 600). For TESS light curves, TIC stars within this radius are matched; ' +
          'otherwise observations whose footprint overlaps the circle match.'
      ),
    collection: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_]+$/, 'must be a MAST collection name such as TESS, HST or JWST, or "all"')
      .default('TESS')
      .describe(
        'MAST collection (mission), e.g. TESS, HST, JWST, Kepler, K2, GALEX, SWIFT, PS1 or HLSP (high-level science products). "all" searches every collection. ' +
          'TESS light curve searches also include TESS high-level science products such as QLP and TESS-SPOC.'
      ),
    dataproduct_type: z
      .enum(DATAPRODUCT_TYPES)
      .describe('Only this data product type. For TESS, light curves (timeseries) are listed by default; image lists full-frame image observations, which nasa_tess_ffi covers faster.')
      .optional(),
    limit: z.int().min(1).max(200).default(25).describe('How many observations to list, newest first (1-200). Counts in the summary cover all matches.')
  })
  .superRefine(checkTarget);

type ObservationsArgs = z.output<typeof mastObservationsInputSchema>;

const TIC_NAME = /^TIC\s*(\d{1,11})$/i;
const MAX_TIC_STARS = 50;

interface TicStar {
  ID?: number | string | null;
  Tmag?: number | null;
  dstArcSec?: number | null;
}

function ticLabel(star: TicStar): string {
  const details = [
    typeof star.Tmag === 'number' ? `Tmag ${star.Tmag.toFixed(2)}` : undefined,
    typeof star.dstArcSec === 'number' ? `${star.dstArcSec.toFixed(1)}″ away` : undefined
  ].filter(Boolean);
  return `TIC ${star.ID}${details.length ? ` (${details.join(', ')})` : ''}`;
}

/**
 * TESS light curves (SPOC and high-level products) carry the TIC ID as their
 * target name. Matching TIC stars first and filtering on that ID takes about a
 * second, where MAST's footprint search has taken over a minute for TESS.
 */
async function tessLightCurves(ctx: ToolContext, args: ObservationsArgs): Promise<ToolOutput> {
  const ticName = args.tic_id ?? (args.target ? TIC_NAME.exec(args.target)?.[1] : undefined);
  const notes: string[] = [];
  let ids: string[];
  let where: string;
  let target: ResolvedTarget | undefined;
  if (ticName !== undefined) {
    ids = [String(Number(ticName))];
    where = `TIC ${ids[0]}`;
  } else {
    target = await resolveTarget(ctx, args);
    const radius = `${formatNumber(args.radius_arcsec)}″`;
    const cone = await mastQuery<TicStar>(ctx, 'Mast.Catalogs.Tic.Cone', { ra: target.ra, dec: target.dec, radius: args.radius_arcsec / 3600 }, MAX_TIC_STARS);
    const stars = cone.rows.filter((s) => s.ID !== undefined && s.ID !== null).sort((a, b) => (a.dstArcSec ?? Infinity) - (b.dstArcSec ?? Infinity));
    if (stars.length === 0) {
      return {
        content: [text(`No TESS Input Catalog stars lie within ${radius} of ${target.label}. Raise radius_arcsec, or use nasa_tess_ffi for full-frame image coverage.`)]
      };
    }
    ids = stars.map((s) => String(s.ID));
    where = `TIC stars within ${radius} of ${target.label}`;
    notes.push(`Matched ${stars.map(ticLabel).join('; ')}${cone.total > stars.length ? ` (the first ${stars.length} of ${cone.total}; lower radius_arcsec)` : ''}.`);
  }

  const filters = [
    { paramName: 'target_name', values: ids },
    { paramName: 'obs_collection', values: ['TESS', 'HLSP'] },
    { paramName: 'filters', values: ['TESS'] },
    { paramName: 'dataproduct_type', values: ['timeseries'] }
  ];
  const query = { columns: OBSERVATION_COLUMNS, filters };
  const { rows, total, source } = await mastQuery<Observation>(ctx, 'Mast.Caom.Filtered', query, MAX_OBSERVATION_ROWS);
  const resource = {
    name: `TESS light curves for ${where}`,
    mimeType: 'application/json',
    text: json({ source, target, tic_ids: ids, query, total, observations: rows }),
    source
  };
  if (rows.length === 0) {
    return {
      content: [text([`No TESS light curves in MAST for ${where}.`, ...notes, 'Full-frame images may still cover it: try nasa_tess_ffi.'].join('\n'))],
      resource
    };
  }

  const lines = [`${plural(total, 'TESS light curve observation')} in MAST for ${where}.` + (rows.length < total ? ` Counts below cover the first ${rows.length}.` : ''), ...notes];
  const mission = rows.filter((r) => r.obs_collection?.toUpperCase() === 'TESS');
  if (mission.length) {
    const cadences = [...new Set(mission.map((r) => r.t_exptime).filter((v): v is number => typeof v === 'number'))].sort((a, b) => b - a);
    const cadenceText = cadences.length ? ` (cadence ${cadences.map((c) => `${Number(c.toFixed(1))} s`).join(', ')})` : '';
    lines.push(`TESS mission (SPOC) target light curves: sectors ${sectorList(mission)}${cadenceText}.`);
  }
  const pipelines = new Map<string, Observation[]>();
  for (const row of rows) {
    if (row.obs_collection?.toUpperCase() === 'TESS') continue;
    const name = row.provenance_name ?? 'unnamed';
    pipelines.set(name, [...(pipelines.get(name) ?? []), row]);
  }
  if (pipelines.size) {
    const groups = [...pipelines]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, group]) => (sectorList(group) ? `${name} sectors ${sectorList(group)}` : `${name} (no sector number)`));
    lines.push(`High-level science product (HLSP) light curves: ${groups.join('; ')}.`);
  }
  lines.push('For full-frame image coverage and cutouts, use nasa_tess_ffi.');
  const { footer, listing } = observationListing(rows, args.limit, 'raise limit to see others');
  lines.push(footer);
  return { content: [text(lines.join('\n')), listing], resource };
}

async function positionSearch(ctx: ToolContext, args: ObservationsArgs, collection: string | undefined): Promise<ToolOutput> {
  const target = await resolveTarget(ctx, args);
  const filters = [
    ...(collection ? [{ paramName: 'obs_collection', values: [collection] }] : []),
    ...(args.dataproduct_type ? [{ paramName: 'dataproduct_type', values: [args.dataproduct_type] }] : [])
  ];
  const position = [target.ra, target.dec, args.radius_arcsec / 3600].map(formatNumber).join(', ');
  const query = { columns: OBSERVATION_COLUMNS, filters, position };
  const { rows, total, source } = await mastQuery<Observation>(ctx, 'Mast.Caom.Filtered.Position', query, MAX_OBSERVATION_ROWS);

  const scope = [collection ?? 'MAST', args.dataproduct_type].filter(Boolean).join(' ');
  const where = `within ${formatNumber(args.radius_arcsec)}″ of ${target.label}`;
  const resource = {
    name: `MAST observations ${scope} ${where}`,
    mimeType: 'application/json',
    text: json({ source, target, query, total, observations: rows }),
    source
  };
  if (rows.length === 0) return { content: [text(`No ${scope} observations ${where}.`)], resource };

  const lines = [
    `${plural(total, `${scope} observation`)} ${where}.` + (rows.length < total ? ` Counts below cover the first ${rows.length}; narrow the search to see all.` : ''),
    ...(collection ? [] : [`By collection: ${countBy(rows, (r) => r.obs_collection ?? undefined)}.`]),
    `By type: ${countBy(rows, (r) => r.dataproduct_type ?? undefined)}.`
  ];
  const lightCurveSectors = sectorList(rows.filter((r) => isTess(r) && r.dataproduct_type === 'timeseries'));
  const ffiSectors = sectorList(rows.filter((r) => isTess(r) && r.dataproduct_type === 'image'));
  if (lightCurveSectors) lines.push(`TESS sectors with light curves: ${lightCurveSectors}.`);
  if (ffiSectors) lines.push(`TESS sectors with full-frame images: ${ffiSectors} (use nasa_tess_ffi for cutouts).`);
  const { footer, listing } = observationListing(rows, args.limit, 'raise limit or set dataproduct_type to see others');
  lines.push(footer);
  return { content: [text(lines.join('\n')), listing], resource };
}

export const mastObservationsTool = defineTool({
  name: 'nasa_mast_observations',
  title: 'MAST observations (TESS, Hubble, JWST, Kepler and more)',
  description:
    "Search the Mikulski Archive for Space Telescopes (MAST), NASA's archive for TESS, Hubble, JWST, Kepler/K2 and other missions, for observations " +
    'of a named object, a TIC ID or a sky position. For TESS (the default) it lists light curves of the matching TIC stars with their sectors: ' +
    'SPOC 2-minute and 20-second light curves and high-level science product (HLSP) light curves such as QLP and TESS-SPOC, made from full-frame images. ' +
    "Other collections and data product types use MAST's position search, which can take a minute when MAST is busy. " +
    'Returns obsid values for nasa_mast_products (files and download links). No API key needed.',
  inputSchema: mastObservationsInputSchema,
  annotations: READ_ONLY_REMOTE,
  async handler({ args, ctx }) {
    const collection = args.collection.toLowerCase() === 'all' ? undefined : args.collection;
    if (collection?.toUpperCase() === 'TESS' && (args.dataproduct_type ?? 'timeseries') === 'timeseries') return tessLightCurves(ctx, args);
    return positionSearch(ctx, args, collection);
  }
});

interface Product {
  obsID?: string | number;
  parent_obsid?: string | number;
  obs_id?: string | null;
  description?: string | null;
  dataURI?: string | null;
  productType?: string | null;
  productGroupDescription?: string | null;
  productSubGroupDescription?: string | null;
  productFilename?: string | null;
  size?: number | null;
  dataRights?: string | null;
  calib_level?: number | null;
}

const PRODUCT_TYPES = ['science', 'info', 'preview', 'auxiliary'] as const;
const MINIMUM_RECOMMENDED = 'Minimum Recommended Products';

export function formatBytes(bytes: unknown): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return 'size unknown';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return unit === 0 ? `${value} B` : `${value.toFixed(1)} ${units[unit]}`;
}

/** MAST data URIs (mast:...) become anonymous download links; other https URIs are kept. */
export function downloadUrl(dataUri: string | null | undefined): string | undefined {
  if (!dataUri) return undefined;
  if (dataUri.startsWith('mast:')) return `${MAST_DOWNLOAD_URL}?uri=${encodeURIComponent(dataUri)}`;
  return /^https:\/\//i.test(dataUri) ? dataUri : undefined;
}

function productLine(product: Product): string {
  const details = [
    product.productSubGroupDescription,
    product.productType,
    formatBytes(product.size),
    typeof product.calib_level === 'number' ? `level ${product.calib_level}` : undefined,
    product.productGroupDescription === MINIMUM_RECOMMENDED ? 'minimum recommended' : undefined,
    product.dataRights && product.dataRights.toUpperCase() !== 'PUBLIC' ? product.dataRights.toUpperCase() : undefined
  ].filter(Boolean);
  const description = product.description ? `: ${product.description}` : '';
  const url = downloadUrl(product.dataURI);
  return `- ${product.productFilename ?? product.dataURI ?? 'unnamed'} (${details.join(', ')})${description}\n  ${url ?? 'no download link'}`;
}

/** obsids look numeric, so callers often send numbers; they are kept as text. */
const obsidList = (value: unknown) => {
  const asText = (item: unknown) => (typeof item === 'number' ? String(item) : item);
  return listInput((item) => item)(Array.isArray(value) ? value.map(asText) : asText(value));
};

export const mastProductsInputSchema = z.strictObject({
  obsids: z
    .preprocess(obsidList, z.array(z.string().regex(/^\d{1,15}$/, 'must be a numeric MAST obsid such as 176755222')).min(1).max(20))
    .describe('1-20 numeric obsid values from nasa_mast_observations (not the obs_id text). A comma-separated string also works.'),
  product_types: z
    .preprocess(listInput(), z.array(z.enum(PRODUCT_TYPES)).min(1).max(PRODUCT_TYPES.length))
    .default(['science'])
    .describe('Product types to list (default science): science, info (for example TESS data validation reports), preview and auxiliary.'),
  subgroups: z
    .preprocess(listInput((item) => item.toUpperCase()), z.array(z.string().regex(/^[A-Z0-9_]+$/, 'must be a product subgroup such as LC, TP, DRZ or X1D')).min(1).max(20))
    .describe(
      'Only these product subgroups, e.g. ["LC"] for TESS light curves, ["TP"] for target pixel files, ["DRZ", "FLT"] for Hubble images or ["X1D"] for spectra. ' +
        'High-level science products (HLSP) have no subgroup, so this filter leaves them out.'
    )
    .optional(),
  minimum_recommended: z.boolean().default(false).describe("Only MAST's minimum recommended products (useful for Hubble and JWST, which list many intermediate files)."),
  limit: z.int().min(1).max(500).default(50).describe('How many products to list (1-500).')
});

export const mastProductsTool = defineTool({
  name: 'nasa_mast_products',
  title: 'MAST data products and download links',
  description:
    'List the files of MAST observations (from nasa_mast_observations), such as TESS light curves and target pixel files or Hubble and JWST images and spectra, ' +
    'with type, size and a download URL for each. Files are not downloaded or embedded. No API key needed.',
  inputSchema: mastProductsInputSchema,
  annotations: READ_ONLY_REMOTE,
  async handler({ args, ctx }) {
    const obsids = [...new Set(args.obsids)];
    const { rows, total, source } = await mastQuery<Product>(ctx, 'Mast.Caom.Products', { obsid: obsids.join(',') }, MAX_PRODUCT_ROWS);
    const seen = new Set<string>();
    const products = rows.filter((p) => {
      const key = p.dataURI ?? `${p.obsID}/${p.productFilename}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const types = new Set<string>(args.product_types);
    const subgroups = args.subgroups ? new Set(args.subgroups) : undefined;
    const matches = products.filter(
      (p) =>
        types.has((p.productType ?? '').toLowerCase()) &&
        (!subgroups || subgroups.has((p.productSubGroupDescription ?? '').toUpperCase())) &&
        (!args.minimum_recommended || p.productGroupDescription === MINIMUM_RECOMMENDED)
    );
    const order = new Map(obsids.map((id, index) => [id, index]));
    matches.sort(
      (a, b) =>
        (order.get(String(a.parent_obsid)) ?? obsids.length) - (order.get(String(b.parent_obsid)) ?? obsids.length) ||
        (b.calib_level ?? 0) - (a.calib_level ?? 0) ||
        String(a.productFilename).localeCompare(String(b.productFilename))
    );
    const shown = matches.slice(0, args.limit);

    const filterLabel = [
      `types ${args.product_types.join('/')}`,
      args.subgroups ? `subgroups ${args.subgroups.join('/')}` : undefined,
      args.minimum_recommended ? 'minimum recommended only' : undefined
    ].filter(Boolean).join(', ');
    if (products.length === 0) {
      return {
        content: [text(`MAST lists no products for obsid ${obsids.join(', ')}. Check the obsid values from nasa_mast_observations.`)],
        resource: { name: `MAST products for obsid ${obsids.join(',')}`, mimeType: 'application/json', text: json({ source, obsids, total, products: [] }), source }
      };
    }
    const lines = [
      `${products.length} products for obsid ${obsids.join(', ')}` +
        (rows.length < total ? ` (the first ${rows.length} of ${total})` : '') +
        `; ${matches.length} match ${filterLabel}.` +
        (matches.length ? ` Matching files total ${formatBytes(matches.reduce((sum, p) => sum + (p.size ?? 0), 0))}.` : '')
    ];
    const withProducts = new Set(products.map((p) => String(p.parent_obsid)));
    const empty = obsids.filter((id) => !withProducts.has(id));
    if (empty.length) lines.push(`No products are listed for obsid ${empty.join(', ')}.`);
    if (matches.length) lines.push(`By subgroup: ${countBy(matches, (p) => p.productSubGroupDescription ?? 'none')}.`);
    const others = products.filter((p) => !types.has((p.productType ?? '').toLowerCase()));
    if (others.length) lines.push(`Not listed because of product_types: ${countBy(others, (p) => p.productType?.toLowerCase())}.`);
    if (shown.some((p) => p.dataRights && p.dataRights.toUpperCase() !== 'PUBLIC')) {
      lines.push('Files marked EXCLUSIVE_ACCESS are still proprietary and need a MAST token to download.');
    }
    if (shown.length < matches.length) lines.push(`Showing ${shown.length}; raise limit or add subgroups to see others.`);
    return {
      content: [text(lines.join('\n')), ...(shown.length ? [boundedText(shown.map(productLine).join('\n'), SERVICE, 'Lower limit or add subgroups.')] : [])],
      resource: {
        name: `MAST products for obsid ${obsids.join(',')}`,
        mimeType: 'application/json',
        text: json({ source, obsids, total, products: matches.map((p) => ({ ...p, download_url: downloadUrl(p.dataURI) })) }),
        source
      }
    };
  }
});
