import { z } from 'zod';
import { defineTool, READ_ONLY_REMOTE } from '../../tools/types';
import { httpRequest } from '../../util/http';
import { boundedText, buildUrl, json, sourceInfo } from '../common';

const SERVICE = 'TLE API';
/** Listed in the api.nasa.gov catalog; data comes from CelesTrak and is refreshed daily. No key. */
const TLE_API_BASE_URL = 'https://tle.ivanstanojevic.me/api/tle';

export const tleInputSchema = z
  .strictObject({
    satellite_id: z.int().min(1).max(999_999_999).describe('NORAD catalog number, e.g. 25544 for the ISS. Cannot be combined with search options.').optional(),
    search: z.string().trim().min(1).max(100).describe('Search satellite names, e.g. "ISS" or "HUBBLE". Omit to browse all records.').optional(),
    sort: z.enum(['popularity', 'name', 'id', 'inclination', 'eccentricity', 'period']).describe('Sort field for searches (upstream default popularity).').optional(),
    sort_dir: z.enum(['asc', 'desc']).describe('Sort direction (upstream default desc).').optional(),
    page: z.int().min(1).max(100_000).describe('Result page (1-based).').optional(),
    page_size: z.int().min(1).max(100).describe('Records per page (1-100, upstream default 20).').optional()
  })
  .superRefine((args, ctx) => {
    const searchOptions = [args.search, args.sort, args.sort_dir, args.page, args.page_size].some((value) => value !== undefined);
    if (args.satellite_id !== undefined && searchOptions) {
      ctx.addIssue({ code: 'custom', message: 'satellite_id cannot be combined with search, sort, sort_dir, page or page_size' });
    }
  });

interface TleRecord {
  satelliteId?: number;
  name?: string;
  date?: string;
  line1?: string;
  line2?: string;
}

interface TleCollection {
  totalItems?: number;
  member?: TleRecord[];
  parameters?: { page?: number; 'page-size'?: number };
  view?: { next?: string };
}

function describe(record: TleRecord): string {
  return `## ${record.name ?? 'Unnamed'} (NORAD ${record.satelliteId ?? '?'})\nEpoch: ${record.date ?? 'unknown'}\n${record.line1 ?? ''}\n${record.line2 ?? ''}`;
}

export const tleTool = defineTool({
  name: 'nasa_tle',
  title: 'Satellite two-line element sets',
  description:
    'Two-line element sets (TLE) for Earth-orbiting satellites from the TLE API in the api.nasa.gov catalog (tle.ivanstanojevic.me; CelesTrak data refreshed daily): ' +
    'one satellite by NORAD catalog number, or a paged name search. No API key needed.',
  inputSchema: tleInputSchema,
  annotations: READ_ONLY_REMOTE,
  async handler({ args, ctx }) {
    if (args.satellite_id !== undefined) {
      const response = await httpRequest(ctx.fetch, { service: SERVICE, url: `${TLE_API_BASE_URL}/${args.satellite_id}` });
      const data = response.json<TleRecord>();
      const source = sourceInfo(ctx, SERVICE, response.url);
      return {
        content: [boundedText(describe(data), SERVICE, '')],
        resource: { name: `TLE ${args.satellite_id}`, mimeType: 'application/json', text: json({ source, data }), source }
      };
    }

    // The collection lives at /api/tle/ (without the slash the API redirects).
    const url = buildUrl(`${TLE_API_BASE_URL}/`, {
      search: args.search,
      sort: args.sort,
      'sort-dir': args.sort_dir,
      page: args.page,
      'page-size': args.page_size
    });
    const response = await httpRequest(ctx.fetch, { service: SERVICE, url });
    const data = response.json<TleCollection>();
    const source = sourceInfo(ctx, SERVICE, response.url);
    const members = Array.isArray(data.member) ? data.member : [];
    const total = data.totalItems ?? members.length;
    const page = data.parameters?.page ?? args.page ?? 1;
    const pageSize = data.parameters?.['page-size'] ?? args.page_size ?? 20;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const label = args.search ? ` matching "${args.search}"` : '';
    const summary =
      total === 0
        ? `No TLE records${label}.`
        : `${total} TLE records${label}; page ${page} of ${pages} (${members.length} shown)${data.view?.next ? `. Next: page ${page + 1}` : ''}.`;
    return {
      content: [boundedText([summary, ...members.map(describe)].join('\n\n'), SERVICE, 'Use a smaller page_size.')],
      resource: { name: `TLE search${label || ' (all)'} page ${page}`, mimeType: 'application/json', text: json({ source, data }), source }
    };
  }
});
