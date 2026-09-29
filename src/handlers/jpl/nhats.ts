import { z } from 'zod';
import { defineTool, READ_ONLY_REMOTE } from '../../tools/types';
import { jsonResult } from '../common';
import { hyphenate, jplGet } from './common';

const SERVICE = 'JPL NHATS API';

export const nhatsInputSchema = z
  .strictObject({
    dv: z.int().min(4).max(12).describe('Maximum total delta-V in km/s (4-12).').optional(),
    dur: z.int().min(60).max(450).describe('Maximum total mission duration in days (60-450).').optional(),
    stay: z.union([z.literal(8), z.literal(16), z.literal(24), z.literal(32)]).describe('Minimum stay at the NEO in days (8, 16, 24 or 32).').optional(),
    launch: z
      .enum(['2020-2025', '2025-2030', '2030-2035', '2035-2040', '2040-2045', '2020-2045'])
      .describe('Launch window.')
      .optional(),
    h: z.int().min(16).max(30).describe('Maximum absolute magnitude H (16-30).').optional(),
    occ: z.int().min(0).max(8).describe('Maximum orbit condition code (0-8).').optional(),
    des: z.string().trim().min(1).max(100).describe('Object designation, e.g. 99942 (object mode).').optional(),
    spk: z.int().positive().describe('Object SPK-ID (object mode).').optional(),
    plot: z.boolean().describe('Include a base64 plot (object mode; large).').optional()
  })
  .superRefine((args, ctx) => {
    if (args.des !== undefined && args.spk !== undefined) ctx.addIssue({ code: 'custom', message: 'provide des or spk, not both' });
  });

export const nhatsTool = defineTool({
  name: 'jpl_nhats',
  title: 'JPL NHATS human-accessible NEOs',
  description: 'Near-Earth objects accessible to human missions (NHATS): a constrained summary list, or one object by des/spk.',
  inputSchema: nhatsInputSchema,
  annotations: READ_ONLY_REMOTE,
  async handler({ args, ctx }) {
    const { response, source } = await jplGet(ctx, SERVICE, '/nhats.api', hyphenate(args));
    const data = response.json<{ count?: string | number }>();
    const label = args.des ?? (args.spk !== undefined ? String(args.spk) : null);
    return jsonResult(SERVICE, label ? `NHATS data for ${label}.` : `NHATS summary (${data.count ?? 'unknown'} objects).`, data, source, label ? `NHATS ${label}` : 'NHATS summary', 'Add constraints such as dv, dur or h.');
  }
});
