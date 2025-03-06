import { z } from 'zod';
import axios from 'axios';

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
    // POWER API has a different endpoint structure than other NASA APIs
    const POWER_API_URL = 'https://power.larc.nasa.gov/api/temporal/';
    
    // Determine the endpoint based on the community parameter
    const { community, ...queryParams } = params;
    
    // Call the NASA POWER API
    const response = await axios({
      url: `${POWER_API_URL}${community}`,
      params: queryParams,
      method: 'GET'
    });
    
    // Return the result
    return { result: response.data };
  } catch (error: any) {
    console.error('Error in POWER handler:', error);
    
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