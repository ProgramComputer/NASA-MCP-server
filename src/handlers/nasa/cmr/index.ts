import { defineTool, READ_ONLY_REMOTE, type ToolContext, type ToolOutput } from '../../../tools/types';
import { ToolInputError, UpstreamError } from '../../../util/errors';
import { httpRequest } from '../../../util/http';
import { redact } from '../../../util/redact';
import { canonicalJson, formatBoundingBox, type BoundingBox } from '../../../util/validation';
import { SERVER_VERSION } from '../../../version';
import { MAX_TEXT_CHARS, text } from '../../common';
import { decodeCursor, encodeCursor, parseSearchAfterHeader, type CanonicalQuery, type CursorState } from './cursor';
import { countEntries, normalizeFacets, normalizeRecords, selectFields, UNAVAILABLE_FIELDS } from './normalize';
import {
  cmrInputSchema,
  cmrOutputSchema,
  COLLECTION_FIELDS,
  COLLECTION_ONLY_FIELDS,
  COLLECTION_ONLY_FORMATS,
  DEEP_PAGING_LIMIT,
  DEFAULT_FIELDS,
  GRANULE_COLLECTION_CONSTRAINTS,
  GRANULE_FIELDS,
  GRANULE_ONLY_FIELDS,
  GRANULE_ONLY_FORMATS,
  JSON_FORMATS,
  QUERY_FIELDS,
  SORT_KEYS,
  type CmrEnvelope,
  type CmrFormat,
  type CmrInput,
  type QueryField,
  type SearchType
} from './schema';

const SERVICE = 'NASA CMR';
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

type Pagination =
  | { kind: 'first' }
  | { kind: 'cursor'; searchAfter: CursorState['search_after'] }
  | { kind: 'page'; page: number }
  | { kind: 'offset'; offset: number };

export interface SearchPlan {
  searchType: SearchType;
  format: CmrFormat;
  responseMode: 'compact' | 'raw';
  /** Explicitly requested fields (undefined = defaults). */
  requestedFields?: string[];
  fields: readonly string[];
  limit: number;
  query: CanonicalQuery;
  pagination: Pagination;
  warnings: string[];
}

function canonicalQueryFromArgs(args: CmrInput): CanonicalQuery {
  if (args.bbox && args.bounding_box && canonicalJson(args.bbox) !== canonicalJson(args.bounding_box)) {
    throw new ToolInputError('bbox and bounding_box are aliases but were given different values; pass only bounding_box.');
  }
  const query: CanonicalQuery = {};
  for (const field of QUERY_FIELDS) {
    const value = field === 'bounding_box' ? args.bounding_box ?? args.bbox : args[field];
    if (value !== undefined) query[field] = value;
  }
  return query;
}

function describe(value: unknown): string {
  return value === undefined ? '(not set)' : JSON.stringify(value);
}

/**
 * Resolves the effective search: restores a cursor's query first, then checks
 * that anything the caller passed explicitly agrees with it, and only then
 * applies defaults. Pure (no I/O) so it is unit-testable.
 */
