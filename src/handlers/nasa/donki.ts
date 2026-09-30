import { z } from 'zod';
import { defineTool, READ_ONLY_REMOTE } from '../../tools/types';
import { ToolInputError } from '../../util/errors';
import { httpRequest } from '../../util/http';
import { daysBetween, isoDate, todayUtc } from '../../util/validation';
import { boundedText, buildUrl, json, sourceInfo, text } from '../common';

const SERVICE = 'NASA DONKI API';
/**
 * CCMC's public DONKI API, which needs no key. It moved here from
 * kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get on 2026-09-30, and api.nasa.gov/DONKI
 * now redirects to a CCMC news page instead of returning data.
 */
const DONKI_API_BASE_URL = 'https://ccmc.gsfc.nasa.gov/DONKI-API/get';
/** The CCMC API rejects longer ranges with HTTP 400. */
const MAX_RANGE_DAYS = 30;

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
    startDate: isoDate('Start date (YYYY-MM-DD). With only endDate, 30 days before endDate; with neither, the last 30 days.').optional(),
    endDate: isoDate(`End date (YYYY-MM-DD), at most ${MAX_RANGE_DAYS} days after startDate. Defaults to today.`).optional(),
    response_mode: z
      .enum(['compact', 'raw'])
      .default('compact')
      .describe('compact (default): one line per event with its key fields. raw: the full DONKI records as JSON (large for cme, cmea and wsa).'),
    limit: z.int().min(1).max(1000).describe('Return only the most recent N events. Applied by this server; DONKI has no limit parameter.').optional()
  })
  .superRefine((args, ctx) => {
    if (args.startDate && args.endDate) {
      const span = daysBetween(args.startDate, args.endDate);
      if (span < 0) ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'endDate must not be before startDate' });
      if (span > MAX_RANGE_DAYS) {
        ctx.addIssue({ code: 'custom', path: ['endDate'], message: `DONKI returns at most ${MAX_RANGE_DAYS} days per request` });
      }
    }
  });

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/* eslint-disable @typescript-eslint/no-explicit-any -- loosely typed upstream JSON */
const list = (items: unknown, pick: (item: any) => unknown): string[] =>
  Array.isArray(items) ? items.map(pick).filter((value): value is string => typeof value === 'string' && value !== '') : [];

function common(event: any): string {
  const instruments = list(event.instruments, (i) => i?.displayName);
  const linked = list(event.linkedEvents, (l) => l?.activityID);
  return `${instruments.length ? `; instruments: ${instruments.join(', ')}` : ''}${linked.length ? `; linked: ${linked.join(', ')}` : ''}`;
}

function sourceText(event: any): string {
  const where = [event.sourceLocation || undefined, event.activeRegionNum ? `AR ${event.activeRegionNum}` : undefined].filter(Boolean);
  return where.length ? `, source ${where.join(' ')}` : '';
}

function earthImpact(enlil: any): string {
  if (!enlil?.estimatedShockArrivalTime) return 'no Earth arrival modeled';
  const kp = [enlil.kp_18, enlil.kp_90, enlil.kp_135, enlil.kp_180].filter((k) => typeof k === 'number');
  const kind = enlil.isEarthGB ? 'glancing blow' : enlil.isEarthMinorImpact ? 'minor impact' : 'impact';
  return `Earth arrival ${enlil.estimatedShockArrivalTime} (${kind}${kp.length ? `, Kp up to ${Math.max(...kp)}` : ''})`;
}

