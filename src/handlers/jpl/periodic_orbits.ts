import { z } from 'zod';
import { defineTool, READ_ONLY_REMOTE } from '../../tools/types';
import { jsonResult } from '../common';
import { jplGet } from './common';

const SERVICE = 'JPL Three-Body Periodic Orbits API';

export const periodicOrbitsInputSchema = z
  .strictObject({
    sys: z.string().trim().regex(/^[a-z]+-[a-z]+$/, 'must be a system such as earth-moon or sun-earth').describe('Three-body system, e.g. earth-moon, sun-earth, mars-phobos.'),
    family: z.string().trim().regex(/^[a-z_]+$/, 'must be a family name such as halo, dro or lyapunov').describe('Orbit family, e.g. halo, dro, lyapunov, vertical, axial, butterfly.'),
    libr: z.int().min(1).max(5).describe('Libration point 1-5 (required by some families).').optional(),
    branch: z.string().trim().regex(/^[A-Za-z]{1,3}$/, 'must be a branch code such as N, S, E or W').describe('Branch (required by some families), e.g. N or S.').optional(),
    periodmin: z.number().describe('Minimum period.').optional(),
    periodmax: z.number().describe('Maximum period.').optional(),
    periodunits: z.enum(['s', 'h', 'd', 'TU']).describe('Units for periodmin/periodmax.').optional(),
    jacobimin: z.number().describe('Minimum Jacobi constant.').optional(),
    jacobimax: z.number().describe('Maximum Jacobi constant.').optional(),
    stabmin: z.number().describe('Minimum stability index.').optional(),
    stabmax: z.number().describe('Maximum stability index.').optional()
  })
  .superRefine((args, ctx) => {
    const pairs = [['periodmin', 'periodmax'], ['jacobimin', 'jacobimax'], ['stabmin', 'stabmax']] as const;
    for (const [min, max] of pairs) {
      if (args[min] !== undefined && args[max] !== undefined && args[min]! > args[max]!) ctx.addIssue({ code: 'custom', path: [max], message: `${max} must be >= ${min}` });
    }
  });

export const periodicOrbitsTool = defineTool({
  name: 'jpl_periodic_orbits',
  title: 'JPL three-body periodic orbits',
  description: 'Periodic orbits (halo, DRO, Lyapunov, ...) in three-body systems from the JPL Three-Body Periodic Orbits database.',
  inputSchema: periodicOrbitsInputSchema,
  annotations: READ_ONLY_REMOTE,
  async handler({ args, ctx }) {
    const { response, source } = await jplGet(ctx, SERVICE, '/periodic_orbits.api', { ...args });
    const data = response.json<{ count?: number | string }>();
    return jsonResult(SERVICE, `Periodic orbits for ${args.sys} ${args.family}${data.count !== undefined ? ` (${data.count} orbits)` : ''}.`, data, source, `Periodic orbits ${args.sys} ${args.family}`, 'Add period, Jacobi or stability bounds.');
  }
});
