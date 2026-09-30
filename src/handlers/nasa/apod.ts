import { z } from 'zod';
import { defineTool, READ_ONLY_REMOTE, type ToolContext, type ToolContent } from '../../tools/types';
import { ToolInputError, UpstreamError } from '../../util/errors';
import { decodeEntities, htmlToText } from '../../util/html';
import { httpRequest, type HttpResponse } from '../../util/http';
import { daysBetween, isIsoDate, todayUtc } from '../../util/validation';
import { boundedText, buildUrl, fetchImage, json, sourceInfo, text } from '../common';

const SERVICE = 'NASA APOD API';
/**
 * APOD moved from api.nasa.gov/planetary/apod (offline from 2026-12-01) to the
 * NASA Science WordPress API, which needs no key.
 */
export const APOD_API_BASE_URL = 'https://science.nasa.gov/wp-json/wp/v2/apod-basic';
const FIRST_APOD_DATE = '1995-06-16';
const MAX_RANGE_DAYS = 100;
/** The WordPress API caps per_page at 25. */
const PAGE_SIZE = 25;
const MAX_PAGES = Math.ceil((MAX_RANGE_DAYS + 1) / PAGE_SIZE);
/** Width of the rendition embedded as image content. */
const EMBED_WIDTH = 1024;

const apodDate = (description: string) =>
  z
    .string()
    .superRefine((value, ctx) => {
      if (!isIsoDate(value)) ctx.addIssue({ code: 'custom', message: 'must be a valid calendar date in YYYY-MM-DD format' });
      else if (value < FIRST_APOD_DATE) ctx.addIssue({ code: 'custom', message: `APOD starts on ${FIRST_APOD_DATE}` });
    })
    .describe(description);

