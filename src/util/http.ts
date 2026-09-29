import { UpstreamError } from './errors';
import { redact } from './redact';

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;

export interface HttpRequest {
  /** Human-readable service name used in error messages. */
  service: string;
  url: string | URL;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: FormData | string;
  timeoutMs?: number;
  maxBytes?: number;
  /** Statuses treated as a successful response. Defaults to 2xx. */
  acceptStatus?: (status: number) => boolean;
}

export interface HttpResponse {
  status: number;
  headers: Headers;
  /** Final URL with credentials removed. */
  url: string;
  contentType: string;
  body: Buffer;
  text(): string;
  json<T = unknown>(): T;
}

const defaultAccept = (status: number) => status >= 200 && status < 300;

function isTimeout(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name;
  return name === 'TimeoutError' || name === 'AbortError';
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const date = Date.parse(value);
  if (Number.isFinite(date)) return Math.max(0, Math.round((date - Date.now()) / 1000));
  return undefined;
}

/** Heuristic for HTML error pages served where data was expected. */
export function looksLikeHtml(text: string): boolean {
  return /^\s*(<!doctype html|<html[\s>]|<head[\s>]|<body[\s>])/i.test(text);
}

/**
 * Extracts a short, sanitized error message from an upstream error body.
 * Understands the JSON error shapes used by CMR, api.nasa.gov and JPL.
 */
export function summarizeErrorBody(text: string, contentType: string): string {
  const trimmed = text.trim();
  if (!trimmed) return 'empty response body';
  if (contentType.includes('json') || /^[[{]/.test(trimmed)) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const candidates: unknown[] = [
        Array.isArray(parsed.errors) ? parsed.errors.join('; ') : undefined,
        Array.isArray(parsed.messages) ? parsed.messages.join('; ') : undefined,
        (parsed.error as { message?: unknown } | undefined)?.message,
        parsed.error_message,
        parsed.msg,
        parsed.message,
        typeof parsed.error === 'string' ? parsed.error : undefined
      ];
      const found = candidates.find((c) => typeof c === 'string' && c.trim());
      if (typeof found === 'string') return redact(found.trim()).slice(0, 500);
    } catch {
      // fall through to text handling
    }
  }
  if (looksLikeHtml(trimmed)) {
    const title = /<title>([^<]*)<\/title>/i.exec(trimmed)?.[1]?.trim();
    return redact(`HTML error page${title ? `: ${title}` : ''}`).slice(0, 300);
  }
  const plain = trimmed.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return redact(plain).slice(0, 300);
}

async function readBounded(response: Response, maxBytes: number, service: string): Promise<Buffer> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new UpstreamError(service, 'too_large', `${service} response is ${declared} bytes, above the ${maxBytes}-byte limit. Narrow the request.`);
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new UpstreamError(service, 'too_large', `${service} response exceeded the ${maxBytes}-byte limit. Narrow the request.`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * Performs one HTTP request with a finite deadline (covering headers and body)
 * and a bounded body size. Never includes credentials in thrown errors.
 */
export async function httpRequest(fetchImpl: FetchLike, request: HttpRequest): Promise<HttpResponse> {
  const { service } = request;
  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = request.maxBytes ?? DEFAULT_MAX_BYTES;
  const accept = request.acceptStatus ?? defaultAccept;
  const safeUrl = redact(String(request.url));

  let response: Response;
  let body: Buffer;
  try {
    response = await fetchImpl(request.url, {
      method: request.method ?? 'GET',
      headers: request.headers,
      body: request.body,
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs)
    });
    body = await readBounded(response, maxBytes, service);
  } catch (error) {
    if (error instanceof UpstreamError) throw error;
    if (isTimeout(error)) {
      throw new UpstreamError(service, 'timeout', `${service} did not respond within ${Math.round(timeoutMs / 1000)} seconds.`);
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new UpstreamError(service, 'network', `Could not reach ${service}: ${redact(detail)}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  const finalUrl = redact(response.url || safeUrl);
  const toText = () => body.toString('utf8');

  if (!accept(response.status)) {
    const summary = summarizeErrorBody(toText(), contentType);
    if (response.status === 429) {
      const retryAfter = parseRetryAfter(response.headers.get('retry-after'));
      throw new UpstreamError(
        service,
        'rate_limited',
        `${service} rate limit reached (HTTP 429)${retryAfter !== undefined ? `; retry after ${retryAfter} seconds` : ''}: ${summary}`,
        429,
        retryAfter
      );
    }
    const kind = response.status === 503 || response.status === 502 || response.status === 504 ? 'unavailable' : 'http';
    throw new UpstreamError(service, kind, `${service} returned HTTP ${response.status}: ${summary}`, response.status);
  }

  return {
    status: response.status,
    headers: response.headers,
    url: finalUrl,
    contentType,
    body,
    text: toText,
    json<T>() {
      const text = toText();
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new UpstreamError(
          service,
          'invalid_response',
          `${service} returned a non-JSON response: ${summarizeErrorBody(text, contentType)}`,
          response.status
        );
      }
    }
  };
}
