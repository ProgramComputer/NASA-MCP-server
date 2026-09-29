import { z } from 'zod';
import { defineTool, READ_ONLY_REMOTE } from '../../tools/types';
import { httpRequest } from '../../util/http';
import { boundedText, buildUrl, json, sourceInfo, text } from '../common';

const SERVICE = 'NASA Exoplanet Archive TAP';
const TAP_SYNC_URL = 'https://exoplanetarchive.ipac.caltech.edu/TAP/sync';

const noStatementBreak = (field: string) =>
  z
    .string()
    .trim()
    .min(1)
    .refine((value) => !value.includes(';'), { message: `${field} must be a single ADQL fragment (no ';')` });

export const exoplanetInputSchema = z.strictObject({
  table: z
    .string()
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'must be a table name such as ps, pscomppars, cumulative or toi')
    .describe('TAP table, e.g. ps (Planetary Systems), pscomppars, cumulative (Kepler KOI), toi.'),
  select: noStatementBreak('select').describe('Columns to return (ADQL select list). Defaults to *.').optional(),
  where: noStatementBreak('where').describe("ADQL WHERE condition, e.g. disc_year > 2020 and discoverymethod = 'Transit'.").optional(),
  order: noStatementBreak('order').describe('ADQL ORDER BY expression, e.g. pl_name.').optional(),
  limit: z.int().min(1).max(1000).default(100).describe('Maximum rows (1-1000).'),
  format: z.enum(['json', 'csv']).default('json').describe('Result format.')
});

export const exoplanetTool = defineTool({
  name: 'nasa_exoplanet',
  title: 'NASA Exoplanet Archive query',
  description:
    'Query the NASA Exoplanet Archive through its TAP service (ADQL). Tables use current TAP names such as ps, pscomppars, cumulative and toi.',
  inputSchema: exoplanetInputSchema,
  annotations: READ_ONLY_REMOTE,
  async handler({ args, ctx }) {
    const query =
      `select top ${args.limit} ${args.select ?? '*'} from ${args.table}` +
      (args.where ? ` where ${args.where}` : '') +
      (args.order ? ` order by ${args.order}` : '');
    const url = buildUrl(TAP_SYNC_URL, { query, format: args.format });
    const response = await httpRequest(ctx.fetch, { service: SERVICE, url });
    const source = sourceInfo(ctx, SERVICE, response.url);
    if (args.format === 'csv') {
      const body = response.text();
      return {
        content: [text(`Exoplanet Archive CSV result for: ${query}`), boundedText(body, SERVICE, 'Lower limit or select fewer columns.')],
        resource: { name: `Exoplanet ${args.table} query`, mimeType: 'text/csv', text: body, source }
      };
    }
    const rows = response.json<unknown[]>();
    if (!Array.isArray(rows)) {
      throw new Error('Exoplanet Archive returned an unexpected JSON payload (expected an array of rows)');
    }
    const summary =
      rows.length === 0 ? `No rows matched in ${args.table}.` : `Found ${rows.length} rows from ${args.table}${rows.length === args.limit ? ` (limit ${args.limit} reached)` : ''}.`;
    return {
      content: [text(`${summary}\nQuery: ${query}`), ...(rows.length ? [boundedText(json(rows), SERVICE, 'Lower limit or select fewer columns.')] : [])],
      resource: { name: `Exoplanet ${args.table} query`, mimeType: 'application/json', text: json({ source, query, rows }), source }
    };
  }
});
