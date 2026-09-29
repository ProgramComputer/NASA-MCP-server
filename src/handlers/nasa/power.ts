import { z } from 'zod';
import { defineTool, READ_ONLY_REMOTE } from '../../tools/types';
import { httpRequest } from '../../util/http';
import { boundedText, buildUrl, json, sourceInfo, text } from '../common';

const SERVICE = 'NASA POWER API';
const POINT_URL = 'https://power.larc.nasa.gov/api/temporal/daily/point';

function isCompactDate(value: string): boolean {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (!match) return false;
  const [y, m, d] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

const compactDate = (description: string) =>
  z.string().refine(isCompactDate, { message: 'must be a valid date in YYYYMMDD format' }).describe(description);

export const powerInputSchema = z
  .strictObject({
    parameters: z
      .string()
      .regex(/^[A-Za-z0-9_]+(,[A-Za-z0-9_]+)*$/, 'must be comma-separated POWER parameter names, e.g. T2M,PRECTOTCORR')
      .describe('Comma-separated POWER parameters, e.g. T2M,PRECTOTCORR,WS10M.'),
    community: z
      .preprocess((value) => (typeof value === 'string' ? value.toUpperCase() : value), z.enum(['RE', 'SB', 'AG']))
      .describe('User community: RE (renewable energy), SB (sustainable buildings), AG (agroclimatology).'),
    latitude: z.number().min(-90).max(90).describe('Latitude in decimal degrees.'),
    longitude: z.number().min(-180).max(180).describe('Longitude in decimal degrees.'),
    start: compactDate('Start date (YYYYMMDD).'),
    end: compactDate('End date (YYYYMMDD).'),
    format: z.enum(['json', 'csv']).default('json').describe('Response format.'),
    time_standard: z
      .enum(['utc', 'lst'])
      .describe('Time standard for daily values; POWER defaults to LST (local solar time) when omitted.')
      .optional()
  })
  .superRefine((args, ctx) => {
    if (args.start > args.end) ctx.addIssue({ code: 'custom', path: ['end'], message: 'end must not be before start' });
  });

type PowerArgs = z.output<typeof powerInputSchema>;

/* eslint-disable @typescript-eslint/no-explicit-any -- loosely typed upstream JSON */
function formatPower(data: any, args: PowerArgs): string {
  const header = data?.header ?? {};
  const parameterData = data?.properties?.parameter ?? {};
  const coordinates = data?.geometry?.coordinates;
  let out = `# NASA POWER daily data\n\n`;
  out += `**Community:** ${args.community}\n`;
  out += `**Location:** ${Array.isArray(coordinates) ? `lat ${coordinates[1]}, lon ${coordinates[0]}` : `lat ${args.latitude}, lon ${args.longitude}`}\n`;
  out += `**Dates:** ${header.start ?? args.start} to ${header.end ?? args.end}\n\n`;
  for (const key of args.parameters.split(',')) {
    const info = data?.parameters?.[key] ?? header.parameter_information?.[key] ?? {};
    const series = parameterData[key];
    out += `## ${info.longname ?? info.long_name ?? key} (${key})\n- Units: ${info.units ?? 'unknown'}\n`;
    if (series && typeof series === 'object') {
      const dates = Object.keys(series).sort();
      out += '| Date | Value |\n|------|-------|\n';
      for (const date of dates) out += `| ${date} | ${series[date]} |\n`;
      out += '\n';
    } else {
      out += '- No values returned for this parameter.\n\n';
    }
  }
  if (typeof header.fill_value !== 'undefined') out += `Fill value (missing data): ${header.fill_value}\n`;
  return out;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const powerTool = defineTool({
  name: 'nasa_power',
  title: 'NASA POWER daily point data',
  description: 'Daily solar and meteorological data for a point from NASA POWER (Prediction Of Worldwide Energy Resources).',
  inputSchema: powerInputSchema,
  annotations: READ_ONLY_REMOTE,
  async handler({ args, ctx }) {
    const url = buildUrl(POINT_URL, {
      parameters: args.parameters,
      community: args.community,
      latitude: args.latitude,
      longitude: args.longitude,
      start: args.start,
      end: args.end,
      format: args.format,
      'time-standard': args.time_standard
    });
    const response = await httpRequest(ctx.fetch, { service: SERVICE, url, timeoutMs: 60_000 });
    const source = sourceInfo(ctx, SERVICE, response.url);
    const hint = 'Request fewer days or parameters.';
    if (args.format === 'csv') {
      const body = response.text();
      return {
        content: [text(`NASA POWER CSV for lat ${args.latitude}, lon ${args.longitude}, ${args.start}-${args.end}.`), boundedText(body, SERVICE, hint)],
        resource: { name: `POWER ${args.parameters} ${args.start}-${args.end}`, mimeType: 'text/csv', text: body, source }
      };
    }
    const data = response.json<unknown>();
    return {
      content: [boundedText(formatPower(data, args), SERVICE, hint)],
      resource: { name: `POWER ${args.parameters} ${args.start}-${args.end}`, mimeType: 'application/json', text: json({ source, data }), source }
    };
  }
});