/** One line per event with the fields that matter for that event type. */
function describe(type: DonkiType, e: any): string {
  switch (type) {
    case 'flr':
      return `${e.flrID}: class ${e.classType ?? '?'}, peak ${e.peakTime ?? '?'} (${e.beginTime ?? '?'} to ${e.endTime ?? '?'})${sourceText(e)}${common(e)}`;
    case 'cme': {
      const analyses = Array.isArray(e.cmeAnalyses) ? e.cmeAnalyses : [];
      const best = analyses.find((a: any) => a?.isMostAccurate) ?? analyses[0];
      const fit = best
        ? `; ${best.speed ?? '?'} km/s, half-angle ${best.halfAngle ?? '?'}°, type ${best.type ?? '?'}, lat ${best.latitude ?? '?'} lon ${best.longitude ?? '?'}` +
          (Array.isArray(best.enlilList) && best.enlilList.length ? `; ${earthImpact(best.enlilList.at(-1))}` : '')
        : '; no analysis';
      return `${e.activityID}: start ${e.startTime ?? '?'}${sourceText(e)}${fit}${common(e)}`;
    }
    case 'cmea':
      return (
        `${e.associatedCMEID ?? '?'}: ${e.speed ?? '?'} km/s, half-angle ${e.halfAngle ?? '?'}°, type ${e.type ?? '?'}, lat ${e.latitude ?? '?'} lon ${e.longitude ?? '?'}` +
        `, at 21.5 solar radii ${e.time21_5 ?? '?'}${e.isMostAccurate ? ', most accurate' : ''}${e.measurementTechnique ? `, ${e.measurementTechnique}` : ''}`
      );
    case 'gst': {
      const readings = Array.isArray(e.allKpIndex) ? e.allKpIndex.filter((k: any) => typeof k?.kpIndex === 'number') : [];
      const peak = readings.reduce((max: any, k: any) => (!max || k.kpIndex > max.kpIndex ? k : max), undefined);
      return `${e.gstID}: start ${e.startTime ?? '?'}${peak ? `, max Kp ${peak.kpIndex} at ${peak.observedTime} (${peak.source})` : ''}${common({ linkedEvents: e.linkedEvents })}`;
    }
    case 'ips':
      return `${e.activityID}: ${e.eventTime ?? '?'} at ${e.location ?? '?'}${common(e)}`;
    case 'wsa': {
      const cmes = list(e.cmeInputs, (c) => (c?.CMEID ? `${c.CMEID} (${c.speed ?? '?'} km/s)` : undefined));
      const impacts = list(e.impactList, (i) => (i?.location ? `${i.location} ${i.arrivalTime ?? '?'}` : undefined));
      return (
        `${e.simulationID}: completed ${e.modelCompletionTime ?? '?'}${cmes.length ? `, CMEs ${cmes.join(', ')}` : ''}; ${earthImpact(e)}` +
        `${impacts.length ? `; other arrivals: ${impacts.join(', ')}` : ''}`
      );
    }
    case 'notifications': {
      const body = typeof e.messageBody === 'string' ? e.messageBody.replace(/[#*]+/g, ' ').replace(/\s+/g, ' ').trim() : '';
      return `${e.messageIssueTime ?? '?'} ${e.messageType ?? '?'} ${e.messageID ?? '?'}${body ? `: ${body.length > 200 ? `${body.slice(0, 200)}…` : body}` : ''} ${e.messageURL ?? ''}`.trim();
    }
    default: {
      const id = e.sepID ?? e.mpcID ?? e.rbeID ?? e.hssID ?? e.activityID ?? '?';
      return `${id}: ${e.eventTime ?? '?'}${common(e)}`;
    }
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const donkiTool = defineTool({
  name: 'nasa_donki',
  title: 'NASA DONKI space weather',
  description:
    'Space Weather Database Of Notifications, Knowledge, Information (DONKI) events by type for up to 30 days at a time, from the NASA CCMC DONKI API ' +
    '(ccmc.gsfc.nasa.gov): solar flares, CMEs and their analyses, geomagnetic storms, interplanetary shocks, SEP, MPC, RBE and HSS events, ' +
    'WSA-ENLIL simulations and notifications. Compact one-line summaries by default; response_mode raw returns the full records. No API key needed.',
  inputSchema: donkiInputSchema,
  annotations: READ_ONLY_REMOTE,
  async handler({ args, ctx }) {
    const today = todayUtc(ctx.now());
    let startDate = args.startDate;
    // Given only endDate, CCMC counts its 30-day default back from today, not from endDate.
    if (!startDate && args.endDate) startDate = addDays(args.endDate, -MAX_RANGE_DAYS);
    if (startDate && !args.endDate) {
      if (startDate > today) throw new ToolInputError(`startDate ${startDate} is in the future (today is ${today} UTC)`);
      const span = daysBetween(startDate, today);
      if (span > MAX_RANGE_DAYS) {
        throw new ToolInputError(
          `DONKI returns at most ${MAX_RANGE_DAYS} days per request, and startDate ${startDate} is ${span} days before today; ` +
            `also set endDate (at most ${addDays(startDate, MAX_RANGE_DAYS)})`
        );
      }
    }

    const url = buildUrl(`${DONKI_API_BASE_URL}${TYPE_ENDPOINTS[args.type]}`, { startDate, endDate: args.endDate });
    const response = await httpRequest(ctx.fetch, { service: SERVICE, url });
    // DONKI has answered "no events" with an empty body on some endpoints.
    const data = response.text().trim() ? response.json<unknown>() : [];
    const source = sourceInfo(ctx, SERVICE, response.url);
    const records = Array.isArray(data) ? data : [];
    const shown = args.limit !== undefined && records.length > args.limit ? records.slice(-args.limit) : records;
    const label = args.type.toUpperCase();
    const range = `${startDate ? ` from ${startDate}` : ''}${args.endDate ? ` to ${args.endDate}` : ''}`;
    const summary =
      records.length === 0
        ? `No DONKI ${label} events${range}.`
        : `Retrieved ${records.length} ${label} records${range}${shown.length < records.length ? `; showing the ${shown.length} most recent` : ''}.`;
    const body =
      records.length === 0
        ? []
        : args.response_mode === 'raw'
          ? [boundedText(json(shown), SERVICE, 'Use response_mode compact, limit, or a shorter date range.')]
          : [boundedText(shown.map((event) => `- ${describe(args.type, event)}`).join('\n'), SERVICE, 'Use limit or a shorter date range.')];
    return {
      content: [text(summary), ...body],
      resource: { name: `DONKI ${label}${range}`, mimeType: 'application/json', text: json({ source, data }), source }
    };
  }
});
