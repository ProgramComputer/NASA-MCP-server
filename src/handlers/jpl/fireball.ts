import { z } from 'zod';
import { defineTool, READ_ONLY_REMOTE } from '../../tools/types';
import { jsonResult } from '../common';
import { hyphenate, jplGet, JPL_DATE } from './common';

const SERVICE = 'JPL Fireball API';
const jplDate = (description: string) => z.string().regex(JPL_DATE, 'must be YYYY-MM-DD or YYYY-MM-DDThh:mm:ss').describe(description);

export const fireballInputSchema = z.strictObject({
  limit: z.int().min(1).max(1000).default(50).describe('Maximum number of events (1-1000).'),
  date_min: jplDate('Earliest event date (YYYY-MM-DD).').optional(),
  date_max: jplDate('Latest event date (YYYY-MM-DD).').optional(),
  energy_min: z.number().min(0).describe('Minimum total radiated energy (1e10 J).').optional(),
  energy_max: z.number().min(0).describe('Maximum total radiated energy (1e10 J).').optional(),
  impact_e_min: z.number().min(0).describe('Minimum estimated impact energy (kt).').optional(),
  impact_e_max: z.number().min(0).describe('Maximum estimated impact energy (kt).').optional(),
  vel_min: z.number().min(0).describe('Minimum velocity (km/s).').optional(),
  vel_max: z.number().min(0).describe('Maximum velocity (km/s).').optional(),
  req_loc: z.boolean().describe('Only events with a location.').optional(),
  req_alt: z.boolean().describe('Only events with an altitude.').optional(),
  req_vel: z.boolean().describe('Only events with a velocity.').optional(),
  req_vel_comp: z.boolean().describe('Only events with velocity components.').optional()
});

export const fireballTool = defineTool({
  name: 'jpl_fireball',
  title: 'JPL fireball events',
  description: 'Fireball (bolide) events reported by US Government sensors, from the JPL Fireball API.',
  inputSchema: fireballInputSchema,
  retiredParameters: {
    req_energy: 'The JPL Fireball API rejects req-energy; filter with energy_min instead.',
    req_impact_e: 'The JPL Fireball API rejects req-impact-e; filter with impact_e_min instead.',
    alt_min: 'The JPL Fireball API returns HTTP 500 for alt-min; this filter is not supported.',
    alt_max: 'The JPL Fireball API returns HTTP 500 for alt-max; this filter is not supported.'
  },
  annotations: READ_ONLY_REMOTE,
  async handler({ args, ctx }) {
    const { response, source } = await jplGet(ctx, SERVICE, '/fireball.api', hyphenate(args));
    const data = response.json<{ count?: string | number }>();
    const count = Number(data.count ?? 0);
    return jsonResult(SERVICE, count === 0 ? 'No fireball events matched.' : `Retrieved ${count} fireball events.`, data, source, 'JPL fireball events');
  }
});
