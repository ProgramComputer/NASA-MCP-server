import { z } from 'zod';
import { nasaApiRequest } from '../../utils/api-client';
import { MarsRoverParams } from '../setup';

// Schema for validating Mars Rover request parameters
const marsRoverParamsSchema = z.object({
  rover: z.enum(['curiosity', 'opportunity', 'perseverance', 'spirit']),
  sol: z.number().int().nonnegative().optional(),
  earth_date: z.string().optional(),
  camera: z.string().optional(),
  page: z.number().int().positive().optional()
});

/**
 * Handle requests for NASA's Mars Rover Photos API
 */
export async function nasaMarsRoverHandler(params: MarsRoverParams) {
  try {
    const { rover, ...queryParams } = params;
    
    // Call the NASA Mars Rover Photos API
    const result = await nasaApiRequest(`/mars-photos/api/v1/rovers/${rover}/photos`, queryParams);
    
    // Return the result
    return { result };
  } catch (error: any) {
    console.error('Error in Mars Rover handler:', error);
    
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