import { z } from 'zod';
import { defineTool, READ_ONLY_REMOTE, type ToolContext } from '../../tools/types';
import { ToolInputError, UpstreamError } from '../../util/errors';
import { httpRequest } from '../../util/http';
import { isoDate, listInput } from '../../util/validation';
import { boundedText, buildUrl, json, sourceInfo, text, type QueryValue } from '../common';

const SERVICE = 'NASA Satellite Situation Center';
const SSC_API_BASE_URL = 'https://sscweb.gsfc.nasa.gov/WS/sscr/2';
const COORDINATE_SYSTEMS = ['geo', 'gm', 'gse', 'gsm', 'sm', 'geitod', 'geij2000'] as const;
const MAX_SPAN_DAYS = 366;
/** SSC's finest observatory resolution, used to bound the number of returned points. */
const FINEST_RESOLUTION_SECONDS = 60;
/** Upper bound on numbers returned by one locations call (keeps text output bounded). */
const MAX_VALUES = 8000;

/**
 * SSC answers with Jackson "typed" JSON, where arrays and objects are wrapped
 * as ["java.util.ArrayList", [...]] or ["gov.nasa...ClassName", {...}].
 */
const JAVA_TYPE = /^(?:java|javax|gov)\.[\w.$]+$/;
export function unwrapTypedJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    if (value.length === 2 && typeof value[0] === 'string' && JAVA_TYPE.test(value[0])) return unwrapTypedJson(value[1]);
    return value.map(unwrapTypedJson);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, unwrapTypedJson(item)]));
  }
  return value;
}

async function sscGet(ctx: ToolContext, path: string, params: Record<string, QueryValue> = {}) {
  const response = await httpRequest(ctx.fetch, {
    service: SERVICE,
    url: buildUrl(`${SSC_API_BASE_URL}${path}`, params),
    headers: { accept: 'application/json' }
  });
  return { data: unwrapTypedJson(response.json<unknown>()), source: sourceInfo(ctx, SERVICE, response.url) };
}

const UTC_TIME = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?Z)?$/;

/** Parses YYYY-MM-DD or YYYY-MM-DDTHH:MM[:SS]Z as UTC; null for anything else. */
export function parseUtcTime(value: string): Date | null {
  const match = UTC_TIME.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1).map((part) => Number(part ?? 0));
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const roundTrips =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day &&
    date.getUTCHours() === hour && date.getUTCMinutes() === minute && date.getUTCSeconds() === second;
  return roundTrips ? date : null;
}

const utcTime = (description: string) =>
  z.string().refine((value) => parseUtcTime(value) !== null, { message: 'must be a UTC time like 2026-09-29T12:00:00Z, or a date like 2026-09-29 (meaning 00:00 UTC)' }).describe(description);

/** 2026-09-29T00:00:00.000Z -> 20260929T000000Z (the form SSC's REST paths use). */
const sscTime = (date: Date) => date.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/[-:]/g, '');
const isoTime = (value: unknown) => (typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString().replace('.000Z', 'Z') : String(value));

interface Observatory {
  Id?: string;
  Name?: string;
  Resolution?: number;
  StartTime?: string;
  EndTime?: string;
}

export const sscObservatoriesInputSchema = z.strictObject({
  search: z.string().trim().min(1).max(100).describe('Case-insensitive text to match in the observatory ID or name, e.g. "mms" or "GOES".').optional(),
  active_on: isoDate('Only observatories with location data on this date (YYYY-MM-DD).').optional()
});

