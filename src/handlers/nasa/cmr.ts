import { z } from 'zod';
import axios from 'axios';

const CMR_API_BASE_URL = 'https://cmr.earthdata.nasa.gov/search';

// Define common spatial parameter schemas
const polygonSchema = z.string().describe('Comma-separated list of lon/lat points defining a polygon');
const bboxSchema = z.string().describe('Bounding box in the format: west,south,east,north');
const pointSchema = z.string().describe('Point in the format: lon,lat');
const lineSchema = z.string().describe('Line in the format: lon1,lat1,lon2,lat2,...');
const circleSchema = z.string().describe('Circle in the format: lon,lat,radius');

// Schema for validating CMR request parameters
export const cmrParamsSchema = z.object({
  // Search type - collections or granules
  search_type: z.enum(['collections', 'granules']).default('collections'),
  
  // Basic search parameters
  keyword: z.string().optional(),
  concept_id: z.string().optional(),
  entry_title: z.string().optional(),
  short_name: z.string().optional(),
  provider: z.string().optional(),
  
  // Temporal parameters
  temporal: z.string().optional().describe('Temporal range in the format: start_date,end_date'),
  
  // Spatial parameters
  polygon: polygonSchema.optional(),
  bbox: bboxSchema.optional(),
  point: pointSchema.optional(),
  line: lineSchema.optional(),
  circle: circleSchema.optional(),
  
  // Platform, instrument, and project
  platform: z.string().optional(),
  instrument: z.string().optional(),
  project: z.string().optional(),
  
  // Processing level and data format
  processing_level_id: z.string().optional(),
  granule_data_format: z.string().optional(),
  
  // Search flags
  downloadable: z.boolean().optional(),
  browsable: z.boolean().optional(),
  online_only: z.boolean().optional(),
  
  // Facet parameters
  include_facets: z.boolean().optional(),
  
  // Pagination and sorting
  limit: z.number().optional().default(10),
  page: z.number().optional().default(1),
  offset: z.number().optional(),
  sort_key: z.string().optional(),
  
  // Result format
  format: z.enum(['json', 'umm_json', 'atom', 'echo10', 'iso19115', 'iso_smap', 'kml']).optional().default('json')
});

// Define the request parameter type based on the schema
export type CmrParams = z.infer<typeof cmrParamsSchema>;

/**
 * Handle requests for NASA's Common Metadata Repository (CMR) API
 */
export async function nasaCmrHandler(params: CmrParams) {
  try {
    const { 
      search_type, format, limit, page, offset, sort_key, include_facets,
      polygon, bbox, point, line, circle, temporal,
      ...otherParams 
    } = params;
    
    // Determine search endpoint based on search type
    const endpoint = `/${search_type}.${format}`;
    
    // Construct parameters
    const queryParams: Record<string, any> = {
      page_size: limit,
      page_num: page,
      offset,
      sort_key
    };
    
    // Add other parameters
    for (const [key, value] of Object.entries(otherParams)) {
      if (value !== undefined) {
        queryParams[key] = value;
      }
    }
    
    // Add temporal parameter if provided
    if (temporal) {
      queryParams.temporal = temporal;
    }
    
    // Add spatial parameters if provided
    if (polygon) queryParams.polygon = polygon;
    if (bbox) queryParams.bbox = bbox;
    if (point) queryParams.point = point;
    if (line) queryParams.line = line;
    if (circle) queryParams.circle = circle;
    
    // Add facet options if requested
    if (include_facets) {
      queryParams.include_facets = 'v2';
    }
    
    // Make the request to CMR directly
    const response = await axios({
      url: `${CMR_API_BASE_URL}${endpoint}`,
      params: queryParams,
      headers: {
        'Client-Id': 'NASA-MCP-Server'
      }
    });
    
    return { result: response.data };
  } catch (error: any) {
    console.error('Error in CMR handler:', error);
    
    if (error.name === 'ZodError') {
      throw {
        error: {
          type: 'invalid_request',
          message: 'Invalid request parameters',
          details: error.errors
        }
      };
    }
    
    throw {
      error: {
        type: 'server_error',
        message: error.message || 'An unexpected error occurred',
        details: error.response?.data || null
      }
    };
  }
} 