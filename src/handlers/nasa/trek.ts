import { z } from 'zod';
import { defineTool, READ_ONLY_REMOTE, type ToolContent } from '../../tools/types';
import { ToolInputError, UpstreamError } from '../../util/errors';
import { decodeEntities } from '../../util/html';
import { httpRequest } from '../../util/http';
import { boundedText, buildUrl, json, MAX_IMAGE_BYTES, sourceInfo, text } from '../common';

const SERVICE = 'NASA Solar System Treks';
const TREK_BASE_URL = 'https://trek.nasa.gov';

type Projection = 'equirectangular' | 'north_pole' | 'south_pole';

/** Catalog projection identifiers, as they appear in each layer's trekProjection field. */
const BODIES = {
  mars: {
    name: 'Mars',
    crs: { equirectangular: 'urn:ogc:def:crs:EPSG::104905', north_pole: 'urn:ogc:def:crs:IAU2000::49918', south_pole: 'urn:ogc:def:crs:IAU2000::49920' }
  },
  moon: {
    name: 'Moon',
    crs: { equirectangular: 'urn:ogc:def:crs:EPSG::104903', north_pole: 'urn:ogc:def:crs:IAU2000::30118', south_pole: 'urn:ogc:def:crs:IAU2000::30120' }
  },
  vesta: {
    name: 'Vesta',
    crs: { equirectangular: 'urn:ogc:def:crs:IAU2000::2000004', north_pole: 'urn:ogc:def:crs:trek::vesta_np', south_pole: 'urn:ogc:def:crs:trek::vesta_sp' }
  }
} as const;
type Body = keyof typeof BODIES;
const BODY_NAMES = Object.keys(BODIES) as [Body, ...Body[]];
const PROJECTION_DIRS: Record<Projection, string> = { equirectangular: 'EQ', north_pole: 'NP', south_pole: 'SP' };

const bodySchema = z.enum(BODY_NAMES).describe('Body: mars, moon or vesta.');
const projectionSchema = z
  .enum(['equirectangular', 'north_pole', 'south_pole'])
  .default('equirectangular')
  .describe('Map projection: equirectangular (global), north_pole or south_pole (polar stereographic).');

function layerEndpoint(body: Body, projection: Projection, layer: string): string {
  return `${TREK_BASE_URL}/tiles/${BODIES[body].name}/${PROJECTION_DIRS[projection]}/${layer}`;
}

export const trekLayersInputSchema = z.strictObject({
  body: bodySchema,
  projection: projectionSchema,
  search: z.string().trim().min(1).max(100).describe('Keywords to match, e.g. "olympus", "LRO WAC" or "HiRISE".').optional(),
  limit: z.int().min(1).max(50).default(20).describe('How many layers to return (1-50).')
});

