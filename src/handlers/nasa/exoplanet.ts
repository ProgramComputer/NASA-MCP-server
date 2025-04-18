import { z } from 'zod';
import axios from 'axios';
import { addResource } from '../../resources';

// Base URL for NASA's Exoplanet Archive
const EXOPLANET_API_URL = 'https://exoplanetarchive.ipac.caltech.edu/cgi-bin/nstedAPI/nph-nstedAPI';

// Schema for validating Exoplanet Archive request parameters
export const exoplanetParamsSchema = z.object({
  table: z.string(),
  select: z.string().optional(),
  where: z.string().optional(),
  order: z.string().optional(),
  format: z.enum(['json', 'csv', 'ipac', 'xml']).optional().default('json'),
  limit: z.number().int().min(1).max(1000).optional()
});

// Define the request parameter type based on the schema
export type ExoplanetParams = z.infer<typeof exoplanetParamsSchema>;

/**
 * Handle requests for NASA's Exoplanet Archive
 */
export async function nasaExoplanetHandler(params: ExoplanetParams) {
  try {
    const { table, select, where, order, format, limit } = params;
    
    // Construct the API parameters directly - nstedAPI has different params than TAP/sync
    const apiParams: Record<string, any> = {
      table: table,
      format: format
    };
    
    // Add optional parameters if provided
    if (select) {
      apiParams.select = select;
    }
    
    if (where) {
      apiParams.where = where;
    }
    
    if (order) {
      apiParams.order = order;
    }
    
    if (limit) {
      apiParams.top = limit; // Use 'top' instead of 'limit' for this API
    }
    
    // Make the request to the Exoplanet Archive
    const response = await axios.get(EXOPLANET_API_URL, {
      params: apiParams
    });
    
    // Create a resource ID based on the query parameters
    const resourceId = `nasa://exoplanet/data?table=${table}${where ? `&where=${encodeURIComponent(where)}` : ''}${limit ? `&limit=${limit}` : ''}`;
    
    // Register the response as a resource
    addResource(resourceId, {
      name: `Exoplanet data from ${table}${where ? ` with filter` : ''}`,
      mimeType: format === 'json' ? 'application/json' : 'text/plain',
      text: format === 'json' ? JSON.stringify(response.data, null, 2) : response.data
    });
    
    // Format response based on the data type
    if (Array.isArray(response.data) && response.data.length > 0) {
      // If we got an array of results
      const count = response.data.length;
      return {
        content: [
          {
            type: "text",
            text: `Found ${count} exoplanet records from the ${table} table.`
          },
          {
            type: "text",
            text: JSON.stringify(response.data.slice(0, 10), null, 2) + 
                 (count > 10 ? `\n... and ${count - 10} more records` : '')
          }
        ],
        isError: false
      };
    } else {
      // If we got a different format or empty results
      return { 
        content: [
          {
            type: "text",
            text: `Exoplanet query complete. Results from ${table} table.`
          },
          {
            type: "text",
            text: typeof response.data === 'string' ? response.data : JSON.stringify(response.data, null, 2)
          }
        ],
        isError: false
      };
    }
  } catch (error: any) {
    console.error('Error in Exoplanet handler:', error);
    
    return {
      isError: true,
      content: [{
        type: "text",
        text: `Error accessing NASA Exoplanet Archive: ${error.message || 'Unknown error'}`
      }]
    };
  }
}

// Export the handler function directly as default
export default nasaExoplanetHandler; 
