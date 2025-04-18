import { z } from 'zod';
import axios from 'axios';
import { addResource } from '../../resources';

// Schema for validating NASA Images API request parameters
export const imagesParamsSchema = z.object({
  q: z.string().min(1),
  media_type: z.enum(['image', 'audio', 'video']).optional(),
  year_start: z.string().optional(),
  year_end: z.string().optional(),
  page: z.number().int().positive().optional().default(1),
  page_size: z.number().int().min(1).max(100).optional().default(10)
});

// Define the request parameter type based on the schema
export type ImagesParams = z.infer<typeof imagesParamsSchema>;

/**
 * Handle requests to NASA's Image and Video Library API
 */
export async function nasaImagesHandler(params: ImagesParams) {
  try {
    const { q, media_type, year_start, year_end, page, page_size } = params;

    // Construct request to NASA Image API
    const url = 'https://images-api.nasa.gov/search';
    
    // Prepare query parameters
    const queryParams: Record<string, any> = {
      q,
      page,
      page_size
    };
    
    if (media_type) queryParams.media_type = media_type;
    if (year_start) queryParams.year_start = year_start;
    if (year_end) queryParams.year_end = year_end;
    
    // Make the request to NASA Images API
    const response = await axios.get(url, { params: queryParams, timeout: 30000 });
    
    // Process the results and register resources
    return await processImageResultsWithBase64(response.data);
  } catch (error: any) {
    console.error('Error in NASA Images handler:', error);
    
    if (error.name === 'ZodError') {
      return {
        content: [{
          type: "text",
          text: `Invalid request parameters: ${error.message}`
        }],
        isError: true
      };
    }
    
    return {
      content: [{
        type: "text",
        text: `Error fetching NASA images: ${error.message || 'Unknown error'}`
      }],
      isError: true
    };
  }
}

// New async version that fetches and encodes images as base64
async function processImageResultsWithBase64(data: any) {
  const items = data?.collection?.items || [];
  
  if (items.length === 0) {
    return {
      content: [{
        type: "text",
        text: "No images found matching the search criteria."
      }],
      isError: false
    };
  }
  
  const images: any[] = [];
  for (const item of items) {
    const metadata = item.data && item.data[0];
    if (!metadata || !metadata.nasa_id || metadata.media_type !== 'image') continue;
    const nasaId = metadata.nasa_id;
    const title = metadata.title || 'Untitled NASA Image';
    const resourceUri = `nasa://images/item?nasa_id=${nasaId}`;
    // Find the full-res image link (look for rel: 'orig' or the largest image)
    let fullResUrl = null;
    if (item.links && Array.isArray(item.links)) {
      // Try to find rel: 'orig' or the largest image
      const orig = item.links.find((link: any) => link.rel === 'orig');
      if (orig && orig.href) fullResUrl = orig.href;
      else {
        // Fallback: use the first image link
        const firstImg = item.links.find((link: any) => link.render === 'image');
        if (firstImg && firstImg.href) fullResUrl = firstImg.href;
      }
    }
    let mimeType = 'image/jpeg';
    if (fullResUrl) {
      if (fullResUrl.endsWith('.png')) mimeType = 'image/png';
      else if (fullResUrl.endsWith('.gif')) mimeType = 'image/gif';
      else if (fullResUrl.endsWith('.jpg') || fullResUrl.endsWith('.jpeg')) mimeType = 'image/jpeg';
    }
    // Fetch the image and encode as base64
    let base64 = null;
    if (fullResUrl) {
      try {
        const imageResponse = await axios.get(fullResUrl, { responseType: 'arraybuffer', timeout: 30000 });
        base64 = Buffer.from(imageResponse.data).toString('base64');
      } catch (err) {
        console.error('Failed to fetch NASA Images image for base64:', fullResUrl, err);
      }
    }
    addResource(resourceUri, {
      name: title,
      mimeType: "application/json",
      text: JSON.stringify({
        item_details: metadata,
        full_res_url: fullResUrl,
        title: title,
        description: metadata.description || 'No description available',
        date_created: metadata.date_created || 'Unknown date',
        nasa_id: nasaId
      })
    });
    images.push({
      title,
      base64,
      mimeType,
      url: fullResUrl
    });
  }
  return {
    content: [
      {
        type: "text",
        text: `Found ${images.length} NASA images/media items.`
      },
      ...images.map(img => ({
        type: "text",
        text: `![${img.title}](${img.url})`
      })),
      ...images.map(img => ({
        type: "image",
        data: img.base64,
        mimeType: img.mimeType
      }))
    ],
    isError: false
  };
}

// Export the handler function directly as default
export default nasaImagesHandler; 
