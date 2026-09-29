import { ConfigurationError, UpstreamError } from '../util/errors';
import { httpRequest, type HttpRequest, type HttpResponse } from '../util/http';
import { redact } from '../util/redact';
import type { ImageContent, SourceInfo, TextContent, ToolContext, ToolOutput } from '../tools/types';

export const NASA_API_BASE_URL = 'https://api.nasa.gov';
export const JPL_SSD_API_BASE_URL = 'https://ssd-api.jpl.nasa.gov';

/** Largest text block a tool returns; bigger results fail with a clear message. */
export const MAX_TEXT_CHARS = 250_000;
/** Largest image embedded as base64 in a tool result. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type QueryValue = string | number | boolean | undefined | null;

export function buildUrl(base: string, params: Record<string, QueryValue> = {}): URL {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }
  return url;
}

export function text(value: string): TextContent {
  return { type: 'text', text: value };
}

export function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/** Rejects oversized text instead of flooding the client's context. */
export function boundedText(value: string, service: string, hint: string): TextContent {
  if (value.length > MAX_TEXT_CHARS) {
    throw new UpstreamError(
      service,
      'too_large',
      `${service} returned ${value.length} characters, above this server's ${MAX_TEXT_CHARS}-character limit. ${hint}`
    );
  }
  return text(value);
}

export function sourceInfo(ctx: ToolContext, service: string, url: string): SourceInfo {
  return { service, url: redact(url), retrieved_at: ctx.now().toISOString() };
}

export function requireNasaApiKey(ctx: ToolContext): string {
  const key = ctx.config.nasaApiKey;
  if (!key) {
    throw new ConfigurationError(
      'NASA_API_KEY is not set. Get a free key at https://api.nasa.gov/ and set NASA_API_KEY (or pass --nasa-api-key). ' +
        'The public DEMO_KEY also works for light use.'
    );
  }
  return key;
}

/** GET an api.nasa.gov endpoint with the configured key. */
export async function nasaApiGet(
  ctx: ToolContext,
  service: string,
  path: string,
  params: Record<string, QueryValue>,
  options: Partial<HttpRequest> = {}
): Promise<HttpResponse> {
  const key = requireNasaApiKey(ctx);
  const url = buildUrl(`${NASA_API_BASE_URL}${path}`, { ...params, api_key: key });
  return httpRequest(ctx.fetch, { service, url, ...options });
}

export function jsonResult(
  service: string,
  summary: string,
  data: unknown,
  source: SourceInfo,
  resourceName: string,
  hint = 'Narrow the query (for example a smaller date range or limit).'
): ToolOutput {
  const body = json(data);
  return {
    content: [text(summary), boundedText(body, service, hint)],
    resource: { name: resourceName, mimeType: 'application/json', text: json({ source, data }), source }
  };
}

const IMAGE_HOST_SUFFIXES = ['.nasa.gov'];

/**
 * Downloads an image for inline display. Only HTTPS URLs on nasa.gov hosts
 * are fetched (upstream responses decide the URL, so it is untrusted), and
 * only genuine image responses are returned.
 */
export async function fetchImage(
  ctx: ToolContext,
  service: string,
  rawUrl: string
): Promise<{ image: ImageContent } | { error: string }> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { error: 'invalid image URL' };
  }
  if (url.protocol === 'http:' && IMAGE_HOST_SUFFIXES.some((s) => url.hostname.endsWith(s))) {
    url.protocol = 'https:';
  }
  if (url.protocol !== 'https:' || !IMAGE_HOST_SUFFIXES.some((s) => url.hostname.endsWith(s))) {
    return { error: `not embedded: ${url.hostname} is not an allowed image host` };
  }
  try {
    const response = await httpRequest(ctx.fetch, { service, url, maxBytes: MAX_IMAGE_BYTES, timeoutMs: 30_000 });
    const mimeType = response.contentType.split(';')[0].trim().toLowerCase();
    if (!mimeType.startsWith('image/')) {
      return { error: `not embedded: response was ${mimeType || 'untyped'}, not an image` };
    }
    return { image: { type: 'image', data: response.body.toString('base64'), mimeType } };
  } catch (error) {
    return { error: `not embedded: ${error instanceof Error ? error.message : String(error)}` };
  }
}
