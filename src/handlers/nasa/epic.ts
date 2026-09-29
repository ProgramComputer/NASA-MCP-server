import { z } from 'zod';
import { defineTool, READ_ONLY_REMOTE, type ToolContext, type ToolContent } from '../../tools/types';
import { httpRequest } from '../../util/http';
import { isoDate } from '../../util/validation';
import { boundedText, fetchImage, json, sourceInfo, text } from '../common';

const SERVICE = 'NASA EPIC API';
const EPIC_API_BASE_URL = 'https://epic.gsfc.nasa.gov/api';
const EPIC_ARCHIVE_BASE_URL = 'https://epic.gsfc.nasa.gov/archive';

export const epicInputSchema = z.strictObject({
  collection: z.enum(['natural', 'enhanced']).default('natural').describe('Image collection.'),
  date: isoDate('Date of the images (YYYY-MM-DD). Defaults to the most recent available day.').optional(),
  max_images: z
    .int()
    .min(0)
    .max(3)
    .default(1)
    .describe('How many images to embed (0-3, JPEG). All images are listed with PNG and JPEG URLs.')
});

export type EpicArgs = z.output<typeof epicInputSchema>;

interface EpicImage {
  identifier: string;
  caption?: string;
  image: string;
  date: string;
  centroid_coordinates?: { lat: number; lon: number };
}

function archiveUrls(collection: string, image: EpicImage) {
  const [datePart] = image.date.split(' ');
  const [year, month, day] = datePart.split('-');
  const base = `${EPIC_ARCHIVE_BASE_URL}/${collection}/${year}/${month}/${day}`;
  return { png: `${base}/png/${image.image}.png`, jpg: `${base}/jpg/${image.image}.jpg` };
}

export async function fetchEpic(ctx: ToolContext, args: Pick<EpicArgs, 'collection' | 'date'>) {
  const path = args.date ? `/${args.collection}/date/${args.date}` : `/${args.collection}`;
  const response = await httpRequest(ctx.fetch, { service: SERVICE, url: `${EPIC_API_BASE_URL}${path}` });
  const raw = response.text().trim();
  const data = raw ? response.json<EpicImage[]>() : [];
  if (!Array.isArray(data)) {
    throw new Error('EPIC API returned an unexpected payload (expected an array)');
  }
  return { data, source: sourceInfo(ctx, SERVICE, response.url) };
}

export const epicTool = defineTool({
  name: 'nasa_epic',
  title: 'NASA EPIC Earth imagery',
  description:
    "Earth Polychromatic Imaging Camera (DSCOVR) full-disc Earth images for a day: metadata for every image plus a bounded number embedded.",
  inputSchema: epicInputSchema,
  annotations: READ_ONLY_REMOTE,
  async handler({ args, ctx }) {
    const { data, source } = await fetchEpic(ctx, args);
    if (data.length === 0) {
      return {
        content: [text(`No EPIC ${args.collection} images found for ${args.date ?? 'the most recent day'}.`)],
        resource: { name: `EPIC ${args.collection} ${args.date ?? 'latest'}`, mimeType: 'application/json', text: json({ source, data }), source }
      };
    }
    const listing = data.map((image) => ({
      identifier: image.identifier,
      date: image.date,
      caption: image.caption ?? null,
      centroid: image.centroid_coordinates ?? null,
      ...archiveUrls(args.collection, image)
    }));
    const content: ToolContent[] = [
      text(`${data.length} EPIC ${args.collection} images from ${data[0].date.split(' ')[0]}.`),
      boundedText(json(listing), SERVICE, '')
    ];
    const notes: string[] = [];
    for (const item of listing.slice(0, args.max_images)) {
      const result = await fetchImage(ctx, SERVICE, item.jpg);
      if ('image' in result) content.push(result.image);
      else notes.push(`${item.identifier}: image ${result.error}`);
    }
    if (notes.length) content.push(text(notes.join('\n')));
    return {
      content,
      resource: { name: `EPIC ${args.collection} ${args.date ?? 'latest'}`, mimeType: 'application/json', text: json({ source, data }), source }
    };
  }
});
