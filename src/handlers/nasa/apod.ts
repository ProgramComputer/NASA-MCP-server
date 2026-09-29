import { z } from 'zod';
import { defineTool, READ_ONLY_REMOTE, type ToolContext, type ToolContent } from '../../tools/types';
import { daysBetween, isoDate } from '../../util/validation';
import { boundedText, fetchImage, nasaApiGet, sourceInfo, text, json } from '../common';

const SERVICE = 'NASA APOD API';
const MAX_RANGE_DAYS = 100;

export const apodInputSchema = z
  .strictObject({
    date: isoDate('Date of the picture (YYYY-MM-DD). Defaults to today. Cannot be combined with count or start_date/end_date.').optional(),
    start_date: isoDate('Start of a date range (YYYY-MM-DD).').optional(),
    end_date: isoDate('End of a date range (YYYY-MM-DD); requires start_date. Defaults to today when start_date is given.').optional(),
    count: z.int().min(1).max(100).describe('Return this many random pictures (1-100). Cannot be combined with dates.').optional(),
    thumbs: z.boolean().describe('Include thumbnail URLs for video entries.').optional(),
    max_images: z
      .int()
      .min(0)
      .max(5)
      .default(1)
      .describe('How many pictures to embed as image content (0-5). Remaining entries are listed by URL.')
  })
  .superRefine((args, ctx) => {
    if (args.count !== undefined && (args.date || args.start_date || args.end_date)) {
      ctx.addIssue({ code: 'custom', message: 'count cannot be combined with date, start_date or end_date' });
    }
    if (args.date && (args.start_date || args.end_date)) {
      ctx.addIssue({ code: 'custom', message: 'date cannot be combined with start_date/end_date' });
    }
    if (args.end_date && !args.start_date) {
      ctx.addIssue({ code: 'custom', path: ['end_date'], message: 'end_date requires start_date' });
    }
    if (args.start_date && args.end_date) {
      const span = daysBetween(args.start_date, args.end_date);
      if (span < 0) ctx.addIssue({ code: 'custom', path: ['end_date'], message: 'end_date must not be before start_date' });
      if (span > MAX_RANGE_DAYS) {
        ctx.addIssue({ code: 'custom', path: ['end_date'], message: `date ranges are limited to ${MAX_RANGE_DAYS} days` });
      }
    }
  });

export type ApodArgs = z.output<typeof apodInputSchema>;

interface ApodEntry {
  date?: string;
  title?: string;
  explanation?: string;
  media_type?: string;
  url?: string;
  hdurl?: string;
  thumbnail_url?: string;
  copyright?: string;
}

export async function fetchApod(ctx: ToolContext, args: Omit<ApodArgs, 'max_images'>) {
  const response = await nasaApiGet(ctx, SERVICE, '/planetary/apod', {
    date: args.date,
    start_date: args.start_date,
    end_date: args.end_date,
    count: args.count,
    thumbs: args.thumbs
  });
  const data = response.json<ApodEntry | ApodEntry[]>();
  return { data, source: sourceInfo(ctx, SERVICE, response.url) };
}

export const apodTool = defineTool({
  name: 'nasa_apod',
  title: 'NASA Astronomy Picture of the Day',
  description:
    "Fetch NASA's Astronomy Picture of the Day (APOD): a single date, a date range (up to 100 days), or random pictures. Requires NASA_API_KEY.",
  inputSchema: apodInputSchema,
  annotations: READ_ONLY_REMOTE,
  async handler({ args, ctx }) {
    const { data, source } = await fetchApod(ctx, args);
    const entries = Array.isArray(data) ? data : [data];
    const summary = entries
      .map((apod) => {
        const lines = [`## ${apod.title ?? 'Untitled'} (${apod.date ?? 'unknown date'})`];
        if (apod.copyright) lines.push(`Copyright: ${apod.copyright.trim()}`);
        lines.push(`Media type: ${apod.media_type ?? 'unknown'}`);
        if (apod.url) lines.push(`URL: ${apod.url}`);
        if (apod.hdurl) lines.push(`HD URL: ${apod.hdurl}`);
        if (apod.thumbnail_url) lines.push(`Thumbnail: ${apod.thumbnail_url}`);
        if (apod.explanation) lines.push('', apod.explanation);
        return lines.join('\n');
      })
      .join('\n\n');

    const content: ToolContent[] = [boundedText(`${entries.length} APOD entr${entries.length === 1 ? 'y' : 'ies'}\n\n${summary}`, SERVICE, 'Request fewer days.')];
    const notes: string[] = [];
    let embedded = 0;
    for (const apod of entries) {
      if (embedded >= args.max_images) break;
      if (apod.media_type !== 'image' || !apod.url) continue;
      const result = await fetchImage(ctx, SERVICE, apod.url);
      if ('image' in result) {
        content.push(result.image);
        embedded++;
      } else {
        notes.push(`${apod.date ?? apod.url}: image ${result.error}`);
      }
    }
    if (notes.length) content.push(text(notes.join('\n')));

    return {
      content,
      resource: { name: `APOD ${entries.map((e) => e.date).filter(Boolean).join(', ')}`, mimeType: 'application/json', text: json({ source, data }), source }
    };
  }
});
