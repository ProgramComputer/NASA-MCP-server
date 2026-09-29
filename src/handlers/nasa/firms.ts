import { z } from 'zod';
import { defineTool, READ_ONLY_REMOTE, type ToolContext, type ToolOutput } from '../../tools/types';
import { ConfigurationError, ToolInputError, UpstreamError } from '../../util/errors';
import { CsvParseError, parseCsv } from '../../util/csv';
import { httpRequest, looksLikeHtml, summarizeErrorBody } from '../../util/http';
import { redact } from '../../util/redact';
import { boundingBoxSchema, formatBoundingBox, isoDate, todayUtc, daysBetween, type BoundingBox } from '../../util/validation';
import { json, text } from '../common';

const SERVICE = 'NASA FIRMS Area API';
export const FIRMS_BASE_URL = 'https://firms.modaps.eosdis.nasa.gov';
const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;
const KM_PER_DEGREE_LAT = 111.32;

export const FIRMS_SOURCES = [
  'LANDSAT_NRT',
  'MODIS_NRT',
  'MODIS_SP',
  'VIIRS_NOAA20_NRT',
  'VIIRS_NOAA20_SP',
  'VIIRS_NOAA21_NRT',
  'VIIRS_SNPP_NRT',
  'VIIRS_SNPP_SP'
] as const;

/** Columns FIRMS documents as numeric; everything else stays a string (e.g. acq_time "0130"). */
const NUMERIC_COLUMNS = new Set(['latitude', 'longitude', 'brightness', 'bright_ti4', 'bright_ti5', 'bright_t31', 'scan', 'track', 'frp', 'path', 'row']);

export const firmsInputSchema = z
  .strictObject({
    bbox: boundingBoxSchema
      .describe('Area as west,south,east,north in decimal degrees (preferred). Antimeridian-crossing boxes are rejected.')
      .optional(),
    latitude: z.number().min(-90).max(90).describe('Legacy area center latitude; requires longitude and radius_km.').optional(),
    longitude: z.number().min(-180).max(180).describe('Legacy area center longitude; requires latitude and radius_km.').optional(),
    radius_km: z
      .number()
      .gt(0)
      .max(500)
      .describe('Half-width in kilometres of the box built around latitude/longitude (converted to a bbox before querying).')
      .optional(),
    days: z.int().min(1).max(5).default(1).describe('DAY_RANGE: number of days of detections (1-5).'),
    date: isoDate('First day of the window (YYYY-MM-DD); FIRMS returns [date, date + days - 1]. Omit for the most recent data.').optional(),
    source: z.enum(FIRMS_SOURCES).default('VIIRS_SNPP_NRT').describe('FIRMS sensor/product. *_NRT is near real-time, *_SP is standard processing.'),
    limit: z.int().min(1).max(2000).default(100).describe('Maximum detections returned (1-2000). total_detections reports the full count.')
  })
  .superRefine((args, ctx) => {
    const legacy = args.latitude !== undefined || args.longitude !== undefined || args.radius_km !== undefined;
    if (args.bbox && legacy) {
      ctx.addIssue({ code: 'custom', message: 'use either bbox or latitude/longitude/radius_km, not both' });
    } else if (!args.bbox && !legacy) {
      ctx.addIssue({ code: 'custom', message: 'an area is required: bbox, or latitude + longitude + radius_km' });
    } else if (legacy && (args.latitude === undefined || args.longitude === undefined || args.radius_km === undefined)) {
      ctx.addIssue({ code: 'custom', message: 'latitude, longitude and radius_km must all be provided together (radius_km has explicit kilometre units)' });
    }
  });

export type FirmsArgs = z.output<typeof firmsInputSchema>;

const detectionSchema = z.record(z.string(), z.union([z.string(), z.number(), z.null()]));

export const firmsOutputSchema = z.object({
  status: z.enum(['success', 'no_results', 'error']),
  query: z.object({
    source: z.string(),
    bbox: z.array(z.number()).length(4),
    day_range: z.int(),
    date: z.string().nullable(),
    derived_from: z.object({ latitude: z.number(), longitude: z.number(), radius_km: z.number() }).nullable()
  }),
  total_detections: z.int().nullable(),
  returned_count: z.int(),
  columns: z.array(z.string()),
  detections: z.array(detectionSchema),
  source: z.object({ service: z.string(), url: z.string(), retrieved_at: z.string() }),
  retrieved_at: z.string(),
  warnings: z.array(z.string()),
  error: z
    .object({ kind: z.string(), message: z.string(), http_status: z.int().nullable() })
    .optional()
});

