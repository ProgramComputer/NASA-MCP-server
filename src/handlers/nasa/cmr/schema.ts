import { z } from 'zod';
import { boundingBoxSchema, isValidLonLat, parseCoordinatePairs } from '../../../util/validation';

export const SEARCH_TYPES = ['collections', 'granules'] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

/** Upstream metadata formats verified against CMR (2026-09-29). */
export const CMR_FORMATS = ['json', 'umm_json', 'atom', 'echo10', 'iso19115', 'kml', 'csv', 'xml', 'native', 'dif', 'dif10', 'opendata', 'stac'] as const;
export type CmrFormat = (typeof CMR_FORMATS)[number];
export const JSON_FORMATS: ReadonlySet<CmrFormat> = new Set(['json', 'umm_json']);
export const COLLECTION_ONLY_FORMATS: ReadonlySet<CmrFormat> = new Set(['dif', 'dif10', 'opendata']);
export const GRANULE_ONLY_FORMATS: ReadonlySet<CmrFormat> = new Set(['stac']);

/** Sort keys accepted by CMR for each search type (verified live). */
export const SORT_KEYS: Record<SearchType, readonly string[]> = {
  collections: ['score', 'usage_score', 'entry_title', 'dataset_id', 'short_name', 'entry_id', 'start_date', 'end_date', 'platform', 'instrument', 'sensor', 'provider', 'revision_date', 'has_granules', 'create-data-date', 'ongoing'],
  granules: ['start_date', 'end_date', 'producer_granule_id', 'readable_granule_name', 'granule_ur', 'revision_date', 'cloud_cover', 'day_night_flag', 'data_size', 'provider', 'platform', 'instrument', 'sensor', 'online_only', 'browsable', 'entry_title', 'short_name', 'version', 'campaign', 'project']
};

export const COLLECTION_FIELDS = ['concept_id', 'title', 'short_name', 'version', 'provider', 'time_start', 'time_end', 'platforms', 'instruments', 'processing_level', 'doi', 'cloud_hosted', 'online_access', 'links', 'summary'] as const;
export const GRANULE_FIELDS = ['concept_id', 'title', 'collection_concept_id', 'provider', 'producer_granule_id', 'time_start', 'time_end', 'day_night_flag', 'cloud_cover', 'online_access', 'browse_available', 'links'] as const;
export const DEFAULT_FIELDS: Record<SearchType, readonly string[]> = {
  collections: COLLECTION_FIELDS.filter((f) => f !== 'summary'),
  granules: GRANULE_FIELDS
};
const ALL_FIELDS = [...new Set<string>([...COLLECTION_FIELDS, ...GRANULE_FIELDS])] as [string, ...string[]];

export const MAX_LIMIT = 100;
export const DEEP_PAGING_LIMIT = 1_000_000;
export const MAX_CURSOR_LENGTH = 8192;

const CONCEPT_ID = /^[A-Z]{1,4}\d+-[A-Za-z0-9_]+$/;
const ISO_DATE_OR_DATETIME = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

const text = (max = 256) => z.string().trim().min(1).max(max);
const oneOrMany = (item: z.ZodType<string>, max: number) =>
  z.union([item, z.array(item).min(1).max(max)]).transform((value) => (Array.isArray(value) ? value : [value]));

const conceptId = z.string().trim().regex(CONCEPT_ID, 'must be a CMR concept ID such as C1996881146-POCLOUD');

