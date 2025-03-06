import { z } from 'zod';
import { nasaApiRequest } from '../../utils/api-client';
import { addResource } from '../../index.js';

// Schema for validating APOD request parameters
export const apodParamsSchema = z.object({
  date: z.string().optional(),
  hd: z.boolean().optional(),
  count: z.number().int().positive().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  thumbs: z.boolean().optional()
});

// Define the request parameter type based on the schema
export type ApodParams = z.infer<typeof apodParamsSchema>;

/**
 * Handle requests for NASA's Astronomy Picture of the Day (APOD) API
 */
export async function nasaApodHandler(params: ApodParams) {
  try {
    // Call the NASA APOD API
    const result = await nasaApiRequest('/planetary/apod', params);
    
    // Store results as resources
    const processedResult = processApodResult(result);
    
    return {
      content: [
        {
          type: "text",
          text: processedResult.summary
        },
        // Instead of trying to include images directly, include them as text with URLs
        ...processedResult.images.map(img => ({
          type: "text",
          text: `![${img.title}](${img.data})`
        }))
      ],
      isError: false
    };
  } catch (error: any) {
    console.error('Error in APOD handler:', error);
    
    return {
      content: [
        {
          type: "text",
          text: `Error retrieving APOD data: ${error.message}`
        }
      ],
      isError: true
    };
  }
}

/**
 * Process APOD API result
 * Convert to resource and return formatted data
 */
function processApodResult(result: any) {
  // Handle both single result and array of results
  const results = Array.isArray(result) ? result : [result];
  
  let summary = '';
  const images: any[] = [];
  
  results.forEach((apod) => {
    // Create a unique ID for this APOD entry
    const apodId = `nasa://apod/image?date=${apod.date}`;
    
    // Store as a resource
    addResource(apodId, {
      name: `Astronomy Picture of the Day - ${apod.title}`,
      mimeType: 'application/json',
      text: JSON.stringify(apod, null, 2)
    });
    
    // Add to summary text
    summary += `## ${apod.title} (${apod.date})\n\n${apod.explanation}\n\n`;
    
    // Add image info if available
    if (apod.url) {
      summary += `Image URL: ${apod.url}\n\n`;
      images.push({
        data: apod.url,
        title: apod.title
      });
    }
  });
  
  return {
    summary,
    images
  };
}

// Export the handler function directly as default
export default nasaApodHandler; 