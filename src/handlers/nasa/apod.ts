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
        ...processedResult.images.map(img => ({
          type: "image",
          data: img.data,
          mimeType: "image/jpeg"
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
 * Process APOD API results, storing images as resources and preparing a summary
 */
function processApodResult(result: any) {
  // Handle both single image and collection of images
  const items = Array.isArray(result) ? result : [result];
  let summary = '';
  const images: { id: string; data: string }[] = [];
  
  items.forEach((item, index) => {
    // Add to summary text
    summary += `\n\n${index > 0 ? '---\n\n' : ''}`;
    summary += `# ${item.title} (${item.date})\n\n`;
    summary += `${item.explanation}\n\n`;
    
    if (item.copyright) {
      summary += `Copyright: ${item.copyright}\n\n`;
    }
    
    // Store image URL for display
    if (item.url) {
      summary += `[View Image](${item.url})\n`;
      
      // For actual images (not videos), we could fetch and convert to base64
      // But for simplicity, we'll just reference the URL
      if (!item.media_type || item.media_type === 'image') {
        const imageId = `apod-${item.date}`;
        // Note: In a real implementation, you'd fetch the image
        // and convert to base64 for direct embedding
        
        // Placeholder for image processing
        // images.push({
        //   id: imageId,
        //   data: fetchedImageData
        // });
        
        // For now, just store the URL as a resource
        addResource(`nasa://apod/${imageId}`, {
          name: `APOD: ${item.title} (${item.date})`,
          mimeType: 'text/plain',
          text: item.url
        });
      }
    }
  });
  
  return {
    summary,
    images
  };
}

// Default export for dynamic import in the tool handler
export default nasaApodHandler; 