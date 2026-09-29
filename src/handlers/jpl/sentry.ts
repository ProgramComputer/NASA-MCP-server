import { z } from 'zod';
import { defineTool, READ_ONLY_REMOTE } from '../../tools/types';
import { jsonResult } from '../common';
import { jplGet } from './common';

const SERVICE = 'JPL Sentry API';

export const sentryInputSchema = z
  .strictObject({
    des: z.string().trim().min(1).max(100).describe('Object mode: designation, e.g. 29075 or 2011 AG5.').optional(),
    spk: z.int().positive().describe('Object mode: SPK-ID.').optional(),
    h_max: z.number().describe('Summary/VI mode: maximum absolute magnitude H.').optional(),
    ps_min: z.number().describe('Summary/VI mode: minimum Palermo Scale value, e.g. -3.').optional(),
    ip_min: z.number().gt(0).max(1).describe('Summary/VI mode: minimum impact probability, e.g. 1e-5.').optional(),
    removed: z.boolean().describe('List objects removed from Sentry.').optional(),
    all: z.boolean().describe('Virtual-impactor mode: all VIs (combine with ip_min/ps_min/h_max to narrow).').optional(),
    limit: z
      .int()
      .min(1)
      .max(1000)
      .describe('Return at most this many records from list modes. Applied by this server: Sentry has no limit parameter.')
      .optional()
  })
  .superRefine((args, ctx) => {
    const objectMode = args.des !== undefined || args.spk !== undefined;
    if (args.des !== undefined && args.spk !== undefined) ctx.addIssue({ code: 'custom', message: 'provide des or spk, not both' });
    if (objectMode && (args.removed || args.all || args.h_max !== undefined || args.ps_min !== undefined || args.ip_min !== undefined || args.limit !== undefined)) {
      ctx.addIssue({ code: 'custom', message: 'des/spk (object mode) cannot be combined with removed, all, h_max, ps_min, ip_min or limit' });
    }
    if (args.removed && (args.all || args.h_max !== undefined || args.ps_min !== undefined || args.ip_min !== undefined)) {
      ctx.addIssue({ code: 'custom', message: 'removed cannot be combined with all, h_max, ps_min or ip_min' });
    }
  });

export const sentryTool = defineTool({
  name: 'jpl_sentry',
  title: 'JPL Sentry impact risk',
  description: 'Earth impact risk assessments from JPL Sentry: summary table, one object, virtual impactors, or removed objects.',
  inputSchema: sentryInputSchema,
  retiredParameters: {
    date_min: 'The JPL Sentry API has no date filter (it rejected date-min with HTTP 400). Filter the returned impact date ranges instead.',
    date_max: 'The JPL Sentry API has no date filter (it rejected date-max with HTTP 400). Filter the returned impact date ranges instead.'
  },
  annotations: READ_ONLY_REMOTE,
  async handler({ args, ctx }) {
    const { response, source } = await jplGet(ctx, SERVICE, '/sentry.api', {
      des: args.des,
      spk: args.spk,
      'h-max': args.h_max,
      'ps-min': args.ps_min,
      'ip-min': args.ip_min,
      removed: args.removed ? 1 : undefined,
      all: args.all ? 1 : undefined
    });
    const data = response.json<{ data?: unknown[]; count?: number | string; error?: string }>();
    let summary: string;
    if (args.des || args.spk) {
      summary = data.error ? `Sentry: ${data.error}.` : `Sentry impact assessment for ${args.des ?? args.spk}.`;
    } else {
      const total = Array.isArray(data.data) ? data.data.length : 0;
      if (args.limit !== undefined && Array.isArray(data.data) && data.data.length > args.limit) {
        data.data = data.data.slice(0, args.limit);
      }
      summary = total === 0 ? 'Sentry returned no records.' : `Sentry returned ${total} records${args.limit !== undefined && total > args.limit ? `; showing the first ${args.limit}` : ''}.`;
    }
    return jsonResult(SERVICE, summary, data, source, 'JPL Sentry', 'Use limit, ip_min, ps_min or h_max.');
  }
});