/* eslint-disable @typescript-eslint/no-explicit-any -- loosely typed upstream JSON */
export const trekLayersTool = defineTool({
  name: 'nasa_trek_layers',
  title: 'NASA Trek map layers (Mars, Moon, Vesta)',
  description:
    'Search the map layer catalogs of NASA Mars Trek, Moon Trek and Vesta Trek (trek.nasa.gov): mosaics, colour hillshades and other imagery ' +
    'served as OGC WMTS tiles. Returns layer IDs for nasa_trek_tile, with mission, instrument and WMTS endpoint. No API key needed.',
  inputSchema: trekLayersInputSchema,
  annotations: READ_ONLY_REMOTE,
  async handler({ args, ctx }) {
    const body = BODIES[args.body];
    const index = args.projection === 'equirectangular' ? 'eq' : 'polar';
    // The same visible-layer filter the Trek API docs page uses, plus the projection.
    const url = buildUrl(`${TREK_BASE_URL}/${args.body}/TrekServices/ws/index/${index}/searchItems`, {
      start: 0,
      rows: args.limit,
      key: args.search,
      facetKeys: 'itemType|productCat2|serviceTypes|thumbnailURLDir|trekProjection',
      facetValues: `product|-(DEM ConfidenceRaw Slope)|Mosaic|[* TO *]|"${body.crs[args.projection]}"`
    });
    const response = await httpRequest(ctx.fetch, { service: SERVICE, url });
    const data = response.json<{ response?: { numFound?: number; docs?: any[] } }>();
    const source = sourceInfo(ctx, SERVICE, response.url);
    const docs = Array.isArray(data.response?.docs) ? data.response!.docs : [];
    const total = data.response?.numFound ?? docs.length;
    const where = `${body.name} Trek ${args.projection.replace('_', ' ')} layers${args.search ? ` matching "${args.search}"` : ''}`;
    const layers = docs.map((doc) => {
      const thumbnail = typeof doc.thumbnailURLDir === 'string' ? doc.thumbnailURLDir : '';
      const endpoint = thumbnail.includes('/thumbnail/') ? thumbnail.slice(0, thumbnail.indexOf('/thumbnail/')) : layerEndpoint(args.body, args.projection, doc.productLabel);
      return {
        layer: doc.productLabel as string,
        title: doc.title as string,
        mission: doc.mission,
        instrument: doc.instrument,
        category: [doc.productCat1, doc.productCat2].filter(Boolean).join(' / ') || undefined,
        coverage: doc.coverage,
        wmts_endpoint: endpoint,
        capabilities: `${endpoint}/1.0.0/WMTSCapabilities.xml`
      };
    });
    const lines = layers.map(
      (l) =>
        `- ${l.layer}: ${l.title}` +
        `${[l.mission, l.instrument].filter(Boolean).length ? ` (${[l.mission, l.instrument].filter(Boolean).join(', ')})` : ''}` +
        `${l.category ? `, ${l.category}` : ''}${l.coverage ? `, ${String(l.coverage).toLowerCase()} coverage` : ''}\n  WMTS: ${l.wmts_endpoint}`
    );
    const summary = total === 0 ? `No ${where}.` : `${total} ${where}; showing ${layers.length}. Fetch tiles with nasa_trek_tile.`;
    return {
      content: [boundedText([summary, ...lines].join('\n'), SERVICE, 'Use a smaller limit.')],
      resource: { name: where, mimeType: 'application/json', text: json({ source, data: { total, layers } }), source }
    };
  }
});
/* eslint-enable @typescript-eslint/no-explicit-any */

export const trekTileInputSchema = z
  .strictObject({
    body: bodySchema,
    layer: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_.-]{1,200}$/, 'must be a Trek layer ID such as Mars_MGS_MOLA_ClrShade_merge_global_463m')
      .describe('Layer ID from nasa_trek_layers, e.g. Mars_MGS_MOLA_ClrShade_merge_global_463m or LRO_WAC_Mosaic_Global_303ppd_v02.'),
    projection: projectionSchema,
    zoom: z.int().min(0).max(30).default(0).describe('Zoom level (WMTS TileMatrix). 0 is the whole layer; each level doubles the resolution.'),
    row: z.int().min(0).max(2 ** 31).describe('Tile row (0 at the top). Provide row and col, or latitude and longitude.').optional(),
    col: z.int().min(0).max(2 ** 31).describe('Tile column (0 at the left).').optional(),
    latitude: z.number().min(-90).max(90).describe('Equirectangular only: pick the tile containing this latitude (degrees).').optional(),
    longitude: z.number().min(-180).max(360).describe('Equirectangular only: pick the tile containing this longitude (degrees east, -180 to 360).').optional()
  })
  .superRefine((args, ctx) => {
    const byIndex = args.row !== undefined || args.col !== undefined;
    const byPoint = args.latitude !== undefined || args.longitude !== undefined;
    if (byIndex && byPoint) ctx.addIssue({ code: 'custom', message: 'use row/col or latitude/longitude, not both' });
    if (byPoint && (args.latitude === undefined || args.longitude === undefined)) {
      ctx.addIssue({ code: 'custom', message: 'latitude and longitude must be given together' });
    }
    if (byPoint && args.projection !== 'equirectangular') {
      ctx.addIssue({ code: 'custom', path: ['projection'], message: 'latitude/longitude tile lookup needs the equirectangular projection' });
    }
  });

interface TileMatrix {
  id: string;
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  topLeft: [number, number];
}

