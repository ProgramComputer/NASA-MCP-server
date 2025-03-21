import { z } from 'zod';
import axios from 'axios';
import { addResource } from '../../index';

// Schema for validating POWER request parameters
export const powerParamsSchema = z.object({
  parameters: z.string(),
  community: z.enum(['re', 'sb', 'ag']),
  format: z.enum(['json', 'csv', 'ascii', 'netcdf']).optional().default('json'),
  // Location parameters
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  // Regional parameters (alternative to lat/long)
  bbox: z.string().optional(),
  // Temporal parameters
  start: z.string().optional(),
  end: z.string().optional(),
  // Climatology parameters
  climatology_start: z.string().optional(),
  climatology_end: z.string().optional(),
  time_standard: z.enum(['utc', 'lst']).optional().default('utc')
});

export type PowerParams = z.infer<typeof powerParamsSchema>;

/**
 * Handle requests for NASA's POWER (Prediction Of Worldwide Energy Resources) API
 * Provides solar and meteorological data sets
 */
export async function nasaPowerHandler(params: PowerParams) {
  try {
    // POWER API base URL
    const POWER_API_URL = 'https://power.larc.nasa.gov/api/temporal/daily/point';
    
    // Call the NASA POWER API
    const response = await axios({
      url: POWER_API_URL,
      params: params,
      method: 'GET'
    });
    
    // Create a resource ID based on key parameters
    const resourceParams = [];
    if (params.parameters) resourceParams.push(`parameters=${params.parameters}`);
    if (params.latitude !== undefined) resourceParams.push(`lat=${params.latitude}`);
    if (params.longitude !== undefined) resourceParams.push(`lon=${params.longitude}`);
    if (params.start) resourceParams.push(`start=${params.start}`);
    if (params.end) resourceParams.push(`end=${params.end}`);
    
    const resourceId = `nasa://power/${params.community}?${resourceParams.join('&')}`;
    
    // Register the response as a resource
    addResource(resourceId, {
      name: `NASA POWER ${params.community.toUpperCase()} Data${params.latitude !== undefined ? ` at (${params.latitude}, ${params.longitude})` : ''}`,
      mimeType: params.format === 'json' ? 'application/json' : 'text/plain',
      text: params.format === 'json' ? JSON.stringify(response.data, null, 2) : response.data
    });
    
    // Extract metadata for more informative response
    let paramNames = '';
    if (params.parameters) {
      paramNames = params.parameters.split(',').join(', ');
    }
    
    let locationStr = '';
    if (params.latitude !== undefined && params.longitude !== undefined) {
      locationStr = `(${params.latitude}, ${params.longitude})`;
    }
    
    let dateRangeStr = '';
    if (params.start && params.end) {
      dateRangeStr = `from ${params.start} to ${params.end}`;
    }
    
    // Return the result
    return {
      content: [{
        type: "text",
        text: `Retrieved POWER ${params.community.toUpperCase()} data${locationStr ? ` for location ${locationStr}` : ''}${dateRangeStr ? ` ${dateRangeStr}` : ''}${paramNames ? ` with parameters: ${paramNames}` : ''}.`
      }],
      isError: false
    };
  } catch (error: any) {
    console.error('Error in POWER handler:', error);
    
    return {
      isError: true,
      content: [{
        type: "text",
        text: `Error: ${error.message || 'An unexpected error occurred'}`
      }]
    };
  }
}

// Export the handler function directly as default
export default nasaPowerHandler; 