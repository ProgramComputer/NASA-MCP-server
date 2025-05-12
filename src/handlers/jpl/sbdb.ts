import { z } from 'zod';
import axios from 'axios';
import { transformParamsToHyphenated } from '../../utils/param-transformer';

// Schema for validating JPL Small-Body Database request parameters
export const sbdbParamsSchema = z.object({
  sstr: z.string().min(1),
  full_precision: z.boolean().optional().default(false),
  solution_epoch: z.string().optional(),
  orbit_class: z.boolean().optional().default(false),
  body_type: z.enum(['ast', 'com', 'all']).optional().default('all'),
  phys_par: z.boolean().optional().default(false),
  close_approach: z.boolean().optional().default(false),
  ca_time: z.enum(['all', 'now', 'fut', 'past']).optional().default('all'),
  ca_dist: z.enum(['au', 'ld', 'lu']).optional().default('au'),
  ca_tbl: z.enum(['elem', 'approach']).optional().default('approach'),
  format: z.enum(['json', 'xml']).optional().default('json')
});

// Define the request parameter type based on the schema
export type SbdbParams = z.infer<typeof sbdbParamsSchema>;

/**
 * Handle requests for JPL's Small-Body Database
 */
export async function jplSbdbHandler(params: SbdbParams) {
  try {
    const { 
      sstr, 
      full_precision, 
      solution_epoch, 
      orbit_class, 
      body_type, 
      phys_par, 
      close_approach, 
      ca_time, 
      ca_dist, 
      ca_tbl, 
      format 
    } = params;
    
    // Construct the SBDB query URL
    const url = 'https://ssd-api.jpl.nasa.gov/sbdb.api';
    
    // Prepare the query parameters
    const queryParams: Record<string, any> = {
      sstr
    };
    
    // Add optional parameters
    if (full_precision) queryParams.full_precision = full_precision ? 'yes' : 'no';
    if (solution_epoch) queryParams.solution_epoch = solution_epoch;
    if (orbit_class) queryParams.orbit_class = orbit_class ? 'yes' : 'no';
    if (body_type !== 'all') queryParams.body_type = body_type;
    if (phys_par) queryParams.phys_par = phys_par ? 'yes' : 'no';
    if (close_approach) queryParams.close_approach = close_approach ? 'yes' : 'no';
    if (ca_time !== 'all') queryParams.ca_time = ca_time;
    if (ca_dist !== 'au') queryParams.ca_dist = ca_dist;
    if (ca_tbl !== 'approach') queryParams.ca_tbl = ca_tbl;
    if (format !== 'json') queryParams.format = format;
    
    // Transform parameter names from underscore to hyphenated format
    const transformedParams = transformParamsToHyphenated(queryParams);
    
    // Make the request to SBDB API
    const response = await axios.get(url, { params: transformedParams });
    
    // Return the response
    return {
      content: [
        {
          type: "text",
          text: `Retrieved data for small body "${params.sstr}".`
        },
        {
          type: "text",
          text: JSON.stringify(response.data, null, 2)
        }
      ],
      isError: false
    };
  } catch (error: any) {
    console.error('Error in JPL SBDB handler:', error);
    
    return {
      isError: true,
      content: [{
        type: "text",
        text: `Error: ${error.message || 'An unexpected error occurred'}`
      }]
    };
  }
} 
