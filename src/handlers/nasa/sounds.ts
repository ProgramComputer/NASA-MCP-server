import { z } from 'zod';
import { nasaApiRequest } from '../../utils/api-client';

// Schema for validating Sounds request parameters
export const soundsParamsSchema = z.object({
  q: z.string().optional(),
  limit: z.number().int().positive().optional(),
  page: z.number().int().positive().optional()
});

export type SoundsParams = z.infer<typeof soundsParamsSchema>;

/**
 * Handle requests for NASA's Sounds API (beta)
 * Provides access to space sounds via SoundCloud with abstracted API
 */
export async function nasaSoundsHandler(params: SoundsParams) {
  try {
    const endpoint = '/planetary/sounds';
    
    // Call the NASA Sounds API
    const result = await nasaApiRequest(endpoint, params);
    
    // Return the result
    return { result };
  } catch (error: any) {
    console.error('Error in Sounds handler:', error);
    
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