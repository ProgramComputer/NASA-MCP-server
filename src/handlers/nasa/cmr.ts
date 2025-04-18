import { z } from 'zod';
import axios from 'axios';
import { addResource } from '../../resources';

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
    
    // Determine the correct format extension for the URL
    let formatExtension = format;
    if (format === 'json') {
      formatExtension = 'json';
    } else if (format === 'umm_json') {
      formatExtension = 'umm_json';
    }
    
    // Determine search endpoint based on search type
    const endpoint = `/${search_type}.${formatExtension}`;
    
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
        'Client-Id': 'NASA-MCP-Server',
        'Accept': format === 'json' || format === 'umm_json' ? 'application/json' : undefined
      },
      timeout: 30000 // 30 second timeout
    });
    
    // Parse the response based on format
    let data;
    if (format === 'json' || format === 'umm_json') {
      data = response.data;
    } else {
      // For non-JSON formats, just return the raw text
      data = {
        raw: response.data,
        format: format
      };
    }
    
    // Format the response to match MCP expectations
    let summary = '';
    let formattedData;
    
    if (search_type === 'collections') {
      const collectionsCount = 
        format === 'json' ? (data.feed?.entry?.length || 0) : 
        format === 'umm_json' ? (data.items?.length || 0) : 
        0;
      summary = `Found ${collectionsCount} NASA collections`;
      formattedData = data;
    } else {
      const granulesCount = 
        format === 'json' ? (data.feed?.entry?.length || 0) : 
        format === 'umm_json' ? (data.items?.length || 0) : 
        0;
      summary = `Found ${granulesCount} data granules`;
      formattedData = data;
    }
    
    // Create a resource ID
    const resourceParams = [];
    if (params.keyword) resourceParams.push(`keyword=${encodeURIComponent(params.keyword)}`);
    if (params.concept_id) resourceParams.push(`concept_id=${params.concept_id}`);
    if (temporal) resourceParams.push(`temporal=${encodeURIComponent(temporal)}`);
    
    const resourceId = `nasa://cmr/${search_type}${resourceParams.length > 0 ? '?' + resourceParams.join('&') : ''}`;
    
    // Register the response as a resource
    addResource(resourceId, {
      name: `NASA CMR ${search_type} search${params.keyword ? ` for "${params.keyword}"` : ''}`,
      mimeType: 'application/json',
      text: JSON.stringify(formattedData, null, 2)
    });
    
    // If the response includes specific collections or granules, register those too
    if (formattedData.feed?.entry && Array.isArray(formattedData.feed.entry)) {
      formattedData.feed.entry.forEach((entry: any, index: number) => {
        if (index < 5) { // Limit to first 5 entries to avoid too many resources
          const entryId = entry.id || entry['concept-id'] || `${search_type}-${index}`;
          const entryTitle = entry.title || `NASA ${search_type} Item ${index + 1}`;
          
          const entryResourceId = `nasa://cmr/${search_type}/item?id=${entryId}`;
          
          addResource(entryResourceId, {
            name: entryTitle,
            mimeType: 'application/json',
            text: JSON.stringify(entry, null, 2)
          });
        }
      });
    }
    
    return {
      content: [
        {
          type: "text",
          text: summary
        },
        {
          type: "text",
          text: JSON.stringify(formattedData, null, 2)
        }
      ],
      isError: false
    };
  } catch (error: any) {
    console.error('Error in CMR handler:', error);
    
    // Proper error handling with isError flag
    return {
      isError: true,
      content: [{
        type: "text",
        text: `Error searching NASA Common Metadata Repository: ${error.message || 'Unknown error'}`
      }]
    };
  }
}

// Export the handler function directly as default
export default nasaCmrHandler; 