export function planSearch(args: CmrInput, provided: ReadonlySet<string>): SearchPlan {
  const warnings: string[] = [];
  const requestQuery = canonicalQueryFromArgs(args);
  let plan: SearchPlan;

  if (args.cursor !== undefined) {
    if (provided.has('page') || provided.has('offset')) {
      throw new ToolInputError('cursor cannot be combined with page or offset; use only the cursor to continue.');
    }
    const state = decodeCursor(args.cursor);
    const conflicts: string[] = [];
    if (provided.has('search_type') && args.search_type !== state.search_type) {
      conflicts.push(`search_type (cursor: ${state.search_type}, request: ${args.search_type})`);
    }
    if (provided.has('format') && args.format !== state.format) {
      conflicts.push(`format (cursor: ${state.format}, request: ${args.format})`);
    }
    for (const [field, value] of Object.entries(requestQuery) as Array<[QueryField, unknown]>) {
      if (canonicalJson(value) !== canonicalJson(state.query[field])) {
        conflicts.push(`${field} (cursor: ${describe(state.query[field])}, request: ${describe(value)})`);
      }
    }
    if (conflicts.length) {
      throw new ToolInputError(
        `cursor belongs to a different search; these arguments conflict with it: ${conflicts.join('; ')}. ` +
          'To continue, pass the cursor alone (omitted filters are restored from it). To change the search, start again without cursor.'
      );
    }
    const responseMode = provided.has('response_mode') && args.response_mode ? args.response_mode : state.response_mode;
    const requestedFields = provided.has('fields') ? args.fields : state.fields;
    plan = {
      searchType: state.search_type,
      format: state.format,
      responseMode,
      requestedFields,
      fields: [],
      limit: provided.has('limit') ? args.limit : state.limit,
      query: state.query,
      pagination: { kind: 'cursor', searchAfter: state.search_after },
      warnings
    };
  } else {
    if (args.page !== undefined && args.offset !== undefined) {
      throw new ToolInputError('page and offset cannot be combined; prefer cursor pagination.');
    }
    let pagination: Pagination = { kind: 'first' };
    if (args.page !== undefined) {
      if (args.page * args.limit > DEEP_PAGING_LIMIT) {
        throw new ToolInputError(`page ${args.page} with limit ${args.limit} goes past CMR's ${DEEP_PAGING_LIMIT}-item paging limit; use cursor pagination.`);
      }
      pagination = { kind: 'page', page: args.page };
      warnings.push('page is deprecated compatibility pagination (CMR deep paging); no next_cursor is returned. Prefer cursor pagination.');
    } else if (args.offset !== undefined) {
      if (args.offset + args.limit > DEEP_PAGING_LIMIT) {
        throw new ToolInputError(`offset ${args.offset} with limit ${args.limit} goes past CMR's ${DEEP_PAGING_LIMIT}-item paging limit; use cursor pagination.`);
      }
      pagination = { kind: 'offset', offset: args.offset };
      warnings.push('offset is deprecated compatibility pagination (CMR deep paging); no next_cursor is returned. Prefer cursor pagination.');
    }
    plan = {
      searchType: args.search_type,
      format: args.format,
      responseMode: args.response_mode ?? (JSON_FORMATS.has(args.format) ? 'compact' : 'raw'),
      requestedFields: args.fields,
      fields: [],
      limit: args.limit,
      query: requestQuery,
      pagination,
      warnings
    };
  }

  validatePlan(plan);
  plan.fields = plan.requestedFields ?? DEFAULT_FIELDS[plan.searchType];
  if (plan.requestedFields && JSON_FORMATS.has(plan.format)) {
    const unavailable = UNAVAILABLE_FIELDS[`${plan.searchType}:${plan.format}`] ?? [];
    const missing = plan.requestedFields.filter((field) => unavailable.includes(field));
    if (missing.length) {
      warnings.push(`CMR ${plan.format} ${plan.searchType} metadata does not provide ${missing.join(', ')}; those fields are null.`);
    }
  }
  return plan;
}

function validatePlan(plan: SearchPlan): void {
  const problems: string[] = [];
  const { searchType, format, query } = plan;
  if (searchType === 'granules' && COLLECTION_ONLY_FORMATS.has(format)) problems.push(`format ${format} is only available for collection searches`);
  if (searchType === 'collections' && GRANULE_ONLY_FORMATS.has(format)) problems.push(`format ${format} is only available for granule searches`);
  if (plan.responseMode === 'compact' && !JSON_FORMATS.has(format)) {
    problems.push(`response_mode compact needs format json or umm_json (format ${format} is returned raw)`);
  }
  if (plan.requestedFields && plan.responseMode === 'raw') problems.push('fields only applies to response_mode compact');
  if (plan.requestedFields) {
    const allowed: readonly string[] = searchType === 'collections' ? COLLECTION_FIELDS : GRANULE_FIELDS;
    const wrong = plan.requestedFields.filter((field) => !allowed.includes(field));
    if (wrong.length) problems.push(`fields ${wrong.join(', ')} are not available for ${searchType}; valid: ${allowed.join(', ')}`);
  }
  const present = Object.keys(query) as QueryField[];
  const wrongScope = present.filter((field) => (searchType === 'collections' ? GRANULE_ONLY_FIELDS : COLLECTION_ONLY_FIELDS).has(field));
  if (wrongScope.length) {
    problems.push(`${wrongScope.join(', ')} ${wrongScope.length === 1 ? 'applies' : 'apply'} only to ${searchType === 'collections' ? 'granule' : 'collection'} searches`);
  }
  if (searchType === 'granules' && !GRANULE_COLLECTION_CONSTRAINTS.some((field) => query[field] !== undefined)) {
    problems.push(`granule searches must identify collections with one of: ${GRANULE_COLLECTION_CONSTRAINTS.join(', ')}`);
  }
  const sortKeys = (query.sort_key as string[] | undefined) ?? [];
  const badSort = sortKeys.filter((key) => !SORT_KEYS[searchType].includes(key.replace(/^[+-]/, '')));
  if (badSort.length) problems.push(`sort_key ${badSort.join(', ')} is not valid for ${searchType}; valid: ${SORT_KEYS[searchType].join(', ')}`);
  if (problems.length) throw new ToolInputError(`Invalid nasa_cmr request: ${problems.join('; ')}.`);
}

