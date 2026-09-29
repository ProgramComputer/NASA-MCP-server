import { z } from 'zod';
import { defineTool, READ_ONLY_REMOTE } from '../../tools/types';
import { jsonResult } from '../common';
import { hyphenate, jplGet, JPL_DATE } from './common';

const SERVICE = 'JPL SBDB Close-Approach Data API';
const DISTANCE = /^\d+(\.\d+)?(LD|au|AU)?$/;

export const cadInputSchema = z.strictObject({
  dist_max: z.string().regex(DISTANCE, 'must be a distance in au or with an LD suffix, e.g. 0.05 or 10LD').describe('Maximum approach distance, e.g. 0.05 (au) or 10LD. Default 0.05 au.').optional(),
  dist_min: z.string().regex(DISTANCE, 'must be a distance in au or with an LD suffix').describe('Minimum approach distance.').optional(),
  date_min: z.string().regex(JPL_DATE, 'must be YYYY-MM-DD, now, or +/-days').describe('Start date (YYYY-MM-DD, now, or +/-days). Default now.').optional(),
  date_max: z.string().regex(JPL_DATE, 'must be YYYY-MM-DD, now, or +/-days').describe('End date (YYYY-MM-DD, now, or +/-days). Default +60.').optional(),
  body: z.string().trim().regex(/^[A-Za-z]+$/, 'must be a body name such as Earth, Mars or ALL').describe('Close-approach body (Earth, Mars, ALL, ...). Default Earth.').optional(),
  sort: z
    .string()
    .regex(/^-?(date|dist|dist-min|v-inf|v-rel|h|object)$/, 'must be date, dist, dist-min, v-inf, v-rel, h or object, optionally prefixed with -')
    .describe('Sort field, prefix - for descending. Default date.')
    .optional(),
  des: z.string().trim().min(1).max(100).describe('Only this object (designation).').optional(),
  spk: z.int().positive().describe('Only this object (SPK-ID).').optional(),
  neo: z.boolean().describe('Limit to NEOs (default true upstream).').optional(),
  fullname: z.boolean().describe('Include full object names.').optional(),
  h_min: z.number().describe('Minimum absolute magnitude H.').optional(),
  h_max: z.number().describe('Maximum absolute magnitude H.').optional(),
  limit: z.int().min(1).max(1000).describe('Maximum number of records (1-1000).').optional()
});

export const cadTool = defineTool({
  name: 'jpl_cad',
  title: 'JPL close approaches',
  description: 'Asteroid and comet close approaches to the planets, past and future, from the JPL SBDB Close-Approach Data API.',
  inputSchema: cadInputSchema,
  annotations: READ_ONLY_REMOTE,
  async handler({ args, ctx }) {
    const { response, source } = await jplGet(ctx, SERVICE, '/cad.api', hyphenate(args));
    const data = response.json<{ count?: number | string; total?: number | string }>();
    const count = Number(data.count ?? 0);
    const summary = count === 0 ? 'No close approaches matched.' : `Retrieved ${count} close approaches${data.total !== undefined ? ` of ${data.total}` : ''}.`;
    return jsonResult(SERVICE, summary, data, source, 'JPL close approaches', 'Narrow the date range or add limit.');
  }
});