interface Capabilities {
  template: string;
  format: string;
  style: string;
  matrixSet: string;
  matrices: TileMatrix[];
}

const tag = (xml: string, name: string) => new RegExp(`<(?:ows:)?${name}>([^<]*)</(?:ows:)?${name}>`).exec(xml)?.[1]?.trim();

/** Reads the parts of a Trek WMTSCapabilities document needed to address one tile. */
export function parseTrekCapabilities(document: string): Capabilities | null {
  // Some Trek capabilities keep retired TileMatrix entries inside XML comments.
  const xml = document.replace(/<!--[\s\S]*?-->/g, '');
  const layer = /<Layer>([\s\S]*?)<\/Layer>/.exec(xml)?.[1];
  if (!layer) return null;
  const resource = /<ResourceURL\b[^>]*\btemplate="([^"]+)"[^>]*>/.exec(layer);
  const format = /<ResourceURL\b[^>]*\bformat="([^"]+)"/.exec(layer)?.[1] ?? tag(layer, 'Format') ?? '';
  const style = tag(/<Style\b[\s\S]*?<\/Style>/.exec(layer)?.[0] ?? '', 'Identifier') ?? 'default';
  const matrixSet = tag(/<TileMatrixSetLink>[\s\S]*?<\/TileMatrixSetLink>/.exec(layer)?.[0] ?? '', 'TileMatrixSet');
  if (!resource || !matrixSet) return null;
  const setBlock = [...xml.matchAll(/<TileMatrixSet>([\s\S]*?)<\/TileMatrixSet>/g)].map((m) => m[1]).find((block) => tag(block, 'Identifier') === matrixSet) ?? xml;
  const matrices = [...setBlock.matchAll(/<TileMatrix>([\s\S]*?)<\/TileMatrix>/g)].map(({ 1: block }) => {
    const [left, top] = (tag(block, 'TopLeftCorner') ?? '0 0').split(/\s+/).map(Number);
    return {
      id: tag(block, 'Identifier') ?? '',
      width: Number(tag(block, 'MatrixWidth')),
      height: Number(tag(block, 'MatrixHeight')),
      tileWidth: Number(tag(block, 'TileWidth')),
      tileHeight: Number(tag(block, 'TileHeight')),
      topLeft: [left, top] as [number, number]
    };
  });
  return { template: decodeEntities(resource[1]), format, style, matrixSet, matrices };
}

/** A global equirectangular matrix (2:1, anchored at -180,90) maps tiles to plain lon/lat boxes. */
function isGlobalEquirectangular(matrix: TileMatrix): boolean {
  return matrix.width === 2 * matrix.height && matrix.topLeft[0] === -180 && matrix.topLeft[1] === 90;
}

