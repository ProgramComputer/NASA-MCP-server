import { z } from 'zod';
import axios from 'axios';
import { addResource } from '../../resources';

const FIRMS_API_BASE_URL = 'https://firms.modaps.eosdis.nasa.gov/api/area/csv';

// Schema for validating FIRMS request parameters
export const firmsParamsSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  radius: z.number().optional().default(1.0),
  days: z.number().int().min(1).max(10).optional().default(1),
  source: z.enum(['VIIRS_SNPP_NRT', 'MODIS_NRT', 'VIIRS_NOAA20_NRT']).optional().default('VIIRS_SNPP_NRT')
});

// Define the request parameter type based on the schema
export type FirmsParams = z.infer<typeof firmsParamsSchema>;

/**
 * Handle requests for NASA's FIRMS (Fire Information for Resource Management System) API
 */
export async function nasaFirmsHandler(params: FirmsParams) {
  try {
    const { latitude, longitude, radius, days, source } = params;
    
    // Validate required parameters
    if (!process.env.NASA_API_KEY) {
      return {
        isError: true,
        content: [{
          type: "text",
          text: "Error: NASA API key is required for FIRMS requests"
        }]
      };
    }
    
    // Get the NASA API key from environment variables
    const apiKey = process.env.NASA_API_KEY;
    
    // Construct request URL
    const url = FIRMS_API_BASE_URL;
    
    // Send request to FIRMS API
    const response = await axios.get(url, {
      params: {
        lat: latitude,
        lon: longitude,
        radius: radius,
        days: days,
        source: source,
        api_key: apiKey
      }
    });
    
    // Parse the CSV response into a structured format
    const csvData = response.data;
    const rows = csvData.split('\n');
    
    if (rows.length < 2) {
      return { results: [] };
    }
    
    const headers = rows[0].split(',');
    const results = rows.slice(1)
      .filter((row: string) => row.trim() !== '')
      .map((row: string) => {
        const values = row.split(',');
        const entry: Record<string, string | number> = {};
        
        headers.forEach((header: string, index: number) => {
          const value = values[index] ? values[index].trim() : '';
          // Try to convert numeric values
          const numValue = Number(value);
          entry[header] = !isNaN(numValue) && value !== '' ? numValue : value;
        });
        
        return entry;
      });
    
    // Register the response as a resource
    const resourceId = `nasa://firms/data?lat=${latitude}&lon=${longitude}&days=${days}&source=${source}`;
    const resourceData = {
      metadata: {
        latitude,
        longitude,
        radius,
        days,
        source
      },
      results
    };
    
    addResource(resourceId, {
      name: `Fire Data near (${latitude}, ${longitude}) for the past ${days} day(s)`,
      mimeType: 'application/json',
      text: JSON.stringify(resourceData, null, 2)
    });
    
    // Return data in MCP format
    return {
      content: [
        {
          type: "text",
          text: `Found ${results.length} fire hotspots near (${latitude}, ${longitude}) in the past ${days} day(s)`
        },
        {
          type: "text",
          text: JSON.stringify(results, null, 2)
        }
      ],
      isError: false
    };
  } catch (error: any) {
    console.error('Error in FIRMS handler:', error);
    
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
export default nasaFirmsHandler; 