/** "start,end" with either side optionally open; ISO 8601 date or date-time. */
export const temporalSchema = z
  .string()
  .trim()
  .superRefine((value, ctx) => {
    const parts = value.split(',');
    if (parts.length !== 2) {
      ctx.addIssue({ code: 'custom', message: 'must be "start,end" (either side may be empty for an open range)' });
      return;
    }
    const [start, end] = parts.map((p) => p.trim());
    if (!start && !end) ctx.addIssue({ code: 'custom', message: 'at least one of start or end is required' });
    for (const [label, part] of [['start', start], ['end', end]] as const) {
      if (part && (!ISO_DATE_OR_DATETIME.test(part) || Number.isNaN(Date.parse(part.length === 10 ? `${part}T00:00:00Z` : part)))) {
        ctx.addIssue({ code: 'custom', message: `${label} "${part}" is not an ISO 8601 date or date-time` });
      }
    }
    if (start && end && Date.parse(start.length === 10 ? `${start}T00:00:00Z` : start) > Date.parse(end.length === 10 ? `${end}T00:00:00Z` : end)) {
      ctx.addIssue({ code: 'custom', message: 'start must not be after end' });
    }
  })
  .describe('Temporal range "start,end" in ISO 8601 (date or date-time, UTC assumed). Either side may be empty, e.g. "2020-01-01T00:00:00Z,".');

const coordinateString = (kind: string, minPairs: number, extra?: (pairs: Array<[number, number]>, ctx: z.RefinementCtx) => void) =>
  z
    .string()
    .trim()
    .max(8000)
    .superRefine((value, ctx) => {
      const pairs = parseCoordinatePairs(value);
      if (!pairs) {
        ctx.addIssue({ code: 'custom', message: `${kind} must be comma-separated lon,lat pairs` });
        return;
      }
      if (pairs.length < minPairs) ctx.addIssue({ code: 'custom', message: `${kind} needs at least ${minPairs} lon,lat points` });
      if (!pairs.every(isValidLonLat)) ctx.addIssue({ code: 'custom', message: `${kind} coordinates must be lon in [-180,180], lat in [-90,90] (order lon,lat)` });
      extra?.(pairs, ctx);
    });

