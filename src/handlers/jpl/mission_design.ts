import { z } from 'zod';
import { defineTool, READ_ONLY_REMOTE } from '../../tools/types';
import { ToolInputError } from '../../util/errors';
import { jsonResult, text } from '../common';
import { jplGet } from './common';

const SERVICE = 'JPL Small-Body Mission Design API';
const MAX_YEARS_AHEAD = 20;

export const missionDesignInputSchema = z
  .strictObject({
    des: z.string().trim().min(1).max(100).describe('Object mode: designation, e.g. 2012 TC4 or 433.').optional(),
    spk: z.int().positive().describe('Object mode: SPK-ID, e.g. 2000433.').optional(),
    sstr: z.string().trim().min(1).max(100).describe('Object mode: search string (name, designation or SPK-ID), e.g. apophis.').optional(),
    class: z.boolean().describe('Object mode: orbit class as a name instead of the three-letter code.').optional(),
    crit: z
      .int()
      .min(1)
      .max(6)
      .describe(
        'List mode: optimality criterion. 1 min departure V-infinity (default), 2 min arrival V-infinity, 3 min total delta-V, ' +
          '4-6 the same with minimum time of flight first.'
      )
      .optional(),
    year: z
      .array(z.int().min(1900).max(2200))
      .min(1)
      .max(MAX_YEARS_AHEAD + 1)
      .describe(`List mode: launch year(s), from the current year up to ${MAX_YEARS_AHEAD} years ahead. JPL defaults to the next five years.`)
      .optional(),
    lim: z.int().min(1).max(200).default(20).describe('List mode: how many accessible objects to return (1-200).'),
    sb_kind: z.enum(['a', 'c']).describe('List mode: asteroids (a) or comets (c) only.').optional(),
    sb_group: z.enum(['neo', 'pha']).describe('List mode: NEOs or PHAs only.').optional(),
    sb_class: z
      .string()
      .regex(/^[A-Z]{3}(,[A-Z]{3})*$/, 'must be three-letter orbit class codes such as APO or TJN,CEN')
      .describe('List mode: orbit class code(s), e.g. APO or MBA,OMB (case-sensitive).')
      .optional(),
    sb_ns: z.enum(['n', 'u']).describe('List mode: numbered (n) or unnumbered (u) objects only.').optional(),
    sb_sat: z.boolean().describe('List mode: only objects with at least one known satellite.').optional(),
    sb_xfrag: z.boolean().describe('List mode: exclude comet fragments.').optional()
  })
  .superRefine((args, ctx) => {
    const selectors = [args.des, args.spk, args.sstr].filter((value) => value !== undefined).length;
    if (selectors > 1) ctx.addIssue({ code: 'custom', message: 'provide only one of des, spk or sstr' });
    const listOnly = ['crit', 'year', 'sb_kind', 'sb_group', 'sb_class', 'sb_ns', 'sb_sat', 'sb_xfrag'] as const;
    if (selectors === 1) {
      const used = listOnly.filter((key) => args[key] !== undefined);
      if (used.length) ctx.addIssue({ code: 'custom', message: `${used.join(', ')} apply only to list mode (without des, spk or sstr)` });
    } else if (args.class !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['class'], message: 'class applies only to object mode (with des, spk or sstr)' });
    }
  });

export const missionDesignTool = defineTool({
  name: 'jpl_mission_design',
  title: 'JPL small-body mission design',
  description:
    'Ballistic mission options to asteroids and comets from the JPL Small-Body Mission Design API. Object mode (des, spk or sstr) returns the pre-computed ' +
    'mission options stored for one object (launch and arrival dates, V-infinity, time of flight). List mode returns the most accessible small bodies for ' +
    'the given launch years, ranked by crit, with optional SBDB filters. Porkchop-plot maps (mode M) and mission-extension searches (mode T) are not exposed.',
  inputSchema: missionDesignInputSchema,
  annotations: READ_ONLY_REMOTE,
  async handler({ args, provided, ctx }) {
    const objectMode = args.des !== undefined || args.spk !== undefined || args.sstr !== undefined;
    if (objectMode && provided.has('lim')) throw new ToolInputError('lim applies only to list mode (without des, spk or sstr)');
    if (!objectMode && args.year) {
      const current = ctx.now().getUTCFullYear();
      const outside = args.year.filter((year) => year < current || year > current + MAX_YEARS_AHEAD);
      if (outside.length) throw new ToolInputError(`year must be between ${current} and ${current + MAX_YEARS_AHEAD}; got ${outside.join(', ')}`);
    }
    const params = objectMode
      ? { des: args.des, spk: args.spk, sstr: args.sstr, class: args.class }
      : {
          lim: args.lim,
          crit: args.crit ?? 1,
          year: args.year?.join(','),
          'sb-kind': args.sb_kind,
          'sb-group': args.sb_group,
          'sb-class': args.sb_class,
          'sb-ns': args.sb_ns,
          'sb-sat': args.sb_sat,
          'sb-xfrag': args.sb_xfrag
        };
    const { response, source } = await jplGet(ctx, SERVICE, '/mdesign.api', params);
    const data = response.json<{ message?: string; warning?: string; count?: number | string; object?: { fullname?: string }; selectedMissions?: unknown[] }>();
    const label = args.des ?? args.sstr ?? (args.spk !== undefined ? String(args.spk) : undefined);
    if (typeof data.message === 'string' && !data.object && data.count === undefined) {
      return { content: [text(`Mission Design: ${data.message}${label ? ` ("${label}")` : ''}.`)] };
    }
    const summary = objectMode
      ? `Mission options to ${data.object?.fullname ?? label}: ${Array.isArray(data.selectedMissions) ? data.selectedMissions.length : 0} pre-computed ballistic missions.`
      : Number(data.count ?? 0) === 0
        ? `No accessible small bodies matched${data.warning ? ` (${data.warning})` : ''}.`
        : `${data.count} accessible small bodies, best first by criterion ${args.crit ?? 1}.`;
    return jsonResult(SERVICE, summary, data, source, objectMode ? `Mission design ${label}` : 'Mission design accessible bodies', 'Use a smaller lim.');
  }
});
