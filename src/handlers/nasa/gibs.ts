import { z } from 'zod';
import axios from 'axios';
import { addResource } from '../../resources';

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
    
    // Convert format to proper MIME type format for WMS
    const mimeFormat = format === 'jpg' ? 'jpeg' : format;
    
    const requestParams = {
      SERVICE: 'WMS',
      VERSION: '1.3.0',
      REQUEST: 'GetMap',
      FORMAT: `image/${mimeFormat}`,
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
      responseType: 'arraybuffer',
      timeout: 30000
    });
    
    // Convert response to base64
    const imageBase64 = Buffer.from(response.data).toString('base64');
    
    // Register the image as a resource
    const formattedDate = date || new Date().toISOString().split('T')[0];
    const resourceUri = `nasa://gibs/imagery?layer=${layer}&date=${formattedDate}`;
    
    addResource(resourceUri, {
      name: `NASA GIBS: ${layer} (${formattedDate})`,
      mimeType: `image/${format}`,
      // Store metadata as text (optional)
      text: JSON.stringify({
        layer: layer,
        date: formattedDate,
        bbox: bboxParam,
        width: 720,
        height: 360
      }),
      // Store the actual image data as a blob
      blob: Buffer.from(response.data)
    });
    
    // Return metadata and image data
    return {
      content: [
        {
          type: "text",
          text: `NASA GIBS satellite imagery for ${layer} on ${date || 'latest'}`
        },
        {
          type: "image",
          mimeType: `image/${format}`,
          data: imageBase64
        },
        {
          type: "text",
          text: `Resource registered at: ${resourceUri}`
        }
      ],
      isError: false
    };
  } catch (error: any) {
    console.error('Error in GIBS handler:', error);
    
    if (error.name === 'ZodError') {
      return {
        content: [
          {
            type: "text",
            text: `Invalid request parameters: ${error.message}`
          }
        ],
        isError: true
      };
    }
    
    return {
      content: [
        {
          type: "text",
          text: `Error retrieving GIBS data: ${error.message}`
        }
      ],
      isError: true
    };
  }
}

// Add a default export for the handler
export default nasaGibsHandler; 
