import { z } from 'zod';
import { nasaApiRequest } from '../../utils/api-client';
import { addResource } from '../../resources';

// Schema for validating Earth API request parameters
export const earthParamsSchema = z.object({
  lon: z.number().or(z.string().regex(/^-?\d+(\.\d+)?$/).transform(Number)),
  lat: z.number().or(z.string().regex(/^-?\d+(\.\d+)?$/).transform(Number)),
  date: z.string().optional(),
  dim: z.number().optional(),
  cloud_score: z.boolean().optional(),
  api_key: z.string().optional()
});

// Define the request parameter type based on the schema
export type EarthParams = z.infer<typeof earthParamsSchema>;

/**
 * Handle requests for NASA's Earth API (Landsat imagery)
 */
export async function nasaEarthHandler(params: EarthParams) {
  try {
    // Validate required parameters
    if (params.lon === undefined || params.lat === undefined) {
      return {
        content: [
          {
            type: "text",
            text: "Error: Both longitude (lon) and latitude (lat) parameters are required"
          }
        ],
        isError: true
      };
    }

    // Call the NASA Earth API (Landsat imagery)
    const result = await nasaApiRequest('/planetary/earth/imagery', params);
    
    // Check if we received an error response
    if (result.isError) {
      return result;
    }
    
    // Store results as resources and format response
    const processedResult = processEarthResult(result, params);
    
    return {
      content: [
        {
          type: "text",
          text: processedResult.summary
        },
        // Include image URL
        {
          type: "text",
          text: `![Landsat imagery at coordinates (${params.lon}, ${params.lat})](${processedResult.imageUrl})`
        }
      ],
      isError: false
    };
  } catch (error: any) {
    console.error('Error in Earth API handler:', error);
    
    return {
      content: [
        {
          type: "text",
          text: `Error retrieving Earth imagery data: ${error.message}`
        }
      ],
      isError: true
    };
  }
}

/**
 * Process Earth API result
 * Convert to resource and return formatted data
 */
function processEarthResult(result: any, params: EarthParams) {
  // Create a unique ID for this Earth imagery entry
  const earthId = `nasa://earth/imagery?lon=${params.lon}&lat=${params.lat}${params.date ? `&date=${params.date}` : ''}`;
  
  // Extract image URL
  const imageUrl = result.url || '';
  
  // Store as a resource
  addResource(earthId, {
    name: `Landsat imagery at coordinates (${params.lon}, ${params.lat})`,
    mimeType: 'application/json',
    text: JSON.stringify({
      ...result,
      coordinates: {
        lon: params.lon,
        lat: params.lat
      },
      date: params.date || 'latest',
      image_url: imageUrl
    }, null, 2)
  });
  
  // Create summary text
  const summary = `## Landsat Satellite Imagery\n\n` +
    `**Location**: Longitude ${params.lon}, Latitude ${params.lat}\n` +
    `**Date**: ${result.date || params.date || 'Latest available'}\n` +
    `**Image ID**: ${result.id || 'Not provided'}\n\n` +
    `**Image URL**: ${imageUrl}\n\n`;
  
  return {
    summary,
    imageUrl
  };
}

// Export the handler function directly as default
export default nasaEarthHandler; 
