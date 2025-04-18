import { z } from 'zod';
import { nasaApiRequest } from '../../utils/api-client';
import { addResource } from '../../resources';
import axios from 'axios';

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
    const processedResult = await processApodResultWithBase64(result);
    
    return {
      content: [
        {
          type: "text",
          text: processedResult.summary
        },
        ...processedResult.images.map(img => ({
          type: "text",
          text: `![${img.title}](${img.url})`
        })),
        ...processedResult.images.map(img => ({
          type: "image",
          data: img.base64,
          mimeType: img.mimeType || "image/jpeg"
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

// New async version that fetches and encodes images as base64
async function processApodResultWithBase64(result: any) {
  const results = Array.isArray(result) ? result : [result];
  let summary = '';
  const images: any[] = [];
  for (const apod of results) {
    const apodId = `nasa://apod/image?date=${apod.date}`;
    let mimeType = 'image/jpeg';
    if (apod.url) {
      if (apod.url.endsWith('.png')) mimeType = 'image/png';
      else if (apod.url.endsWith('.gif')) mimeType = 'image/gif';
      else if (apod.url.endsWith('.jpg') || apod.url.endsWith('.jpeg')) mimeType = 'image/jpeg';
    }
    addResource(apodId, {
      name: `Astronomy Picture of the Day - ${apod.title}`,
      mimeType: 'application/json',
      text: JSON.stringify(apod, null, 2)
    });
    summary += `## ${apod.title} (${apod.date})\n\n${apod.explanation}\n\n`;
    if (apod.url && (!apod.media_type || apod.media_type === 'image')) {
      summary += `Image URL: ${apod.url}\n\n`;
      let base64 = null;
      try {
        const imageResponse = await axios.get(apod.url, { responseType: 'arraybuffer', timeout: 30000 });
        base64 = Buffer.from(imageResponse.data).toString('base64');
      } catch (err) {
        console.error('Failed to fetch APOD image for base64:', apod.url, err);
      }
      images.push({
        url: apod.url,
        title: apod.title,
        resourceUri: apodId,
        mimeType,
        base64
      });
    }
  }
  return {
    summary,
    images
  };
}

// Export the handler function directly as default
export default nasaApodHandler; 
