import { z } from 'zod';
import axios from 'axios';
import { transformParamsToHyphenated } from '../../utils/param-transformer';

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
 * Make a request to NASA JPL's Fireball API
 */
export async function jplFireballHandler(params: FireballParams) {
  try {
    // Construct the Fireball API URL
    const url = 'https://ssd-api.jpl.nasa.gov/fireball.api';
    
    // Transform parameter names from underscore to hyphenated format
    const transformedParams = transformParamsToHyphenated(params);
    
    // Make the request to the Fireball API
    const response = await axios.get(url, { params: transformedParams });
    
    return {
      content: [
        {
          type: "text",
          text: `Retrieved ${response.data.count || 0} fireball events.`
        },
        {
          type: "text",
          text: JSON.stringify(response.data, null, 2)
        }
      ],
      isError: false
    };
  } catch (error: any) {
    console.error('Error in JPL Fireball handler:', error);
    
    return {
      isError: true,
      content: [{
        type: "text",
        text: `Error: ${error.message || 'An unexpected error occurred'}`
      }]
    };
  }
} 
