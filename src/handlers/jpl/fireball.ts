import { z } from 'zod';
import axios from 'axios';

// Schema for validating JPL Fireball request parameters
export const fireballParamsSchema = z.object({
  date_min: z.string().optional(),
  date_max: z.string().optional(),
  energy_min: z.number().optional(),
  energy_max: z.number().optional(),
  impact_e_min: z.number().optional(),
  impact_e_max: z.number().optional(),
  vel_min: z.number().optional(),
  vel_max: z.number().optional(),
  alt_min: z.number().optional(),
  alt_max: z.number().optional(),
  req_loc: z.boolean().optional().default(false),
  req_alt: z.boolean().optional().default(false),
  req_vel: z.boolean().optional().default(false),
  req_vel_comp: z.boolean().optional().default(false),
  req_impact_e: z.boolean().optional().default(false),
  req_energy: z.boolean().optional().default(false),
  limit: z.number().optional().default(50)
});

// Define the request parameter type based on the schema
export type FireballParams = z.infer<typeof fireballParamsSchema>;

/**
 * Handle requests for JPL's Fireball Database
 */
export async function jplFireballHandler(params: FireballParams) {
  try {
    // Construct the Fireball API URL
    const url = 'https://ssd-api.jpl.nasa.gov/fireball.api';
    
    // Make the request to the Fireball API
    const response = await axios.get(url, { params });
    
    return response.data;
  } catch (error: any) {
    console.error('Error in JPL Fireball handler:', error);
    
    if (error.name === 'ZodError') {
      throw new Error(`Invalid request parameters: ${error.message}`);
    }
    
    throw new Error(`API error: ${error.message}`);
  }
} 