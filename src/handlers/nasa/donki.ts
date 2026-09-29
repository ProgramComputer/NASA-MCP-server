import { z } from 'zod';
import { defineTool, READ_ONLY_REMOTE } from '../../tools/types';
import { daysBetween, isoDate } from '../../util/validation';
import { boundedText, json, nasaApiGet, sourceInfo, text } from '../common';

const SERVICE = 'NASA DONKI API';

const TYPE_ENDPOINTS = {
  cme: '/DONKI/CME',
  cmea: '/DONKI/CMEAnalysis',
  gst: '/DONKI/GST',
  ips: '/DONKI/IPS',
  flr: '/DONKI/FLR',
  sep: '/DONKI/SEP',
  mpc: '/DONKI/MPC',
  rbe: '/DONKI/RBE',
  hss: '/DONKI/HSS',
  wsa: '/DONKI/WSAEnlilSimulations',
  notifications: '/DONKI/notifications'
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
  description: 'Space Weather Database Of Notifications, Knowledge, Information (DONKI) events by type and date range. Requires NASA_API_KEY.',
  inputSchema: donkiInputSchema,
  annotations: READ_ONLY_REMOTE,
  async handler({ args, ctx }) {
    const response = await nasaApiGet(ctx, SERVICE, TYPE_ENDPOINTS[args.type], {
      startDate: args.startDate,
      endDate: args.endDate
    });
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
