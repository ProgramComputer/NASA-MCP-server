import { z } from 'zod';
import axios from 'axios';
import { addResource } from '../../index';

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
    return processImageResults(response.data);
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

/**
 * Process the NASA Images API results, register resources, and format the response
 */
function processImageResults(data: any) {
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
  
  // Register each image as a resource
  items.forEach((item: any) => {
    // Extract NASA ID from data
    const metadata = item.data && item.data[0];
    if (!metadata || !metadata.nasa_id) return;
    
    const nasaId = metadata.nasa_id;
    const title = metadata.title || 'Untitled NASA Image';
    const resourceUri = `nasa://images/item?nasa_id=${nasaId}`;
    
    // Find the actual image links
    const links = item.links || [];
    const imageLink = links.find((link: any) => link.rel === 'preview');
    
    addResource(resourceUri, {
      name: title,
      mimeType: "application/json",
      text: JSON.stringify({
        item_details: metadata,
        preview_url: imageLink?.href || null,
        title: title,
        description: metadata.description || 'No description available',
        date_created: metadata.date_created || 'Unknown date',
        nasa_id: nasaId
      })
    });
  });
  
  // Format the response for MCP
  return {
    content: [
      {
        type: "text",
        text: `Found ${items.length} NASA images/media items.`
      },
      {
        type: "text",
        text: JSON.stringify(items.map((item: any) => {
          const metadata = item.data && item.data[0] || {};
          const links = item.links || [];
          const imageLink = links.find((link: any) => link.rel === 'preview');
          
          return {
            title: metadata.title || 'Untitled',
            nasa_id: metadata.nasa_id,
            date_created: metadata.date_created,
            media_type: metadata.media_type,
            description: (metadata.description || '').substring(0, 100) + (metadata.description && metadata.description.length > 100 ? '...' : ''),
            preview_url: imageLink?.href || null,
            resource_uri: metadata.nasa_id ? `nasa://images/item?nasa_id=${metadata.nasa_id}` : null
          };
        }), null, 2)
      }
    ],
    isError: false
  };
}

// Export the handler function directly as default
export default nasaImagesHandler; 