export const sscObservatoriesTool = defineTool({
  name: 'nasa_ssc_observatories',
  title: 'Satellite Situation Center spacecraft list',
  description:
    'Spacecraft and other observatories whose locations the NASA Satellite Situation Center (SSCWeb) can compute, with their data time ranges and resolution. ' +
    'Use the IDs with nasa_ssc_locations. No API key needed.',
  inputSchema: sscObservatoriesInputSchema,
  annotations: READ_ONLY_REMOTE,
  async handler({ args, ctx }) {
    const { data, source } = await sscGet(ctx, '/observatories');
    const all = ((data as { Observatory?: Observatory[] }).Observatory ?? []).filter((o) => typeof o.Id === 'string');
    const needle = args.search?.toLowerCase();
    const day = args.active_on;
    const matches = all.filter((o) => {
      if (needle && !`${o.Id} ${o.Name ?? ''}`.toLowerCase().includes(needle)) return false;
      if (day && !((o.StartTime ?? '').slice(0, 10) <= day && day <= (o.EndTime ?? '').slice(0, 10))) return false;
      return true;
    });
    const filters = [needle && `matching "${args.search}"`, day && `with data on ${day}`].filter(Boolean).join(' ');
    const lines = matches.map(
      (o) => `- ${o.Id}: ${o.Name ?? o.Id} (${(o.StartTime ?? '?').slice(0, 10)} to ${(o.EndTime ?? '?').slice(0, 10)}, ${o.Resolution ?? '?'} s resolution)`
    );
    const summary = `${matches.length} of ${all.length} SSC observatories${filters ? ` ${filters}` : ''}.`;
    return {
      content: [boundedText([summary, ...lines].join('\n'), SERVICE, 'Add search or active_on.')],
      resource: { name: `SSC observatories${filters ? ` ${filters}` : ''}`, mimeType: 'application/json', text: json({ source, data: matches }), source }
    };
  }
});

export const sscLocationsInputSchema = z
  .strictObject({
    observatories: z
      .preprocess(listInput(), z.array(z.string().regex(/^[a-z0-9]+$/, 'must be an SSC observatory ID such as iss or mms1')).min(1).max(5))
      .describe('1-5 SSC observatory IDs, e.g. ["iss"] or ["mms1", "moon"] (see nasa_ssc_observatories). A comma-separated string also works.'),
    start_time: utcTime('Start time (UTC), e.g. 2026-09-29T06:00:00Z; a bare date such as 2026-09-29 means 00:00 UTC.'),
    end_time: utcTime(`End time (UTC); at most ${MAX_SPAN_DAYS} days after start_time.`),
    coordinate_systems: z
      .preprocess(listInput(), z.array(z.enum(COORDINATE_SYSTEMS)).min(1).max(COORDINATE_SYSTEMS.length))
      .default(['geo'])
      .describe('Coordinate systems (default geo): geo, gm, gse, gsm, sm, geitod, geij2000. A comma-separated string also works.'),
    resolution_factor: z
      .int()
      .min(1)
      .max(100_000)
      .describe('Return every Nth point of each observatory\'s base resolution (60-720 s). Chosen automatically when omitted to keep the output bounded.')
      .optional()
  })
  .superRefine((args, ctx) => {
    const start = parseUtcTime(args.start_time);
    const end = parseUtcTime(args.end_time);
    if (!start || !end) return;
    if (end <= start) ctx.addIssue({ code: 'custom', path: ['end_time'], message: 'end_time must be after start_time' });
    if (end.getTime() - start.getTime() > MAX_SPAN_DAYS * 86_400_000) {
      ctx.addIssue({ code: 'custom', path: ['end_time'], message: `the time range is limited to ${MAX_SPAN_DAYS} days` });
    }
  });

interface CoordinateData {
  CoordinateSystem?: string;
  X?: number[];
  Y?: number[];
  Z?: number[];
  Latitude?: number[];
  Longitude?: number[];
  LocalTime?: number[];
}

interface SatelliteData {
  Id?: string;
  Time?: string[];
  Coordinates?: CoordinateData[];
  RadialLength?: number[];
}

interface DataResult {
  StatusCode?: string;
  StatusSubCode?: string;
  StatusText?: string[];
  Data?: SatelliteData[];
}

const round = (value: number | undefined, digits: number) => (typeof value === 'number' ? String(Number(value.toFixed(digits))) : '');

