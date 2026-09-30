import { z } from 'zod';
import { defineTool, READ_ONLY_REMOTE } from '../../tools/types';
import { htmlToText } from '../../util/html';
import { httpRequest } from '../../util/http';
import { boundedText, json, sourceInfo } from '../common';

const SERVICE = 'NASA Technology Transfer API';
/**
 * api.nasa.gov/techtransfer only serves a help page, which points at this
 * host: /api/api/{collection}/{keywords}. No key is needed.
 */
const TECHTRANSFER_API_BASE_URL = 'https://technology.nasa.gov/api/api';
const EXCERPT_CHARS = 400;

const COLLECTIONS = {
  patent: { label: 'patents', page: (id: string) => `https://technology.nasa.gov/patent/${encodeURIComponent(id)}` },
  patent_issued: { label: 'issued patents', page: (id: string) => `https://technology.nasa.gov/patent/${encodeURIComponent(id)}` },
  software: { label: 'software', page: (id: string) => `https://software.nasa.gov/software/${encodeURIComponent(id)}` },
  spinoff: { label: 'spinoffs', page: undefined }
} as const;
type Collection = keyof typeof COLLECTIONS;

export const techTransferInputSchema = z.strictObject({
  query: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[^/\\?#%]+$/, 'must not contain / \\ ? # or %')
    .describe('Keywords to search for, e.g. "engine" or "solar panel".'),
  collection: z
    .enum(Object.keys(COLLECTIONS) as [Collection, ...Collection[]])
    .default('patent')
    .describe('What to search: patent (licensable patents), patent_issued, software (NASA Software Catalog) or spinoff (Spinoff stories).'),
  limit: z.int().min(1).max(50).default(10).describe('How many results to return (1-50). The service returns every match; the rest are counted but not shown.')
});

/**
 * Results are positional arrays: [0] record id, [1] case number, [2] title,
 * [3] abstract, [4] case number, [5] category, [6] release type (software),
 * [7] notes, [8] link (software), [9] NASA center, [10] image, [12] score.
 */
type Row = unknown[];
const field = (row: Row, index: number) => (typeof row[index] === 'string' ? htmlToText(row[index] as string) : '');

/** An http(s) link from a result field, percent-encoded (image paths can contain spaces). */
function link(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function describe(row: Row, collection: Collection): string {
  const caseNumber = field(row, 1) || field(row, 4);
  const lines = [`## ${field(row, 2) || 'Untitled'}${caseNumber ? ` (${caseNumber})` : ''}`];
  const facts = [field(row, 5) && `Category: ${field(row, 5)}`, field(row, 9) && `Center: ${field(row, 9)}`, field(row, 6) && `Release: ${field(row, 6)}`];
  if (facts.some(Boolean)) lines.push(facts.filter(Boolean).join(' · '));
  const page = COLLECTIONS[collection].page;
  if (page && caseNumber) lines.push(`Page: ${page(caseNumber)}`);
  const more = link(field(row, 8));
  if (more) lines.push(`Link: ${more}`);
  const image = link(field(row, 10));
  if (image) lines.push(`Image: ${image}`);
  let abstract = field(row, 3);
  if (abstract.length > EXCERPT_CHARS) abstract = `${abstract.slice(0, EXCERPT_CHARS).trimEnd()}…`;
  if (abstract) lines.push('', abstract);
  return lines.join('\n');
}

export const techTransferTool = defineTool({
  name: 'nasa_techtransfer',
  title: 'NASA Technology Transfer search',
  description:
    "Search NASA's Technology Transfer portfolio (technology.nasa.gov): patents available for licensing, issued patents, the NASA Software Catalog, " +
    'or Spinoff stories about commercial products that use NASA technology. No API key needed.',
  inputSchema: techTransferInputSchema,
  annotations: READ_ONLY_REMOTE,
  async handler({ args, ctx }) {
    const url = `${TECHTRANSFER_API_BASE_URL}/${args.collection}/${encodeURIComponent(args.query)}`;
    const response = await httpRequest(ctx.fetch, { service: SERVICE, url });
    const data = response.json<{ results?: Row[]; total?: number }>();
    const source = sourceInfo(ctx, SERVICE, response.url);
    const rows = (Array.isArray(data.results) ? data.results : []).filter(Array.isArray);
    const shown = rows.slice(0, args.limit);
    const total = typeof data.total === 'number' ? data.total : rows.length;
    const label = COLLECTIONS[args.collection].label;
    const summary = total === 0 ? `No NASA ${label} match "${args.query}".` : `${total} NASA ${label} match "${args.query}"; showing ${shown.length}.`;
    return {
      content: [boundedText([summary, ...shown.map((row) => describe(row, args.collection))].join('\n\n'), SERVICE, 'Use a smaller limit.')],
      resource: {
        name: `Technology Transfer ${args.collection} "${args.query}"`,
        mimeType: 'application/json',
        text: json({ source, data: { total, results: shown } }),
        source
      }
    };
  }
});
