import { z } from 'zod';
import { defineTool, READ_ONLY_REMOTE } from '../../tools/types';
import { jsonResult } from '../common';
import { jplGet } from './common';

const SERVICE = 'JPL JD-Calendar API';

export const jdCalInputSchema = z
  .strictObject({
    jd: z.string().trim().regex(/^-?\d+(\.\d+)?$/, 'must be a Julian date number, e.g. 2451545.0').describe('Julian date to convert to a calendar date.').optional(),
    cd: z
      .string()
      .trim()
      .regex(/^-?\d{1,4}-\d{2}-\d{2}([T_ ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?$/, 'must be YYYY-MM-DD or YYYY-MM-DDThh:mm:ss')
      .describe('Calendar date (UTC) to convert to a Julian date.')
      .optional()
  })
  .superRefine((args, ctx) => {
    if ((args.jd === undefined) === (args.cd === undefined)) ctx.addIssue({ code: 'custom', message: 'provide exactly one of jd or cd' });
  });

export const jdCalTool = defineTool({
  name: 'jpl_jd_cal',
  title: 'JPL Julian date converter',
  description: 'Convert between Julian dates and calendar dates (UTC) with the JPL JD-Calendar API.',
  inputSchema: jdCalInputSchema,
  annotations: READ_ONLY_REMOTE,
  async handler({ args, ctx }) {
    const { response, source } = await jplGet(ctx, SERVICE, '/jd_cal.api', { jd: args.jd, cd: args.cd?.replace(' ', '_') });
    const data = response.json<Record<string, unknown>>();
    return jsonResult(SERVICE, `Converted ${args.jd ?? args.cd}.`, data, source, `JD/calendar ${args.jd ?? args.cd}`);
  }
});
