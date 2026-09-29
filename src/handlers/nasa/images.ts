import { z } from 'zod';
import { defineTool, READ_ONLY_REMOTE, type ToolContent } from '../../tools/types';
import { httpRequest } from '../../util/http';
import { boundedText, buildUrl, fetchImage, json, sourceInfo, text } from '../common';

const SERVICE = 'NASA Image and Video Library API';
const SEARCH_URL = 'https://images-api.nasa.gov/search';
const MAX_DESCRIPTION_CHARS = 1000;

const year = (description: string) => z.string().regex(/^\d{4}$/, 'must be a four-digit year').describe(description);

export const imagesInputSchema = z
  .strictObject({
    q: z.string().trim().min(1).describe('Free-text search terms.'),
    media_type: z.enum(['image', 'video', 'audio']).describe('Restrict to one media type.').optional(),
    year_start: year('Earliest year (YYYY).').optional(),
    year_end: year('Latest year (YYYY).').optional(),
    page: z.int().min(1).max(100).default(1).describe('Result page (1-based).'),
    page_size: z.int().min(1).max(100).default(10).describe('Results per page (1-100).'),
    max_images: z
      .int()
      .min(0)
      .max(5)
      .default(3)
      .describe('How many preview thumbnails to embed (0-5). Every item is listed with its URLs.')
  })
  .superRefine((args, ctx) => {
    if (args.year_start && args.year_end && Number(args.year_start) > Number(args.year_end)) {
      ctx.addIssue({ code: 'custom', path: ['year_end'], message: 'year_end must not be before year_start' });
    }
  });

/* eslint-disable @typescript-eslint/no-explicit-any -- loosely typed upstream JSON */
export const imagesTool = defineTool({
  name: 'nasa_images',
  title: 'NASA Image and Video Library search',
  description: "Search NASA's Image and Video Library. Returns item metadata and URLs, with a bounded number of preview thumbnails embedded.",
  inputSchema: imagesInputSchema,
  annotations: READ_ONLY_REMOTE,
  async handler({ args, ctx }) {
    const url = buildUrl(SEARCH_URL, {
      q: args.q,
      media_type: args.media_type,
      year_start: args.year_start,
      year_end: args.year_end,
      page: args.page,
      page_size: args.page_size
    });
    const response = await httpRequest(ctx.fetch, { service: SERVICE, url });
    const data = response.json<any>();
    const source = sourceInfo(ctx, SERVICE, response.url);
    const items: any[] = data?.collection?.items ?? [];
    const totalHits = typeof data?.collection?.metadata?.total_hits === 'number' ? data.collection.metadata.total_hits : null;

    const results = items
      .map((item) => {
        const meta = item?.data?.[0];
        if (!meta?.nasa_id) return null;
        const description: string | undefined = meta.description;
        const links: any[] = Array.isArray(item.links) ? item.links : [];
        return {
          nasa_id: meta.nasa_id,
          title: meta.title ?? null,
          media_type: meta.media_type ?? null,
          date_created: meta.date_created ?? null,
          center: meta.center ?? null,
          description:
            description && description.length > MAX_DESCRIPTION_CHARS
              ? `${description.slice(0, MAX_DESCRIPTION_CHARS)} [truncated]`
              : description ?? null,
          preview_url: links.find((link) => link.rel === 'preview')?.href ?? null,
          asset_manifest_url: typeof item.href === 'string' ? item.href : null
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    const summary =
      results.length === 0
        ? `No NASA library items matched "${args.q}".`
        : `Found ${results.length} items on page ${args.page}${totalHits !== null ? ` of ${totalHits} total hits` : ''} for "${args.q}".`;
    const content: ToolContent[] = [text(summary)];
    if (results.length) content.push(boundedText(json(results), SERVICE, 'Use a smaller page_size.'));
    const notes: string[] = [];
    let embedded = 0;
    for (const item of results) {
      if (embedded >= args.max_images) break;
      if (item.media_type !== 'image' || !item.preview_url) continue;
      const result = await fetchImage(ctx, SERVICE, item.preview_url);
      if ('image' in result) {
        content.push(result.image);
        embedded++;
      } else {
        notes.push(`${item.nasa_id}: preview ${result.error}`);
      }
    }
    if (notes.length) content.push(text(notes.join('\n')));
    return {
      content,
      resource: { name: `NASA images search "${args.q}" page ${args.page}`, mimeType: 'application/json', text: json({ source, total_hits: totalHits, results }), source }
    };
  }
});
/* eslint-enable @typescript-eslint/no-explicit-any */