export type FirmsResult = z.output<typeof firmsOutputSchema>;

/**
 * Converts the legacy point + radius into a box. The longitude half-width grows
 * with 1/cos(latitude); boxes that would wrap a pole or the antimeridian are
 * rejected instead of silently querying a different region.
 */
export function pointRadiusToBbox(latitude: number, longitude: number, radiusKm: number): BoundingBox {
  const dLat = radiusKm / KM_PER_DEGREE_LAT;
  const south = latitude - dLat;
  const north = latitude + dLat;
  if (south < -90 || north > 90) {
    throw new ToolInputError('latitude/radius_km reaches past a pole; use an explicit bbox that stops at ±90.');
  }
  const cosLat = Math.cos((latitude * Math.PI) / 180);
  const dLon = radiusKm / (KM_PER_DEGREE_LAT * cosLat);
  const west = longitude - dLon;
  const east = longitude + dLon;
  if (!Number.isFinite(dLon) || west < -180 || east > 180) {
    throw new ToolInputError('longitude/radius_km crosses the antimeridian; FIRMS needs two separate bbox requests for that area.');
  }
  const round = (value: number) => Math.round(value * 1e6) / 1e6;
  return [round(west), round(south), round(east), round(north)];
}

function requireMapKey(ctx: ToolContext): string {
  const key = ctx.config.firmsMapKey;
  if (!key) {
    throw new ConfigurationError(
      'FIRMS_MAP_KEY is not set. FIRMS uses its own MAP_KEY (not NASA_API_KEY); request one at https://firms.modaps.eosdis.nasa.gov/api/map_key/ and set FIRMS_MAP_KEY.'
    );
  }
  if (!/^[A-Za-z0-9]{16,64}$/.test(key)) {
    throw new ConfigurationError('FIRMS_MAP_KEY has an unexpected format (expected 16-64 letters/digits).');
  }
  return key;
}

export interface FirmsRequest {
  url: string;
  bbox: BoundingBox;
  derivedFrom: { latitude: number; longitude: number; radius_km: number } | null;
}

export function buildFirmsRequest(args: FirmsArgs, mapKey: string, baseUrl = FIRMS_BASE_URL): FirmsRequest {
  let bbox: BoundingBox;
  let derivedFrom: FirmsRequest['derivedFrom'] = null;
  if (args.bbox) {
    bbox = args.bbox;
  } else {
    // superRefine guarantees all three are present here.
    derivedFrom = { latitude: args.latitude!, longitude: args.longitude!, radius_km: args.radius_km! };
    bbox = pointRadiusToBbox(derivedFrom.latitude, derivedFrom.longitude, derivedFrom.radius_km);
  }
  const [west, , east] = bbox;
  if (west > east) {
    throw new ToolInputError('bbox crosses the antimeridian (west > east); FIRMS needs two separate requests for that area.');
  }
  const segments = ['api', 'area', 'csv', mapKey, args.source, formatBoundingBox(bbox), String(args.days)];
  if (args.date) segments.push(args.date);
  return { url: `${baseUrl}/${segments.map((s) => encodeURIComponent(s).replace(/%2C/gi, ',')).join('/')}`, bbox, derivedFrom };
}

function parseDetections(body: string): { columns: string[]; rows: Array<Record<string, string | number | null>> } {
  let table;
  try {
    table = parseCsv(body);
  } catch (error) {
    const detail = error instanceof CsvParseError ? error.message : String(error);
    throw new UpstreamError(SERVICE, 'invalid_response', `${SERVICE} returned malformed CSV: ${detail}`);
  }
  if (table.header.length === 0) return { columns: [], rows: [] };
  const columns = table.header.map((name) => name.trim());
  if (!columns.includes('latitude') || !columns.includes('longitude')) {
    throw new UpstreamError(SERVICE, 'invalid_response', `${SERVICE} returned an unexpected response: ${summarizeErrorBody(body, 'text/plain')}`);
  }
  const rows = table.rows.map((values) => {
    const record: Record<string, string | number | null> = {};
    columns.forEach((column, index) => {
      const raw = values[index].trim();
      if (raw === '') {
        record[column] = null;
      } else if (NUMERIC_COLUMNS.has(column) && Number.isFinite(Number(raw))) {
        record[column] = Number(raw);
      } else {
        record[column] = raw;
      }
    });
    return record;
  });
  return { columns, rows };
}

