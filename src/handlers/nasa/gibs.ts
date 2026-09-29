import { z } from 'zod';
import { defineTool, READ_ONLY_REMOTE } from '../../tools/types';
import { ToolInputError, UpstreamError } from '../../util/errors';
import { httpRequest, summarizeErrorBody } from '../../util/http';
import { boundingBoxSchema, formatNumber, isoDate } from '../../util/validation';
import { buildUrl, json, sourceInfo, text } from '../common';

const SERVICE = 'NASA GIBS WMS';
const WMS_URL = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi';
const MAX_SIDE_PIXELS = 4096;

export const gibsInputSchema = z.strictObject({
  layer: z
    .string()
    .regex(/^[A-Za-z0-9_.-]+$/, 'must be a GIBS layer identifier')
    .describe('GIBS layer identifier, e.g. MODIS_Terra_CorrectedReflectance_TrueColor'),
  date: isoDate('Imagery date (YYYY-MM-DD).'),
  format: z.enum(['png', 'jpg', 'jpeg']).default('png').describe('Image format.'),
  resolution: z
    .number()
    .gt(0)
    .max(40)
    .default(2)
    .describe('Output resolution in pixels per degree (default 2, i.e. 720x360 for the whole globe).'),
  bbox: boundingBoxSchema
    .default([-180, -90, 180, 90])
    .describe('Area as west,south,east,north in decimal degrees (EPSG:4326). Defaults to the whole globe.')
});

export const gibsTool = defineTool({
  name: 'nasa_gibs',
  title: 'NASA GIBS satellite imagery',
  description:
    'Render a Global Imagery Browse Services (GIBS) layer for a date and bounding box as an image (WMS GetMap, EPSG:4326).',
  inputSchema: gibsInputSchema,
  annotations: READ_ONLY_REMOTE,
  async handler({ args, ctx }) {
    const [west, south, east, north] = args.bbox;
    if (west > east) {
      throw new ToolInputError('bbox crosses the antimeridian (west > east); request each side separately.');
    }
    const width = Math.round((east - west) * args.resolution);
    const height = Math.round((north - south) * args.resolution);
    if (width < 1 || height < 1 || width > MAX_SIDE_PIXELS || height > MAX_SIDE_PIXELS) {
      throw new ToolInputError(
        `bbox and resolution produce a ${width}x${height} image; each side must be between 1 and ${MAX_SIDE_PIXELS} pixels.`
      );
    }
    const mime = args.format === 'png' ? 'image/png' : 'image/jpeg';
    // WMS 1.3.0 with EPSG:4326 uses latitude-first axis order.
    const url = buildUrl(WMS_URL, {
      SERVICE: 'WMS',
      VERSION: '1.3.0',
      REQUEST: 'GetMap',
      FORMAT: mime,
      LAYERS: args.layer,
      CRS: 'EPSG:4326',
      BBOX: [south, west, north, east].map(formatNumber).join(','),
      WIDTH: width,
      HEIGHT: height,
      TIME: args.date
    });
    const response = await httpRequest(ctx.fetch, { service: SERVICE, url });
    const contentType = response.contentType.split(';')[0].trim().toLowerCase();
    if (!contentType.startsWith('image/')) {
      // GIBS reports WMS errors as XML ServiceExceptionReports with HTTP 200.
      const message = /<ServiceException(?:\s[^>]*)?>([\s\S]*?)<\/ServiceException>/i
        .exec(response.text())?.[1]
        ?.replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      throw new UpstreamError(SERVICE, 'invalid_response', `${SERVICE} did not return an image: ${message ?? summarizeErrorBody(response.text(), contentType)}`);
    }
    const source = sourceInfo(ctx, SERVICE, response.url);
    const metadata = { layer: args.layer, date: args.date, bbox: args.bbox, width, height, mimeType: contentType, source };
    return {
      content: [
        text(`GIBS ${args.layer} on ${args.date}, bbox ${args.bbox.join(',')}, ${width}x${height} ${contentType}.`),
        { type: 'image', data: response.body.toString('base64'), mimeType: contentType }
      ],
      resource: { name: `GIBS ${args.layer} ${args.date}`, mimeType: 'application/json', text: json(metadata), source }
    };
  }
});