export const cmrInputSchema = z.strictObject({
  search_type: z.enum(SEARCH_TYPES).default('collections').describe('Search collections (datasets) or granules (files).'),
  format: z
    .enum(CMR_FORMATS)
    .default('json')
    .describe('Upstream CMR metadata format. json/umm_json support compact output; others are returned raw. dif, dif10, opendata: collections only; stac: granules only.'),
  response_mode: z
    .enum(['compact', 'raw'])
    .describe('compact (default for json/umm_json): normalized records. raw: upstream metadata as returned (default for other formats).')
    .optional(),
  fields: z
    .array(z.enum(ALL_FIELDS))
    .min(1)
    .max(ALL_FIELDS.length)
    .describe('Compact mode only: normalized fields to return. concept_id is always included. Defaults to all fields except summary.')
    .optional(),
  limit: z.int().min(1).max(MAX_LIMIT).default(10).describe(`Records per page (1-${MAX_LIMIT}).`),
  cursor: z.string().min(1).max(MAX_CURSOR_LENGTH).describe('next_cursor from a previous response. Continue with the cursor alone; omitted filters are restored from it.').optional(),
  page: z.int().min(1).describe('DEPRECATED page-number pagination (CMR page_num). Prefer cursor. Cannot be combined with cursor or offset.').optional(),
  offset: z.int().min(0).describe('DEPRECATED offset pagination. Prefer cursor. Cannot be combined with cursor or page.').optional(),

  keyword: text(1000).describe('Collections only: free-text keyword search.').optional(),
  concept_id: oneOrMany(conceptId, 100).describe('Concept ID(s). For granule searches a collection concept ID (C...) also selects that collection, as in CMR.').optional(),
  collection_concept_id: oneOrMany(conceptId, 100).describe('Granules only: collection concept ID(s) to search within.').optional(),
  entry_title: text(1000).describe('Collection entry title.').optional(),
  short_name: oneOrMany(text(), 20).describe('Collection short name(s).').optional(),
  version: text(80).describe('Collection version.').optional(),
  provider: oneOrMany(text(80), 20).describe('Provider ID(s), e.g. POCLOUD, LPCLOUD.').optional(),
  readable_granule_name: text(1000).describe('Granules only: granule name (supports CMR * and ? wildcards).').optional(),
  producer_granule_id: text(1000).describe('Granules only: producer granule ID.').optional(),

  temporal: temporalSchema.optional(),
  bounding_box: boundingBoxSchema
    .describe('Bounding box west,south,east,north (lon/lat degrees). west > east crosses the antimeridian (supported by CMR).')
    .optional(),
  bbox: boundingBoxSchema.describe('Compatibility alias for bounding_box (sent to CMR as bounding_box).').optional(),
  point: coordinateString('point', 1, (pairs, ctx) => {
    if (pairs.length !== 1) ctx.addIssue({ code: 'custom', message: 'point must be exactly one lon,lat pair' });
  })
    .describe('Point "lon,lat".')
    .optional(),
  polygon: coordinateString('polygon', 4, (pairs, ctx) => {
    const first = pairs[0];
    const last = pairs[pairs.length - 1];
    if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
      ctx.addIssue({ code: 'custom', message: 'polygon must be closed (last point equal to the first)' });
    }
  })
    .describe('Polygon "lon1,lat1,...,lon1,lat1": closed, counter-clockwise (CMR rejects clockwise rings).')
    .optional(),
  line: coordinateString('line', 2).describe('Line "lon1,lat1,lon2,lat2,...".').optional(),
  circle: z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      const numbers = value.split(',').map((p) => Number(p.trim()));
      if (numbers.length !== 3 || numbers.some((n) => !Number.isFinite(n))) {
        ctx.addIssue({ code: 'custom', message: 'circle must be "lon,lat,radius_m"' });
        return;
      }
      if (!isValidLonLat([numbers[0], numbers[1]])) ctx.addIssue({ code: 'custom', message: 'circle center must be lon in [-180,180], lat in [-90,90]' });
      if (numbers[2] < 10 || numbers[2] > 6_000_000) ctx.addIssue({ code: 'custom', message: 'circle radius must be between 10 and 6000000 metres' });
    })
    .describe('Circle "lon,lat,radius" with radius in metres (10-6000000).')
    .optional(),

  platform: oneOrMany(text(), 20).describe('Platform short name(s), e.g. Terra.').optional(),
  instrument: oneOrMany(text(), 20).describe('Instrument short name(s), e.g. MODIS.').optional(),
  project: oneOrMany(text(), 20).describe('Project/campaign short name(s).').optional(),
  processing_level_id: oneOrMany(text(40), 20).describe('Collections only: processing level(s), e.g. 3, L2.').optional(),
  granule_data_format: oneOrMany(text(), 20).describe('Collections only: granule data format(s), e.g. netCDF-4.').optional(),
  cloud_cover: z
    .string()
    .trim()
    .regex(/^(\d+(\.\d+)?)?,(\d+(\.\d+)?)?$/, 'must be "min,max" percentages (either side may be empty)')
    .refine((value) => value.split(',').every((p) => p === '' || Number(p) <= 100), { message: 'cloud cover percentages must be 0-100' })
    .describe('Granules only: cloud cover range "min,max" in percent.')
    .optional(),
  day_night_flag: z
    .preprocess((value) => (typeof value === 'string' ? value.toUpperCase() : value), z.enum(['DAY', 'NIGHT', 'BOTH', 'UNSPECIFIED']))
    .describe('Granules only: DAY, NIGHT, BOTH or UNSPECIFIED.')
    .optional(),
  has_granules: z.boolean().describe('Collections only: require (true) or exclude (false) collections with granules.').optional(),
  cloud_hosted: z.boolean().describe('Collections only: restrict to cloud-hosted (true) or not (false).').optional(),
  doi: text(200).describe('Collections only: DOI, e.g. 10.5067/GHGMR-4FJ04.').optional(),
  downloadable: z.boolean().describe('Only records with (true) or without (false) downloadable data links.').optional(),
  browsable: z.boolean().describe('Only records with (true) or without (false) browse imagery.').optional(),
  online_only: z.boolean().describe('Only online (true) or offline (false) records.').optional(),
  include_facets: z.boolean().describe('Include CMR v2 facets (counts by keyword, platform, ...).').optional(),
  sort_key: oneOrMany(
    z.string().trim().regex(/^[+-]?[a-z_-]+$/, 'must be a CMR sort key, optionally prefixed with - for descending'),
    3
  )
    .describe(
      `Sort key(s), "-" prefix for descending. Collections: ${SORT_KEYS.collections.join(', ')}. Granules: ${SORT_KEYS.granules.join(', ')}.`
    )
    .optional()
});

