import type { ToolContext } from '../../tools/types';
import { httpRequest, type HttpResponse } from '../../util/http';
import { buildUrl, JPL_SSD_API_BASE_URL, sourceInfo, type QueryValue } from '../common';

/**
 * GET a JPL SSD API endpoint. Parameter names are passed through exactly as
 * given (callers map snake_case tool arguments to JPL's hyphenated names).
 * JPL SSD APIs do not take an api.nasa.gov key, so none is sent.
 */
export async function jplGet(
  ctx: ToolContext,
  service: string,
  path: string,
  params: Record<string, QueryValue>,
  acceptStatus?: (status: number) => boolean
): Promise<{ response: HttpResponse; source: ReturnType<typeof sourceInfo> }> {
  const url = buildUrl(`${JPL_SSD_API_BASE_URL}${path}`, params);
  const response = await httpRequest(ctx.fetch, { service, url, acceptStatus });
  return { response, source: sourceInfo(ctx, service, response.url) };
}

/** Maps { snake_case: value } to JPL's hyphenated parameter names, dropping undefined. */
export function hyphenate(params: Record<string, QueryValue>): Record<string, QueryValue> {
  const out: Record<string, QueryValue> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) out[key.replace(/_/g, '-')] = value;
  }
  return out;
}

/** JPL date bounds: YYYY-MM-DD, YYYY-MM-DDThh:mm:ss, "now", or +/-N days. */
export const JPL_DATE = /^(now|[+-]\d{1,5}|\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?)$/;
