import { z } from 'zod';
import { defineTool, READ_ONLY_REMOTE, type ToolContext } from '../../tools/types';
import { ToolInputError } from '../../util/errors';
import { jsonResult, text } from '../common';
import { jplGet } from './common';

const SERVICE = 'JPL SBDB API';

export const sbdbInputSchema = z
  .strictObject({
    sstr: z.string().trim().min(1).max(200).describe('Search string: name, designation or number (e.g. Ceres, 433, 2019 OK).').optional(),
    spk: z.int().positive().describe('SPK-ID of the object.').optional(),
    des: z.string().trim().min(1).max(100).describe('Primary designation or IAU number.').optional(),
    ca_data: z.boolean().describe('Include close-approach data.').optional(),
    cad: z.boolean().describe('DEPRECATED alias for ca_data.').optional(),
    ca_body: z.string().trim().min(1).max(40).describe('Limit close approaches to this body (e.g. Earth); needs ca_data.').optional(),
    phys_par: z.boolean().describe('Include physical parameters.').optional(),
    full_prec: z.boolean().describe('Full-precision orbital elements.').optional(),
    discovery: z.boolean().describe('Include discovery circumstances.').optional(),
    vi_data: z.boolean().describe('Include Sentry virtual-impactor data.').optional(),
    alt_orbits: z.boolean().describe('Include alternate orbits.').optional(),
    sat: z.boolean().describe('Include satellite data.').optional()
  })
  .superRefine((args, ctx) => {
    const selectors = [args.sstr, args.spk, args.des].filter((value) => value !== undefined).length;
    if (selectors !== 1) ctx.addIssue({ code: 'custom', message: 'provide exactly one of sstr, spk or des' });
    if (args.cad !== undefined && args.ca_data !== undefined && args.cad !== args.ca_data) {
      ctx.addIssue({ code: 'custom', message: 'cad is an alias of ca_data; they conflict' });
    }
  });

export type SbdbArgs = z.output<typeof sbdbInputSchema>;

export async function fetchSbdb(ctx: ToolContext, args: SbdbArgs) {
  const caData = args.ca_data ?? args.cad;
  if (args.ca_body && !caData) throw new ToolInputError('ca_body requires ca_data: true');
  const { response, source } = await jplGet(
    ctx,
    SERVICE,
    '/sbdb.api',
    {
      sstr: args.sstr,
      spk: args.spk,
      des: args.des,
      'ca-data': caData,
      'ca-body': args.ca_body,
      'phys-par': args.phys_par,
      'full-prec': args.full_prec,
      discovery: args.discovery,
      'vi-data': args.vi_data,
      'alt-orbits': args.alt_orbits,
      sat: args.sat
    },
    // SBDB answers ambiguous searches with HTTP 300 and a candidate list.
    (status) => status === 200 || status === 300
  );
  return { data: response.json<Record<string, unknown>>(), status: response.status, source };
}

export const sbdbTool = defineTool({
  name: 'jpl_sbdb',
  title: 'JPL Small-Body Database lookup',
  description: 'Orbital and physical data for one asteroid or comet from the JPL Small-Body Database (SBDB).',
  inputSchema: sbdbInputSchema,
  annotations: READ_ONLY_REMOTE,
  async handler({ args, ctx }) {
    const { data, status, source } = await fetchSbdb(ctx, args);
    const label = args.sstr ?? args.des ?? String(args.spk);
    if (status === 300) {
      return jsonResult(SERVICE, `Several SBDB objects match "${label}"; refine the search using one of the listed designations.`, data, source, `SBDB matches for ${label}`);
    }
    if (!data.object && typeof data.message === 'string') {
      return { content: [text(`SBDB: ${data.message} ("${label}").`)] };
    }
    return jsonResult(SERVICE, `SBDB data for "${label}".`, data, source, `SBDB ${label}`);
  }
});
