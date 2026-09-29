import { z } from 'zod';
import { defineTool, READ_ONLY_REMOTE, type ToolContext, type ToolOutput } from '../../tools/types';
import { UpstreamError } from '../../util/errors';
import { httpRequest } from '../../util/http';
import { boundedText, buildUrl, json, sourceInfo, text } from '../common';

const SERVICE = 'JPL Horizons API';
const HORIZONS_URL = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const HORIZONS_FILE_URL = 'https://ssd.jpl.nasa.gov/api/horizons_file.api';

const value = (description: string) =>
  z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine((v) => !/['\r\n]/.test(v), { message: 'must not contain quotes or line breaks' })
    .describe(description);

export const horizonsInputSchema = z.strictObject({
  format: z.enum(['json', 'text']).default('json').describe('Response format.'),
  COMMAND: value("Target, e.g. '499' (Mars), '1;' (Ceres), 'C/2020 F3'."),
  OBJ_DATA: z.enum(['YES', 'NO']).describe('Include object data.').optional(),
  MAKE_EPHEM: z.enum(['YES', 'NO']).describe('Generate an ephemeris.').optional(),
  EPHEM_TYPE: z.enum(['OBSERVER', 'VECTORS', 'ELEMENTS']).describe('Ephemeris type.').optional(),
  CENTER: value("Coordinate center, e.g. '500@399' (geocentric).").optional(),
  START_TIME: value("Start time, e.g. '2024-01-01'.").optional(),
  STOP_TIME: value("Stop time, e.g. '2024-01-02'.").optional(),
  STEP_SIZE: value("Step size, e.g. '1d' or '1h'.").optional(),
  QUANTITIES: value("Observer quantities, e.g. 'A' or '1,2,20,23'.").optional(),
  OUT_UNITS: z.enum(['KM-S', 'AU-D', 'KM-D']).describe('Output units for vector/element tables.').optional()
});

export type HorizonsArgs = z.output<typeof horizonsInputSchema>;

function horizonsParams(args: HorizonsArgs): Array<[string, string]> {
  return Object.entries(args)
    .filter(([key, v]) => key !== 'format' && v !== undefined)
    .map(([key, v]) => [key, `'${String(v)}'`]);
}

async function interpret(response: Awaited<ReturnType<typeof httpRequest>>, args: HorizonsArgs, ctx: ToolContext, fileInput: boolean): Promise<ToolOutput> {
  const source = sourceInfo(ctx, SERVICE, response.url);
  const name = `Horizons ${args.COMMAND}${fileInput ? ' (file input)' : ''}`;
  if (args.format === 'text') {
    const body = response.text();
    return { content: [boundedText(body, SERVICE, 'Use a larger STEP_SIZE or shorter time span.')], resource: { name, mimeType: 'text/plain', text: body, source } };
  }
  const data = response.json<{ result?: string; error?: string; signature?: unknown }>();
  if (typeof data.error === 'string') throw new UpstreamError(SERVICE, 'http', `${SERVICE}: ${data.error}`);
  return {
    content: [text(`Horizons result for ${args.COMMAND}.`), boundedText(typeof data.result === 'string' ? data.result : json(data), SERVICE, 'Use a larger STEP_SIZE or shorter time span.')],
    resource: { name, mimeType: 'application/json', text: json({ source, data }), source }
  };
}

export const horizonsTool = defineTool({
  name: 'jpl_horizons',
  title: 'JPL Horizons ephemerides',
  description: 'Ephemerides and object data for solar-system bodies from the JPL Horizons API (GET).',
  inputSchema: horizonsInputSchema,
  annotations: READ_ONLY_REMOTE,
  async handler({ args, ctx }) {
    const url = buildUrl(HORIZONS_URL, { format: args.format });
    for (const [key, v] of horizonsParams(args)) url.searchParams.set(key, v);
    const response = await httpRequest(ctx.fetch, { service: SERVICE, url, timeoutMs: 60_000 });
    return interpret(response, args, ctx, false);
  }
});

export const horizonsFileTool = defineTool({
  name: 'jpl_horizons_file',
  title: 'JPL Horizons ephemerides (file input)',
  description: 'Same as jpl_horizons, but submits the parameters as a Horizons input file (POST to horizons_file.api).',
  inputSchema: horizonsInputSchema,
  annotations: READ_ONLY_REMOTE,
  async handler({ args, ctx }) {
    const input = ['!$$SOF', ...horizonsParams(args).map(([key, v]) => `${key}=${v}`), '!$$EOF', ''].join('\n');
    const form = new FormData();
    form.append('format', args.format);
    form.append('input', new Blob([input], { type: 'text/plain' }), 'horizons_input.txt');
    const response = await httpRequest(ctx.fetch, { service: SERVICE, url: HORIZONS_FILE_URL, method: 'POST', body: form, timeoutMs: 60_000 });
    return interpret(response, args, ctx, true);
  }
});
