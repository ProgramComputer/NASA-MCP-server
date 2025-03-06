import { z } from 'zod';
import axios from 'axios';

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
    const response = await axios.get(url, { params: queryParams });
    
    return response.data;
  } catch (error: any) {
    console.error('Error in NASA Images handler:', error);
    
    if (error.name === 'ZodError') {
      throw new Error(`Invalid request parameters: ${error.message}`);
    }
    
    throw new Error(`API error: ${error.message}`);
  }
} 