export const firmsTool = defineTool({
  name: 'nasa_firms',
  title: 'NASA FIRMS active fire detections',
  description:
    'Active fire/thermal anomaly detections from NASA FIRMS for a bounding box and 1-5 day window. Requires FIRMS_MAP_KEY (not NASA_API_KEY). ' +
    'The legacy latitude/longitude interface now needs radius_km and is converted to a bbox.',
  inputSchema: firmsInputSchema,
  outputSchema: firmsOutputSchema,
  retiredParameters: {
    radius:
      'radius had no defined units and was never sent to FIRMS in a working form. Use bbox, or latitude + longitude + radius_km (kilometres).'
  },
  annotations: READ_ONLY_REMOTE,
  async handler({ args, ctx }): Promise<ToolOutput> {
    if (args.date) {
      const today = todayUtc(ctx.now());
      if (daysBetween(today, args.date) > 0) {
        throw new ToolInputError(`date ${args.date} is in the future (today is ${today} UTC).`);
      }
    }
    const mapKey = requireMapKey(ctx);
    const request = buildFirmsRequest(args, mapKey);
    const retrievedAt = ctx.now().toISOString();
    const safeUrl = redact(request.url);
    const base: Omit<FirmsResult, 'status' | 'total_detections' | 'returned_count' | 'columns' | 'detections'> = {
      query: {
        source: args.source,
        bbox: [...request.bbox],
        day_range: args.days,
        date: args.date ?? null,
        derived_from: request.derivedFrom
      },
      source: { service: SERVICE, url: safeUrl, retrieved_at: retrievedAt },
      retrieved_at: retrievedAt,
      warnings: []
    };
    if (request.derivedFrom) {
      base.warnings.push(`Area derived from latitude/longitude/radius_km as bbox ${request.bbox.join(',')}.`);
    }

    let result: FirmsResult;
    try {
      const response = await httpRequest(ctx.fetch, { service: SERVICE, url: request.url, maxBytes: MAX_RESPONSE_BYTES, timeoutMs: 60_000 });
      const body = response.text();
      if (looksLikeHtml(body) || /^\s*(invalid|error)\b/i.test(body)) {
        throw new UpstreamError(SERVICE, 'invalid_response', `${SERVICE} reported an error: ${summarizeErrorBody(body, response.contentType)}`, response.status);
      }
      const { columns, rows } = parseDetections(body);
      const detections = rows.slice(0, args.limit);
      if (rows.length > args.limit) {
        base.warnings.push(`Returned the first ${args.limit} of ${rows.length} detections; raise limit (max 2000) or narrow the bbox/days.`);
      }
      result = {
        ...base,
        status: rows.length === 0 ? 'no_results' : 'success',
        total_detections: rows.length,
        returned_count: detections.length,
        columns,
        detections
      };
    } catch (error) {
      if (!(error instanceof UpstreamError)) throw error;
      result = {
        ...base,
        status: 'error',
        total_detections: null,
        returned_count: 0,
        columns: [],
        detections: [],
        error: { kind: error.kind, message: redact(error.message), http_status: error.status ?? null }
      };
      return { isError: true, structuredContent: result, content: [text(result.error!.message), text(json(result))] };
    }

    const window = args.date ? `${args.date} + ${args.days - 1} day(s)` : `most recent ${args.days} day(s)`;
    const summary =
      result.status === 'no_results'
        ? `No FIRMS ${args.source} detections in bbox ${request.bbox.join(',')} for ${window}.`
        : `${result.total_detections} FIRMS ${args.source} detections in bbox ${request.bbox.join(',')} for ${window}; returning ${result.returned_count}.`;
    return {
      structuredContent: result,
      content: [text(summary), text(json(result))],
      resource: { name: `FIRMS ${args.source} ${request.bbox.join(',')} ${window}`, mimeType: 'application/json', text: json(result), source: result.source }
    };
  }
});