export function buildCmrRequest(plan: SearchPlan, baseUrl: string): { url: URL; headers: Record<string, string> } {
  const url = new URL(`${baseUrl}/${plan.searchType}.${plan.format}`);
  for (const field of QUERY_FIELDS) {
    const value = plan.query[field];
    if (value === undefined) continue;
    if (field === 'bounding_box') {
      url.searchParams.set('bounding_box', formatBoundingBox(value as BoundingBox));
    } else if (field === 'include_facets') {
      if (value === true) url.searchParams.set('include_facets', 'v2');
    } else if (typeof value === 'boolean') {
      url.searchParams.set(field, String(value));
    } else if (Array.isArray(value)) {
      if (value.length === 1) url.searchParams.set(field, String(value[0]));
      else for (const item of value) url.searchParams.append(`${field}[]`, String(item));
    } else {
      url.searchParams.set(field, String(value));
    }
  }
  url.searchParams.set('page_size', String(plan.limit));
  if (plan.pagination.kind === 'page') url.searchParams.set('page_num', String(plan.pagination.page));
  if (plan.pagination.kind === 'offset') url.searchParams.set('offset', String(plan.pagination.offset));
  const headers: Record<string, string> = { 'Client-Id': `nasa-mcp-server/${SERVER_VERSION}` };
  if (plan.pagination.kind === 'cursor') headers['CMR-Search-After'] = JSON.stringify(plan.pagination.searchAfter);
  return { url, headers };
}

function intHeader(headers: Headers, name: string): number | null {
  const value = headers.get(name);
  return value && /^\d+$/.test(value.trim()) ? Number(value.trim()) : null;
}

function summarize(envelope: CmrEnvelope): string {
  const noun = envelope.search_type === 'collections' ? 'collections' : 'granules';
  if (envelope.status === 'error') return `CMR ${noun} search failed: ${envelope.error?.message ?? 'unknown error'}`;
  if (envelope.status === 'no_results') return `No CMR ${noun} matched${envelope.total_hits ? ` on this page (total hits ${envelope.total_hits})` : ''}.`;
  const count = envelope.returned_count ?? 'an unknown number of';
  let line = `Returned ${count} CMR ${noun}${envelope.total_hits !== null ? ` of ${envelope.total_hits} total hits` : ''}.`;
  if (envelope.next_cursor) line += ' More results: call nasa_cmr again with only {"cursor": <next_cursor>}.';
  return line;
}

function toOutput(envelope: CmrEnvelope, rawText?: string): ToolOutput {
  const serialized = JSON.stringify(envelope);
  if (serialized.length > MAX_TEXT_CHARS) {
    const tooLarge: CmrEnvelope = {
      ...envelope,
      status: 'error',
      results: [],
      returned_count: 0,
      next_cursor: null,
      raw: undefined,
      facets: undefined,
      error: {
        kind: 'too_large',
        message: `The ${envelope.response_mode} response is ${serialized.length} characters, above this server's ${MAX_TEXT_CHARS}-character limit. Lower limit, select fewer fields, or use compact mode.`,
        http_status: null
      }
    };
    return { isError: true, structuredContent: tooLarge, content: [text(summarize(tooLarge)), text(JSON.stringify(tooLarge))] };
  }
  const isError = envelope.status === 'error';
  const content = [text(summarize(envelope))];
  if (rawText !== undefined && !isError) {
    content.push(text(rawText));
  } else {
    content.push(text(serialized));
  }
  return {
    isError: isError || undefined,
    structuredContent: envelope,
    content,
    ...(isError
      ? {}
      : { resource: { name: `CMR ${envelope.search_type} search`, mimeType: 'application/json', text: serialized, source: envelope.source } })
  };
}