export type CmrInput = z.output<typeof cmrInputSchema>;

/** Filter/sort fields that define a search (the scope a cursor is bound to). */
export const QUERY_FIELDS = [
  'keyword',
  'concept_id',
  'collection_concept_id',
  'entry_title',
  'short_name',
  'version',
  'provider',
  'readable_granule_name',
  'producer_granule_id',
  'temporal',
  'bounding_box',
  'point',
  'polygon',
  'line',
  'circle',
  'platform',
  'instrument',
  'project',
  'processing_level_id',
  'granule_data_format',
  'cloud_cover',
  'day_night_flag',
  'has_granules',
  'cloud_hosted',
  'doi',
  'downloadable',
  'browsable',
  'online_only',
  'include_facets',
  'sort_key'
] as const;
export type QueryField = (typeof QUERY_FIELDS)[number];

export const COLLECTION_ONLY_FIELDS: ReadonlySet<QueryField> = new Set(['keyword', 'processing_level_id', 'granule_data_format', 'has_granules', 'cloud_hosted', 'doi']);
export const GRANULE_ONLY_FIELDS: ReadonlySet<QueryField> = new Set(['collection_concept_id', 'readable_granule_name', 'producer_granule_id', 'cloud_cover', 'day_night_flag']);
/** CMR refuses granule searches without one of these collection constraints. */
export const GRANULE_COLLECTION_CONSTRAINTS: readonly QueryField[] = ['collection_concept_id', 'concept_id', 'provider', 'short_name', 'version', 'entry_title'];

const linkSchema = z.object({ url: z.string(), type: z.string().nullable(), title: z.string().nullable() });
const nullableString = z.string().nullable();

export const cmrRecordSchema = z.object({
  concept_id: z.string(),
  title: nullableString.optional(),
  short_name: nullableString.optional(),
  version: nullableString.optional(),
  provider: nullableString.optional(),
  collection_concept_id: nullableString.optional(),
  producer_granule_id: nullableString.optional(),
  time_start: nullableString.optional(),
  time_end: nullableString.optional(),
  platforms: z.array(z.string()).nullable().optional(),
  instruments: z.array(z.string()).nullable().optional(),
  processing_level: nullableString.optional(),
  doi: nullableString.optional(),
  cloud_hosted: z.boolean().nullable().optional(),
  online_access: z.boolean().nullable().optional(),
  browse_available: z.boolean().nullable().optional(),
  day_night_flag: nullableString.optional(),
  cloud_cover: z.number().nullable().optional(),
  links: z.array(linkSchema).nullable().optional(),
  summary: nullableString.optional()
});
export type CmrRecord = z.output<typeof cmrRecordSchema>;

export const cmrFacetSchema = z.object({
  name: z.string(),
  values: z.array(z.object({ title: z.string(), count: z.number().nullable() }))
});

export const cmrOutputSchema = z.object({
  status: z.enum(['success', 'no_results', 'error']),
  search_type: z.enum(SEARCH_TYPES),
  format: z.enum(CMR_FORMATS),
  response_mode: z.enum(['compact', 'raw']),
  results: z.array(cmrRecordSchema),
  returned_count: z.int().nullable(),
  total_hits: z.int().nullable(),
  next_cursor: z.string().nullable(),
  facets: z.array(cmrFacetSchema).optional(),
  raw: z.unknown().optional(),
  source: z.object({
    service: z.string(),
    url: z.string(),
    request_id: z.string().nullable(),
    took_ms: z.number().nullable(),
    retrieved_at: z.string()
  }),
  retrieved_at: z.string(),
  warnings: z.array(z.string()),
  error: z.object({ kind: z.string(), message: z.string(), http_status: z.int().nullable() }).optional()
});
export type CmrEnvelope = z.output<typeof cmrOutputSchema>;