function table(satellite: SatelliteData): string {
  const times = satellite.Time ?? [];
  const systems = satellite.Coordinates ?? [];
  const header = ['time_utc'];
  for (const system of systems) {
    const name = system.CoordinateSystem ?? '?';
    header.push(`${name}_x_km`, `${name}_y_km`, `${name}_z_km`, `${name}_lat_deg`, `${name}_lon_deg`, `${name}_local_time_h`);
  }
  header.push('radial_km');
  const rows = times.map((time, i) => {
    const cells = [isoTime(time)];
    for (const s of systems) {
      cells.push(round(s.X?.[i], 1), round(s.Y?.[i], 1), round(s.Z?.[i], 1), round(s.Latitude?.[i], 3), round(s.Longitude?.[i], 3), round(s.LocalTime?.[i], 3));
    }
    cells.push(round(satellite.RadialLength?.[i], 1));
    return cells.join(',');
  });
  return [header.join(','), ...rows].join('\n');
}

export const sscLocationsTool = defineTool({
  name: 'nasa_ssc_locations',
  title: 'Satellite Situation Center spacecraft locations',
  description:
    'Positions of spacecraft (and the Moon and Sun) over a time range from the NASA Satellite Situation Center (SSCWeb), in geophysical coordinate systems ' +
    '(GEO, GM, GSE, GSM, SM, GEI). Returns a CSV table per observatory: X/Y/Z in km, latitude/longitude in degrees, local time in hours and radial distance in km. ' +
    'The resolution factor is raised automatically to keep the output bounded. No API key needed.',
  inputSchema: sscLocationsInputSchema,
  annotations: READ_ONLY_REMOTE,
  async handler({ args, ctx }) {
    const start = parseUtcTime(args.start_time)!;
    const end = parseUtcTime(args.end_time)!;
    const ids = [...new Set(args.observatories)];
    const systems = [...new Set(args.coordinate_systems)];
    const perObservatory = Math.max(1, Math.floor(MAX_VALUES / (ids.length * (6 * systems.length + 2))));
    const basePoints = Math.floor((end.getTime() - start.getTime()) / 1000 / FINEST_RESOLUTION_SECONDS) + 1;
    const needed = Math.max(1, Math.ceil(basePoints / perObservatory));
    if (args.resolution_factor !== undefined && args.resolution_factor < needed) {
      throw new ToolInputError(
        `resolution_factor ${args.resolution_factor} could return about ${Math.ceil(basePoints / args.resolution_factor)} points per observatory; ` +
          `use ${needed} or more, or a shorter time range`
      );
    }
    const factor = args.resolution_factor ?? needed;
    const path = `/locations/${ids.join(',')}/${sscTime(start)},${sscTime(end)}/${systems.join(',')}/`;
    const { data, source } = await sscGet(ctx, path, { resolutionFactor: factor > 1 ? factor : undefined });
    const result = (data as { Result?: DataResult }).Result ?? {};
    if (result.StatusCode !== 'SUCCESS') {
      const detail = result.StatusText?.join('; ') || result.StatusSubCode || 'no status';
      throw new UpstreamError(SERVICE, 'http', `${SERVICE} rejected the request: ${detail}`);
    }
    const satellites = result.Data ?? [];
    const notes = result.StatusSubCode && result.StatusSubCode !== 'SUCCESS' ? [`SSC status: ${result.StatusSubCode}${result.StatusText?.length ? ` (${result.StatusText.join('; ')})` : ''}`] : [];
    const range = `${isoTime(start.toISOString())} to ${isoTime(end.toISOString())}`;
    const summary =
      `SSC locations for ${ids.join(', ')} from ${range}` +
      `${factor > 1 ? ` (resolution factor ${factor}: every ${factor}th point of each observatory's base resolution)` : ''}.` +
      (satellites.length === 0 ? ' No location data was returned for this range.' : '');
    const sections = satellites.map((s) => `## ${s.Id ?? '?'}: ${s.Time?.length ?? 0} points\n${table(s)}`);
    return {
      content: [text([summary, ...notes].join('\n')), ...(sections.length ? [boundedText(sections.join('\n\n'), SERVICE, 'Use a shorter time range or fewer coordinate systems.')] : [])],
      resource: { name: `SSC locations ${ids.join(',')} ${range}`, mimeType: 'application/json', text: json({ source, data: result }), source }
    };
  }
});
