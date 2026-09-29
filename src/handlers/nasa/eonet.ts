import { z } from 'zod';
import { defineTool, READ_ONLY_REMOTE } from '../../tools/types';
import { httpRequest } from '../../util/http';
import { boundedText, buildUrl, json, sourceInfo, text } from '../common';

const SERVICE = 'NASA EONET API';
const EVENTS_URL = 'https://eonet.gsfc.nasa.gov/api/v3/events';

export const eonetInputSchema = z.strictObject({
  category: z
    .string()
    .regex(/^[A-Za-z]+(,[A-Za-z]+)*$/, 'must be one or more EONET category IDs, e.g. wildfires,volcanoes')
    .describe('EONET category ID(s), comma-separated: e.g. wildfires, severeStorms, volcanoes, seaLakeIce.')
    .optional(),
  days: z.int().min(1).max(3650).default(60).describe('Only events active within this many prior days.'),
  source: z
    .string()
    .regex(/^[A-Za-z0-9_]+(,[A-Za-z0-9_]+)*$/, 'must be comma-separated EONET source IDs')
    .describe('EONET source ID(s), comma-separated, e.g. InciWeb,EO.')
    .optional(),
  status: z.enum(['open', 'closed', 'all']).default('all').describe('Event status filter.'),
  limit: z.int().min(1).max(500).default(50).describe('Maximum number of events (1-500).')
});

/* eslint-disable @typescript-eslint/no-explicit-any -- loosely typed upstream JSON */
export const eonetTool = defineTool({
  name: 'nasa_eonet',
  title: 'NASA EONET natural events',
  description:
    'Natural events (wildfires, storms, volcanoes, ice, ...) from the Earth Observatory Natural Event Tracker. Filters are sent exactly as given; no automatic broadening.',
  inputSchema: eonetInputSchema,
  annotations: READ_ONLY_REMOTE,
  async handler({ args, ctx }) {
    const url = buildUrl(EVENTS_URL, {
      category: args.category,
      days: args.days,
      source: args.source,
      status: args.status,
      limit: args.limit
    });
    const response = await httpRequest(ctx.fetch, { service: SERVICE, url });
    const data = response.json<any>();
    const source = sourceInfo(ctx, SERVICE, response.url);
    const events: any[] = Array.isArray(data?.events) ? data.events : [];
    const results = events.map((event) => {
      const geometry: any[] = Array.isArray(event.geometry) ? event.geometry : [];
      const latest = geometry[geometry.length - 1];
      return {
        id: event.id,
        title: event.title,
        closed: event.closed ?? null,
        categories: (event.categories ?? []).map((c: any) => c.id ?? c.title),
        sources: (event.sources ?? []).map((s: any) => ({ id: s.id, url: s.url })),
        geometry_count: geometry.length,
        latest_geometry: latest ? { date: latest.date, type: latest.type, coordinates: latest.coordinates } : null,
        link: event.link ?? null
      };
    });
    const summary = results.length === 0 ? 'No EONET events matched the filters.' : `Found ${results.length} EONET events${results.length === args.limit ? ` (limit ${args.limit} reached)` : ''}.`;
    return {
      content: [text(summary), ...(results.length ? [boundedText(json(results), SERVICE, 'Lower limit or days.')] : [])],
      resource: { name: `EONET events${args.category ? ` (${args.category})` : ''}`, mimeType: 'application/json', text: json({ source, data }), source }
    };
  }
});
/* eslint-enable @typescript-eslint/no-explicit-any */
