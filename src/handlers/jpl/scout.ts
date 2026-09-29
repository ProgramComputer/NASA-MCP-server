import { z } from 'zod';
import { defineTool, READ_ONLY_REMOTE } from '../../tools/types';
import { UpstreamError } from '../../util/errors';
import { jsonResult } from '../common';
import { jplGet } from './common';

const SERVICE = 'JPL Scout API';

export const scoutInputSchema = z
  .strictObject({
    tdes: z.string().trim().regex(/^[A-Za-z0-9]{1,16}$/, 'must be a NEOCP temporary designation such as P21Eolo').describe('NEOCP temporary designation (object mode).').optional(),
    plot: z
      .string()
      .regex(/^(el|ca|sr)(:(el|ca|sr))*$/, 'must be el, ca, sr or a colon-separated combination')
      .describe('Object mode: base64 plots to include: el (elements), ca (close approach), sr (systematic ranging), colon-separated.')
      .optional(),
    file: z.enum(['list', 'mpc']).describe('Object mode: include the observation file as a list or in MPC format.').optional(),
    orbits: z.boolean().describe('Object mode: include sampled orbits.').optional(),
    n_orbits: z.int().min(1).max(1000).describe('Object mode: number of sampled orbits (1-1000).').optional(),
    limit: z
      .int()
      .min(1)
      .max(1000)
      .describe('List mode: return at most this many objects. Applied by this server; Scout has no limit parameter.')
      .optional()
  })
  .superRefine((args, ctx) => {
    const objectOnly = ['plot', 'file', 'orbits', 'n_orbits'] as const;
    if (!args.tdes && objectOnly.some((key) => args[key] !== undefined)) {
      ctx.addIssue({ code: 'custom', message: `${objectOnly.filter((key) => args[key] !== undefined).join(', ')} require tdes` });
    }
    if (args.tdes && args.limit !== undefined) ctx.addIssue({ code: 'custom', message: 'limit applies to the list mode only (omit tdes)' });
  });

export const scoutTool = defineTool({
  name: 'jpl_scout',
  title: 'JPL Scout NEOCP hazard assessment',
  description: 'JPL Scout trajectory analysis and hazard assessment for unconfirmed objects on the Minor Planet Center NEO Confirmation Page.',
  inputSchema: scoutInputSchema,
  retiredParameters: {
    orbit_id: 'The JPL Scout API does not accept orbit-id (HTTP 400). Query by tdes.',
    summary: 'The JPL Scout API does not accept a summary parameter (HTTP 400); list mode already returns summaries.'
  },
  annotations: READ_ONLY_REMOTE,
  async handler({ args, ctx }) {
    const { response, source } = await jplGet(ctx, SERVICE, '/scout.api', {
      tdes: args.tdes,
      plot: args.plot,
      file: args.file,
      orbits: args.orbits,
      'n-orbits': args.n_orbits
    });
    const data = response.json<{ data?: unknown[]; count?: number | string; error?: string }>();
    if (typeof data.error === 'string') {
      throw new UpstreamError(SERVICE, 'http', `${SERVICE}: ${data.error}${args.tdes ? ` (tdes ${args.tdes})` : ''}`);
    }
    if (args.tdes) return jsonResult(SERVICE, `Scout data for ${args.tdes}.`, data, source, `Scout ${args.tdes}`);
    const total = Array.isArray(data.data) ? data.data.length : 0;
    if (args.limit !== undefined && Array.isArray(data.data) && data.data.length > args.limit) data.data = data.data.slice(0, args.limit);
    const summary = total === 0 ? 'Scout currently lists no objects.' : `Scout lists ${total} objects${args.limit !== undefined && total > args.limit ? `; showing the first ${args.limit}` : ''}.`;
    return jsonResult(SERVICE, summary, data, source, 'Scout list');
  }
});
