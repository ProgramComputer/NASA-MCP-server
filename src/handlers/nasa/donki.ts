import { z } from 'zod';
import { defineTool, READ_ONLY_REMOTE } from '../../tools/types';
import { httpRequest } from '../../util/http';
import { daysBetween, isoDate } from '../../util/validation';
import { boundedText, buildUrl, json, sourceInfo, text } from '../common';

const SERVICE = 'NASA DONKI API';
/**
 * CCMC's public DONKI API, which needs no key. It moved here from
 * kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get on 2026-09-30, and api.nasa.gov/DONKI
 * now redirects to a CCMC news page instead of returning data.
 */
const DONKI_API_BASE_URL = 'https://ccmc.gsfc.nasa.gov/DONKI-API/get';

const TYPE_ENDPOINTS = {
  cme: '/CME',
  cmea: '/CMEAnalysis',
  gst: '/GST',
  ips: '/IPS',
  flr: '/FLR',
  sep: '/SEP',
  mpc: '/MPC',
  rbe: '/RBE',
  hss: '/HSS',
  wsa: '/WSAEnlilSimulations',
  notifications: '/notifications'
} as const;

type DonkiType = keyof typeof TYPE_ENDPOINTS;
const DONKI_TYPES = Object.keys(TYPE_ENDPOINTS) as [DonkiType, ...DonkiType[]];

export const donkiInputSchema = z
  .strictObject({
    type: z
      .preprocess((value) => (typeof value === 'string' ? value.toLowerCase() : value), z.enum(DONKI_TYPES))
      .describe('Event type: cme, cmea, gst, ips, flr, sep, mpc, rbe, hss, wsa, notifications.'),
    startDate: isoDate('Start date (YYYY-MM-DD). DONKI defaults to 30 days before endDate.').optional(),
    endDate: isoDate('End date (YYYY-MM-DD). DONKI defaults to today.').optional()
  })
  .superRefine((args, ctx) => {
    if (args.startDate && args.endDate && daysBetween(args.startDate, args.endDate) < 0) {
      ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'endDate must not be before startDate' });
    }
  });

export const donkiTool = defineTool({
  name: 'nasa_donki',
  title: 'NASA DONKI space weather',
  description:
    'Space Weather Database Of Notifications, Knowledge, Information (DONKI) events by type and date range, from the NASA CCMC DONKI API ' +
    '(ccmc.gsfc.nasa.gov). No API key needed.',
  inputSchema: donkiInputSchema,
  annotations: READ_ONLY_REMOTE,
  async handler({ args, ctx }) {
    const url = buildUrl(`${DONKI_API_BASE_URL}${TYPE_ENDPOINTS[args.type]}`, { startDate: args.startDate, endDate: args.endDate });
    const response = await httpRequest(ctx.fetch, { service: SERVICE, url });
    // DONKI answers "no events" with an empty body on some endpoints.
    const data = response.text().trim() ? response.json<unknown>() : [];
    const source = sourceInfo(ctx, SERVICE, response.url);
    const count = Array.isArray(data) ? data.length : null;
    const range = `${args.startDate ? ` from ${args.startDate}` : ''}${args.endDate ? ` to ${args.endDate}` : ''}`;
    const summary = count === 0 ? `No DONKI ${args.type.toUpperCase()} events${range}.` : `Retrieved ${count ?? 'DONKI'} ${args.type.toUpperCase()} records${range}.`;
    return {
      content: [text(summary), ...(count === 0 ? [] : [boundedText(json(data), SERVICE, 'Use a shorter date range.')])],
      resource: { name: `DONKI ${args.type.toUpperCase()}${range}`, mimeType: 'application/json', text: json({ source, data }), source }
    };
  }
});