export async function runSearch(plan: SearchPlan, ctx: ToolContext): Promise<ToolOutput> {
  const { url, headers } = buildCmrRequest(plan, ctx.config.cmrBaseUrl);
  const retrievedAt = ctx.now().toISOString();
  const envelope: CmrEnvelope = {
    status: 'success',
    search_type: plan.searchType,
    format: plan.format,
    response_mode: plan.responseMode,
    results: [],
    returned_count: 0,
    total_hits: null,
    next_cursor: null,
    source: { service: SERVICE, url: redact(url.toString()), request_id: null, took_ms: null, retrieved_at: retrievedAt },
    retrieved_at: retrievedAt,
    warnings: plan.warnings
  };

  let rawText: string | undefined;
  try {
    const response = await httpRequest(ctx.fetch, { service: SERVICE, url, headers, maxBytes: MAX_RESPONSE_BYTES });
    envelope.source.request_id = response.headers.get('cmr-request-id');
    envelope.source.took_ms = intHeader(response.headers, 'cmr-took');
    envelope.total_hits = intHeader(response.headers, 'cmr-hits');
    const searchAfter = parseSearchAfterHeader(response.headers.get('cmr-search-after'));

    let count: number | null;
    if (plan.format === 'json' || plan.format === 'umm_json') {
      const body = response.json<Record<string, unknown>>();
      count = countEntries(plan.format, body);
      if (count === null) {
        throw new UpstreamError(SERVICE, 'invalid_response', `${SERVICE} returned ${plan.format} without the expected ${plan.format === 'json' ? 'feed.entry' : 'items'} array`);
      }
      if (envelope.total_hits === null && plan.format === 'umm_json' && typeof body.hits === 'number') {
        envelope.total_hits = body.hits;
      }
      if (plan.responseMode === 'compact') {
        envelope.results = normalizeRecords(plan.searchType, plan.format, body).map((record) => selectFields(record, plan.fields));
        if (plan.query.include_facets === true) envelope.facets = normalizeFacets(body);
      } else {
        envelope.raw = body;
      }
    } else {
      rawText = response.text();
      envelope.raw = rawText;
      count = null;
      envelope.warnings.push(`returned_count is null because ${plan.format} responses are passed through without parsing.`);
    }
    envelope.returned_count = count;

    const paged = plan.pagination.kind === 'page' || plan.pagination.kind === 'offset';
    const morePossible = count === null ? envelope.total_hits !== 0 : count >= plan.limit;
    if (!paged && searchAfter && morePossible) {
      envelope.next_cursor = encodeCursor({
        search_type: plan.searchType,
        format: plan.format,
        query: plan.query,
        search_after: searchAfter,
        limit: plan.limit,
        response_mode: plan.responseMode,
        ...(plan.requestedFields ? { fields: plan.requestedFields } : {})
      });
    }
    if (plan.pagination.kind === 'cursor') {
      envelope.warnings.push('Continuation page: CMR is a live catalog, so totals and ordering may change between pages (no snapshot isolation).');
    }
    envelope.status = count === 0 || (count === null && envelope.total_hits === 0) ? 'no_results' : 'success';
  } catch (error) {
    if (!(error instanceof UpstreamError)) throw error;
    envelope.status = 'error';
    envelope.results = [];
    envelope.returned_count = 0;
    envelope.next_cursor = null;
    envelope.raw = undefined;
    envelope.facets = undefined;
    envelope.error = { kind: error.kind, message: redact(error.message), http_status: error.status ?? null };
    rawText = undefined;
  }
  return toOutput(cmrOutputSchema.parse(envelope), rawText);
}

export const cmrTool = defineTool({
  name: 'nasa_cmr',
  title: 'NASA Earthdata CMR search',
  description:
    'Search NASA\'s Common Metadata Repository (CMR) for Earth science collections (datasets) or granules (files). ' +
    'Supports identifiers, temporal and spatial filters (bounding_box, point, polygon, line, circle), platform/instrument/project, facets and sorting. ' +
    'Returns a compact normalized envelope by default (response_mode raw for upstream metadata) and a next_cursor for Search After pagination: ' +
    'continue by passing only {"cursor": next_cursor}. Collection matches describe datasets; they do not prove granules exist for a given time or place. No API key needed.',
  inputSchema: cmrInputSchema,
  outputSchema: cmrOutputSchema,
  annotations: READ_ONLY_REMOTE,
  async handler({ args, provided, ctx }) {
    return runSearch(planSearch(args, provided), ctx);
  }
});
