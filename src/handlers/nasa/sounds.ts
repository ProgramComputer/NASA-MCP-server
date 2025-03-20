import { z } from 'zod';
import { nasaApiRequest } from '../../utils/api-client';
import { addResource } from '../../index';

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
    
    // Register each sound as a separate resource
    if (result && result.count > 0 && Array.isArray(result.results)) {
      result.results.forEach((sound: any, index: number) => {
        // Create a unique resource ID for each sound
        const soundId = sound.id || `sound-${index}`;
        const resourceId = `nasa://sounds/item?id=${soundId}`;
        
        // Register the sound as a resource
        addResource(resourceId, {
          name: sound.title || `NASA Sound ${soundId}`,
          mimeType: 'application/json',
          text: JSON.stringify(sound, null, 2)
        });
      });
    }
    
    // Also register the full collection
    const queryParams = [];
    if (params.q) queryParams.push(`q=${encodeURIComponent(params.q)}`);
    if (params.limit) queryParams.push(`limit=${params.limit}`);
    if (params.page) queryParams.push(`page=${params.page}`);
    
    const collectionResourceId = `nasa://sounds/collection${queryParams.length > 0 ? '?' + queryParams.join('&') : ''}`;
    
    addResource(collectionResourceId, {
      name: `NASA Sounds Collection${params.q ? ` for "${params.q}"` : ''}`,
      mimeType: 'application/json',
      text: JSON.stringify(result, null, 2)
    });
    
    // Return the result
    return { 
      content: [{
        type: "text",
        text: `Retrieved ${result.count || 0} NASA sounds${params.q ? ` matching "${params.q}"` : ''}.`
      }],
      isError: false
    };
  } catch (error: any) {
    console.error('Error in Sounds handler:', error);
    
    if (error.name === 'ZodError') {
      return {
        isError: true,
        content: [{
          type: "text",
          text: `Invalid request parameters: ${error.message}`
        }]
      };
    }
    
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
export default nasaSoundsHandler; 