import { z } from 'zod';
import { defineTool, READ_ONLY_REMOTE, type ToolContent } from '../../tools/types';
import { UpstreamError } from '../../util/errors';
import { boundedText, fetchImage, json, nasaApiGet, sourceInfo, text } from '../common';
import { isoDate } from '../../util/validation';

const SERVICE = 'NASA Mars Rover Photos API';

export const marsRoverInputSchema = z
  .strictObject({
    rover: z.enum(['curiosity', 'opportunity', 'perseverance', 'spirit']).describe('Rover name.'),
    sol: z.int().min(0).describe('Martian sol of the photos. Provide sol or earth_date.').optional(),
    earth_date: isoDate('Earth date of the photos (YYYY-MM-DD). Provide sol or earth_date.').optional(),
    camera: z.string().regex(/^[A-Za-z_]+$/, 'must be a camera abbreviation such as FHAZ').describe('Camera abbreviation, e.g. FHAZ, NAVCAM.').optional(),
    page: z.int().min(1).describe('Result page (25 photos per page).').optional(),
    max_images: z.int().min(0).max(5).default(3).describe('How many photos to embed (0-5).')
  })
  .superRefine((args, ctx) => {
    if ((args.sol === undefined) === (args.earth_date === undefined)) {
      ctx.addIssue({ code: 'custom', message: 'provide exactly one of sol or earth_date' });
    }
  });

/* eslint-disable @typescript-eslint/no-explicit-any -- loosely typed upstream JSON */
export const marsRoverTool = defineTool({
  name: 'nasa_mars_rover',
  title: 'NASA Mars Rover Photos (retired upstream)',
  description:
    'DEPRECATED: the upstream Mars Rover Photos API (api.nasa.gov/mars-photos) has been returning HTTP 404 "No such app" since at least 2026-09-29. ' +
    'Calls still query it and report the upstream status accurately; no photos are fabricated. Requires NASA_API_KEY.',
  aliases: ['nasa/mars-rover', 'nasa-mars-rover'],
  inputSchema: marsRoverInputSchema,
  annotations: READ_ONLY_REMOTE,
  async handler({ args, ctx }) {
    let response;
    try {
      response = await nasaApiGet(ctx, SERVICE, `/mars-photos/api/v1/rovers/${args.rover}/photos`, {
        sol: args.sol,
        earth_date: args.earth_date,
        camera: args.camera,
        page: args.page
      });
    } catch (error) {
      if (error instanceof UpstreamError && error.status === 404) {
        throw new UpstreamError(
          SERVICE,
          'unavailable',
          `${error.message}. The Mars Rover Photos service appears to be retired upstream; no photos can be returned.`,
          404
        );
      }
      throw error;
    }
    const data = response.json<any>();
    const source = sourceInfo(ctx, SERVICE, response.url);
    const photos: any[] = Array.isArray(data?.photos) ? data.photos : [];
    if (photos.length === 0) {
      return {
        content: [text(`No photos found for ${args.rover} with the requested filters.`)],
        resource: { name: `Mars rover ${args.rover} photos`, mimeType: 'application/json', text: json({ source, data }), source }
      };
    }
    const listing = photos.map((photo) => ({
      id: photo.id,
      sol: photo.sol,
      earth_date: photo.earth_date,
      camera: photo.camera?.name ?? null,
      img_src: photo.img_src
    }));
    const content: ToolContent[] = [text(`Found ${photos.length} photos from ${args.rover}.`), boundedText(json(listing), SERVICE, 'Filter by camera or page.')];
    for (const photo of listing.slice(0, args.max_images)) {
      const result = await fetchImage(ctx, SERVICE, photo.img_src);
      content.push('image' in result ? result.image : text(`Photo ${photo.id}: image ${result.error}`));
    }
    return {
      content,
      resource: { name: `Mars rover ${args.rover} photos`, mimeType: 'application/json', text: json({ source, data }), source }
    };
  }
});
/* eslint-enable @typescript-eslint/no-explicit-any */
