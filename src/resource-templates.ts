import { apodInputSchema, fetchApod } from './handlers/nasa/apod';
import { epicInputSchema, fetchEpic } from './handlers/nasa/epic';
import { fetchSbdb, sbdbInputSchema } from './handlers/jpl/sbdb';
import { json } from './handlers/common';
import type { ToolContext } from './tools/types';
import { ToolInputError } from './util/errors';

export interface ResourceTemplateDefinition {
  name: string;
  title: string;
  description: string;
  uriTemplate: string;
  mimeType: string;
  /** Scheme + host + path the template matches (query parameters vary). */
  base: string;
  read(params: URLSearchParams, ctx: ToolContext): Promise<string>;
}

function parse<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: Array<{ message: string; path: PropertyKey[] }> } } }, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ToolInputError(result.error.issues.map((i) => `${i.path.map(String).join('.') || 'uri'}: ${i.message}`).join('; '));
  }
  return result.data;
}

function onlyParams(params: URLSearchParams, allowed: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of params) {
    if (!allowed.includes(key)) throw new ToolInputError(`unsupported query parameter "${key}"`);
    if (value !== '') out[key] = value;
  }
  return out;
}

/**
 * Templates are resolved by fetching real upstream data on read. Earlier
 * releases returned hard-coded sample records here; those are gone.
 */
export const RESOURCE_TEMPLATES: ResourceTemplateDefinition[] = [
  {
    name: 'nasa-apod',
    title: 'Astronomy Picture of the Day metadata',
    description: 'APOD metadata (title, explanation, image or video URL) for a date, or the latest picture when date is empty, fetched from science.nasa.gov on read. No API key needed.',
    uriTemplate: 'nasa://apod/image?date={date}',
    mimeType: 'application/json',
    base: 'nasa://apod/image',
    async read(params, ctx) {
      const args = parse(apodInputSchema, onlyParams(params, ['date']));
      const { data, source } = await fetchApod(ctx, args);
      return json({ source, data: data[0] ?? null });
    }
  },
  {
    name: 'nasa-epic',
    title: 'EPIC image metadata for a day',
    description: 'DSCOVR EPIC image metadata for a date and collection (natural or enhanced), fetched on read.',
    uriTemplate: 'nasa://epic/image?date={date}&collection={collection}',
    mimeType: 'application/json',
    base: 'nasa://epic/image',
    async read(params, ctx) {
      const args = parse(epicInputSchema, onlyParams(params, ['date', 'collection']));
      const { data, source } = await fetchEpic(ctx, args);
      return json({ source, data });
    }
  },
  {
    name: 'jpl-sbdb',
    title: 'JPL Small-Body Database record',
    description: 'SBDB record for an asteroid or comet name/designation, fetched on read.',
    uriTemplate: 'jpl://sbdb?object={object}',
    mimeType: 'application/json',
    base: 'jpl://sbdb',
    async read(params, ctx) {
      const { object } = onlyParams(params, ['object']);
      const args = parse(sbdbInputSchema, { sstr: object });
      const { data, source } = await fetchSbdb(ctx, args);
      return json({ source, data });
    }
  }
];

/** Finds the template for a concrete URI, or undefined. */
export function matchTemplate(uri: string): { template: ResourceTemplateDefinition; params: URLSearchParams } | undefined {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return undefined;
  }
  const base = `${url.protocol}//${url.host}${url.pathname === '/' ? '' : url.pathname}`;
  const template = RESOURCE_TEMPLATES.find((candidate) => candidate.base === base);
  return template ? { template, params: url.searchParams } : undefined;
}