export const apodInputSchema = z
  .strictObject({
    date: apodDate(`Date of the picture (YYYY-MM-DD, ${FIRST_APOD_DATE} or later). Defaults to the latest published picture. Cannot be combined with start_date/end_date.`).optional(),
    start_date: apodDate('Start of a date range (YYYY-MM-DD).').optional(),
    end_date: apodDate('End of a date range (YYYY-MM-DD); requires start_date. Defaults to today (UTC) when start_date is given.').optional(),
    max_images: z
      .int()
      .min(0)
      .max(5)
      .default(1)
      .describe('How many pictures to embed as image content (0-5). Remaining entries are listed by URL.')
  })
  .superRefine((args, ctx) => {
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

/** One post from /wp/v2/apod-basic. explanation, credit and copyright are HTML. */
interface ApodPost {
  date?: string;
  post_id?: number;
  title?: string;
  permalink?: string;
  media_type?: string;
  explanation?: string;
  credit?: string;
  copyright?: string;
  alt?: string;
  url?: string;
  hdurl?: string;
  basic_html?: string;
  basic_html_url?: string;
}

/** An upstream post without its full HTML page, plus the media URLs taken from that page. */
export interface ApodEntry extends Omit<ApodPost, 'basic_html'> {
  /** The picture shown on the APOD page (images only). */
  image_url?: string;
  /** The video file or player URL shown on the APOD page (videos only). */
  video_url?: string;
}

const IMG_SRC = /<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/i;
const VIDEO_SOURCE_SRC = /<video\b[\s\S]*?<source\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/i;
const VIDEO_SRC = /<video\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/i;
const IFRAME_SRC = /<iframe\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/i;
const CREDIT_LABEL = /^(?:(?:image|video|illustration|animation|photo|photograph|text|data)\s+)?(?:credits?|copyright)(?:\s*(?:&|and)\s*(?:credits?|copyright))?\s*:\s*/i;

/** YYYY-MM-DD to the YYMMDD form the WordPress routes use (1995-2094). */
function yymmdd(date: string): string {
  return `${date.slice(2, 4)}${date.slice(5, 7)}${date.slice(8, 10)}`;
}

function attribute(html: string, pattern: RegExp): string | undefined {
  const raw = pattern.exec(html)?.[1]?.trim();
  if (!raw) return undefined;
  const value = decodeEntities(raw);
  return value.startsWith('//') ? `https:${value}` : value;
}

/** Real APOD media live under an /apod/ path; older posts carry a generic placeholder hdurl. */
function isApodAsset(value: string | undefined): value is string {
  if (!value) return false;
  try {
    return /\/apod\//i.test(new URL(value).pathname);
  } catch {
    return false;
  }
}

function normalize(post: ApodPost): ApodEntry {
  const { basic_html: html = '', ...entry } = post;
  const body = html.slice(Math.max(0, html.search(/<body[\s>]/i)));
  const result: ApodEntry = { ...entry };
  if (post.media_type === 'video') {
    result.video_url = attribute(body, VIDEO_SOURCE_SRC) ?? attribute(body, VIDEO_SRC) ?? attribute(body, IFRAME_SRC);
  } else {
    result.image_url = attribute(body, IMG_SRC) ?? (isApodAsset(post.hdurl) ? post.hdurl : undefined);
  }
  return result;
}

async function apodRequest(ctx: ToolContext, url: string | URL): Promise<HttpResponse> {
  return httpRequest(ctx.fetch, { service: SERVICE, url });
}

export async function fetchApod(ctx: ToolContext, args: Pick<ApodArgs, 'date' | 'start_date' | 'end_date'>) {
  const today = todayUtc(ctx.now());
  for (const [name, value] of [['date', args.date], ['start_date', args.start_date], ['end_date', args.end_date]] as const) {
    if (value && value > today) throw new ToolInputError(`${name} ${value} is in the future (today is ${today} UTC)`);
  }

  if (args.date) {
    let response: HttpResponse;
    try {
      response = await apodRequest(ctx, `${APOD_API_BASE_URL}/${yymmdd(args.date)}`);
    } catch (error) {
      if (error instanceof UpstreamError && error.status === 404) {
        throw new UpstreamError(SERVICE, 'http', `${SERVICE} has no picture for ${args.date} (HTTP 404: APOD not found).`, 404);
      }
      throw error;
    }
    return { data: [normalize(response.json<ApodPost>())], source: sourceInfo(ctx, SERVICE, response.url) };
  }

  if (args.start_date) {
    const end = args.end_date ?? today;
    if (daysBetween(args.start_date, end) > MAX_RANGE_DAYS) {
      throw new ToolInputError(`date ranges are limited to ${MAX_RANGE_DAYS} days; set end_date`);
    }
    const posts: ApodPost[] = [];
    let firstUrl: string | undefined;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = buildUrl(APOD_API_BASE_URL, { date_from: yymmdd(args.start_date), date_to: yymmdd(end), per_page: PAGE_SIZE, page });
      const response = await apodRequest(ctx, url);
      firstUrl ??= response.url;
      const batch = response.json<ApodPost[]>();
      if (!Array.isArray(batch)) {
        throw new UpstreamError(SERVICE, 'invalid_response', `${SERVICE} returned an unexpected response for a date range.`, response.status);
      }
      posts.push(...batch);
      const header = response.headers.get('x-wp-totalpages');
      if (batch.length < PAGE_SIZE || (header !== null && page >= Number(header))) break;
    }
    posts.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return { data: posts.map(normalize), source: sourceInfo(ctx, SERVICE, firstUrl!) };
  }

  const response = await apodRequest(ctx, buildUrl(APOD_API_BASE_URL, { per_page: 1 }));
  const latest = response.json<ApodPost[]>();
  if (!Array.isArray(latest)) {
    throw new UpstreamError(SERVICE, 'invalid_response', `${SERVICE} returned an unexpected response for the latest picture.`, response.status);
  }
  return { data: latest.map(normalize), source: sourceInfo(ctx, SERVICE, response.url) };
}

function creditText(html: string | undefined): string | undefined {
  if (!html) return undefined;
  return htmlToText(html).replace(/\s+/g, ' ').replace(/ ([,;.])/g, '$1').trim().replace(CREDIT_LABEL, '').trim() || undefined;
}

function describe(entry: ApodEntry): string {
  const lines = [`## ${htmlToText(entry.title ?? '') || 'Untitled'} (${entry.date ?? 'unknown date'})`];
  const credit = creditText(entry.credit);
  const copyright = creditText(entry.copyright);
  if (credit) lines.push(`Credit: ${credit}`);
  if (copyright && copyright !== credit) lines.push(`Copyright: ${copyright}`);
  lines.push(`Media type: ${entry.media_type ?? 'unknown'}`);
  if (entry.image_url) lines.push(`Image: ${entry.image_url}`);
  if (entry.video_url) lines.push(`Video: ${entry.video_url}`);
  if (entry.media_type === 'video' && isApodAsset(entry.hdurl)) lines.push(`Still frame: ${entry.hdurl}`);
  if (entry.permalink) lines.push(`Page: ${entry.permalink}`);
  if (entry.alt) lines.push(`Alt text: ${htmlToText(entry.alt)}`);
  const explanation = entry.explanation ? htmlToText(entry.explanation).replace(/^explanation:\s*/i, '') : '';
  if (explanation) lines.push('', explanation);
  return lines.join('\n');
}

/** A 1024-pixel-wide rendition from the NASA Science image service, when the host offers one. */
function embedUrl(imageUrl: string): string {
  let url: URL;
  try {
    url = new URL(imageUrl);
  } catch {
    return imageUrl;
  }
  if (url.hostname !== 'assets.science.nasa.gov') return imageUrl;
  const path = url.pathname.startsWith('/content/dam/') ? `/dynamicimage/assets/${url.pathname.slice('/content/dam/'.length)}` : url.pathname;
  return path.startsWith('/dynamicimage/') ? `https://assets.science.nasa.gov${path}?w=${EMBED_WIDTH}` : imageUrl;
}

export const apodTool = defineTool({
  name: 'nasa_apod',
  title: 'NASA Astronomy Picture of the Day',
  description:
    "NASA's Astronomy Picture of the Day (APOD) from the NASA Science APOD API (science.nasa.gov): the latest picture, one date (1995-06-16 onward), " +
    'or a date range of up to 100 days. Returns the title, credit, explanation as plain text, image or video URL and page link, and embeds up to max_images pictures. ' +
    'No API key needed.',
  inputSchema: apodInputSchema,
  retiredParameters: {
    count: 'The APOD API moved from api.nasa.gov to science.nasa.gov, which has no random mode. Request a date or a start_date/end_date range instead.',
    thumbs: 'The new APOD API has no thumbs option. Video entries always include the video URL and a still-frame image URL.'
  },
  annotations: READ_ONLY_REMOTE,
  async handler({ args, ctx }) {
    const { data, source } = await fetchApod(ctx, args);
    const range = args.start_date ? ` from ${args.start_date} to ${args.end_date ?? todayUtc(ctx.now())}` : '';
    const heading =
      data.length === 0
        ? `No APOD entries${range}.`
        : `${data.length} APOD entr${data.length === 1 ? 'y' : 'ies'}${range}\n\n${data.map(describe).join('\n\n')}`;
    const content: ToolContent[] = [boundedText(heading, SERVICE, 'Request fewer days.')];

    const notes: string[] = [];
    let embedded = 0;
    for (const entry of data) {
      if (embedded >= args.max_images) break;
      if (entry.media_type !== 'image' || !entry.image_url) continue;
      const preferred = embedUrl(entry.image_url);
      let result = await fetchImage(ctx, SERVICE, preferred);
      if ('error' in result && preferred !== entry.image_url) result = await fetchImage(ctx, SERVICE, entry.image_url);
      if ('image' in result) {
        content.push(result.image);
        embedded++;
      } else {
        notes.push(`${entry.date ?? entry.image_url}: image ${result.error}`);
      }
    }
    if (notes.length) content.push(text(notes.join('\n')));

    const dates = data.map((entry) => entry.date).filter(Boolean);
    const name = dates.length > 1 ? `APOD ${dates[0]} to ${dates.at(-1)}` : `APOD ${dates[0] ?? 'latest'}`;
    return {
      content,
      resource: { name, mimeType: 'application/json', text: json({ source, data }), source }
    };
  }
});
