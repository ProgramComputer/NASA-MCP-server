import { z } from 'zod';
import { jplApiRequest } from '../../utils/api-client';
import { ScoutParams } from '../setup';

/**
 * Handle requests for JPL's Scout API
 * Scout is a hazard assessment system that automatically calculates the potential 
 * for an object to be an impactor based on the available observations.
 */
export async function jplScoutHandler(params: ScoutParams) {
  try {
    // By default, get the most recent data if no specific parameters are provided
    const endpoint = '/scout.api';
    
    // Call the JPL Scout API
    const result = await jplApiRequest(endpoint, params);
    
    // Return the result
    return { result };
  } catch (error: any) {
    console.error('Error in Scout handler:', error);
    
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