export const trekTileTool = defineTool({
  name: 'nasa_trek_tile',
  title: 'NASA Trek map tile (Mars, Moon, Vesta)',
  description:
    'One WMTS map tile image from NASA Mars Trek, Moon Trek or Vesta Trek for a layer from nasa_trek_layers, addressed by zoom/row/col ' +
    'or (equirectangular layers) by latitude/longitude. Reads the layer\'s WMTS capabilities to validate the tile and pick the format. No API key needed.',
  inputSchema: trekTileInputSchema,
  annotations: READ_ONLY_REMOTE,
  async handler({ args, ctx }) {
    const body = BODIES[args.body];
    const endpoint = layerEndpoint(args.body, args.projection, args.layer);
    const capabilitiesUrl = `${endpoint}/1.0.0/WMTSCapabilities.xml`;
    let xml: string;
    try {
      xml = (await httpRequest(ctx.fetch, { service: SERVICE, url: capabilitiesUrl })).text();
    } catch (error) {
      if (error instanceof UpstreamError && error.status === 404) {
        throw new ToolInputError(`${body.name} Trek has no ${args.projection.replace('_', ' ')} layer "${args.layer}"; find layer IDs with nasa_trek_layers`);
      }
      throw error;
    }
    const caps = parseTrekCapabilities(xml);
    if (!caps || caps.matrices.length === 0) {
      throw new UpstreamError(SERVICE, 'invalid_response', `${SERVICE} returned WMTS capabilities for ${args.layer} that could not be read.`);
    }
    const matrix = caps.matrices.find((m) => m.id === String(args.zoom));
    if (!matrix) {
      throw new ToolInputError(`zoom ${args.zoom} is not available for ${args.layer}; zoom levels are ${caps.matrices.map((m) => m.id).join(', ')}`);
    }
    let row = args.row ?? 0;
    let col = args.col ?? 0;
    if (args.latitude !== undefined && args.longitude !== undefined) {
      if (!isGlobalEquirectangular(matrix)) throw new ToolInputError(`${args.layer} does not use a global lon/lat tile grid; give row and col instead`);
      const lon = args.longitude > 180 ? args.longitude - 360 : args.longitude;
      col = Math.min(matrix.width - 1, Math.floor(((lon + 180) / 360) * matrix.width));
      row = Math.min(matrix.height - 1, Math.floor(((90 - args.latitude) / 180) * matrix.height));
    }
    if (row >= matrix.height || col >= matrix.width) {
      throw new ToolInputError(`zoom ${args.zoom} has rows 0-${matrix.height - 1} and columns 0-${matrix.width - 1}`);
    }

    const tileUrl = new URL(
      caps.template
        .replace('{Style}', caps.style)
        .replace('{TileMatrixSet}', caps.matrixSet)
        .replace('{TileMatrix}', matrix.id)
        .replace('{TileRow}', String(row))
        .replace('{TileCol}', String(col))
    );
    tileUrl.pathname = tileUrl.pathname.replace(/\/{2,}/g, '/');
    if (tileUrl.protocol === 'http:') tileUrl.protocol = 'https:';
    if (tileUrl.hostname !== 'trek.nasa.gov' || tileUrl.protocol !== 'https:') {
      throw new UpstreamError(SERVICE, 'invalid_response', `${SERVICE} advertised a tile URL outside trek.nasa.gov; it was not fetched.`);
    }

    const lines = [
      `${body.name} Trek tile: layer ${args.layer} (${args.projection.replace('_', ' ')}), zoom ${matrix.id}, row ${row}, column ${col} of a ${matrix.width}×${matrix.height} grid ` +
        `(${matrix.tileWidth}×${matrix.tileHeight} px).`
    ];
    if (isGlobalEquirectangular(matrix)) {
      const lonSpan = 360 / matrix.width;
      const latSpan = 180 / matrix.height;
      const west = -180 + col * lonSpan;
      const north = 90 - row * latSpan;
      lines.push(`Covers longitude ${west} to ${west + lonSpan}, latitude ${north - latSpan} to ${north} (degrees).`);
    }
    lines.push(`Zoom levels: ${caps.matrices[0].id}-${caps.matrices.at(-1)!.id}.`, `Tile URL: ${tileUrl.toString()}`);

    const response = await httpRequest(ctx.fetch, {
      service: SERVICE,
      url: tileUrl,
      maxBytes: MAX_IMAGE_BYTES,
      acceptStatus: (status) => status === 200 || status === 404
    });
    const source = sourceInfo(ctx, SERVICE, response.url);
    const mimeType = response.contentType.split(';')[0].trim().toLowerCase();
    const content: ToolContent[] = [];
    if (response.status === 404) {
      lines.push('No tile exists here: the layer has no data coverage for this tile.');
    } else if (!mimeType.startsWith('image/')) {
      throw new UpstreamError(SERVICE, 'invalid_response', `${SERVICE} returned ${mimeType || 'untyped'} content instead of a tile image.`);
    } else {
      content.push({ type: 'image', data: response.body.toString('base64'), mimeType });
    }
    return {
      content: [text(lines.join('\n')), ...content],
      resource: {
        name: `${body.name} Trek ${args.layer} z${matrix.id} r${row} c${col}`,
        mimeType: 'application/json',
        text: json({ source, data: { layer: args.layer, body: args.body, projection: args.projection, zoom: matrix.id, row, col, tile_url: tileUrl.toString(), capabilities: capabilitiesUrl } }),
        source
      }
    };
  }
});
