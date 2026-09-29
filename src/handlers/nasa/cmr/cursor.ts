import { z } from 'zod';
import { ToolInputError } from '../../../util/errors';
import { CMR_FORMATS, cmrInputSchema, MAX_CURSOR_LENGTH, MAX_LIMIT, QUERY_FIELDS, SEARCH_TYPES, type CmrFormat, type QueryField, type SearchType } from './schema';

/**
 * Stateless Search After cursor.
 *
 * The cursor only carries values a caller could send directly (the canonical
 * query, presentation options and CMR's own search-after sort values). The
 * server always chooses the CMR host, path and headers, and every decoded
 * field is re-validated with the same schema as normal input, so the cursor
 * does not need a signature. It is not a capability and grants nothing.
 */
const PREFIX = 'cmr1.';
const MAX_SEARCH_AFTER_JSON = 4096;

export type CanonicalQuery = Partial<Record<QueryField, unknown>>;

export interface CursorState {
  search_type: SearchType;
  format: CmrFormat;
  query: CanonicalQuery;
  search_after: Array<string | number | boolean | null>;
  limit: number;
  response_mode: 'compact' | 'raw';
  fields?: string[];
}

const primitive = z.union([z.string().max(1024), z.number(), z.boolean(), z.null()]);

const payloadSchema = z.strictObject({
  v: z.literal(1),
  tool: z.literal('nasa_cmr'),
  search_type: z.enum(SEARCH_TYPES),
  format: z.enum(CMR_FORMATS),
  query: z.record(z.string(), z.unknown()),
  search_after: z.array(primitive).min(1).max(32),
  limit: z.int().min(1).max(MAX_LIMIT),
  response_mode: z.enum(['compact', 'raw']),
  fields: z.array(z.string()).max(40).optional()
});

const querySchema = cmrInputSchema.pick(Object.fromEntries(QUERY_FIELDS.map((field) => [field, true])) as Record<QueryField, true>).strict();

export function encodeCursor(state: CursorState): string {
  const payload = { v: 1, tool: 'nasa_cmr', ...state };
  const encoded = PREFIX + Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  if (encoded.length > MAX_CURSOR_LENGTH) {
    // Only reachable with extreme geometry; better to say so than hand out an unusable cursor.
    throw new ToolInputError(`the continuation cursor for this query would exceed ${MAX_CURSOR_LENGTH} characters; simplify the geometry or filters`);
  }
  return encoded;
}

export function parseSearchAfterHeader(value: string | null): CursorState['search_after'] | null {
  if (!value || value.length > MAX_SEARCH_AFTER_JSON) return null;
  try {
    const parsed = z.array(primitive).min(1).max(32).safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const invalid = (reason: string) =>
  new ToolInputError(`cursor is invalid (${reason}). Start a new search without cursor, or pass the exact next_cursor from the previous response.`);

export function decodeCursor(cursor: string): CursorState {
  if (cursor.length > MAX_CURSOR_LENGTH) throw invalid('too long');
  if (!cursor.startsWith(PREFIX)) throw invalid('unrecognized cursor version');
  const body = cursor.slice(PREFIX.length);
  if (!/^[A-Za-z0-9_-]+$/.test(body)) throw invalid('not base64url');
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    throw invalid('undecodable');
  }
  const payload = payloadSchema.safeParse(json);
  if (!payload.success) throw invalid('unexpected structure');
  if (JSON.stringify(payload.data.search_after).length > MAX_SEARCH_AFTER_JSON) throw invalid('search-after token too large');
  const query = querySchema.safeParse(payload.data.query);
  if (!query.success) throw invalid('query failed validation');
  const { search_type, format, search_after, limit, response_mode, fields } = payload.data;
  return {
    search_type,
    format,
    query: query.data as CanonicalQuery,
    search_after,
    limit,
    response_mode,
    ...(fields ? { fields } : {})
  };
}
