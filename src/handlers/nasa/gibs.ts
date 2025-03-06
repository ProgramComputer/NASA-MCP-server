import { z } from 'zod';
import axios from 'axios';

// Schema for validating GIBS request parameters
export const gibsParamsSchema = z.object({
  date: z.string().optional(),
  layer: z.string(),
  resolution: z.number().optional(),
  format: z.enum(['png', 'jpg', 'jpeg']).optional().default('png'),
  bbox: z.string().optional()
});

// Define the request parameter type based on the schema
export type GibsParams = z.infer<typeof gibsParamsSchema>;

/**
 * Handle requests for NASA's Global Imagery Browse Services (GIBS) API
 */
export async function nasaGibsHandler(params: GibsParams) {
  try {
    const { date, layer, resolution, format, bbox } = params;
    
    // Default bbox if not provided
    const bboxParam = bbox || '-180,-90,180,90';
    
    // Construct the GIBS URL
    const baseUrl = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi';
    
    const requestParams = {
      SERVICE: 'WMS',
      VERSION: '1.3.0',
      REQUEST: 'GetMap',
      FORMAT: `image/${format}`,
      LAYERS: layer,
      CRS: 'EPSG:4326',
      BBOX: bboxParam,
      WIDTH: 720,
      HEIGHT: 360,
      TIME: date
    };
    
    // Make the request to GIBS directly
    const response = await axios({
      url: baseUrl,
      params: requestParams,
      responseType: 'arraybuffer'
    });
    
    // Return metadata and image data as base64
    return {
      layer,
      date: date || 'latest',
      format,
      imageData: Buffer.from(response.data).toString('base64'),
      contentType: format
    };
  } catch (error: any) {
    console.error('Error in GIBS handler:', error);
    
    if (error.name === 'ZodError') {
      throw new Error(`Invalid request parameters: ${error.message}`);
    }
    
    throw new Error(`API error: ${error.message}`);
  }
} 