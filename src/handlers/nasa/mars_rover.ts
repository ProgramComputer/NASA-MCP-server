import { z } from 'zod';
import axios from 'axios';
import { nasaApiRequest } from '../../utils/api-client';
import { MarsRoverParams } from '../setup';
import { addResource } from '../../resources';

// Schema for validating Mars Rover request parameters
const marsRoverParamsSchema = z.object({
  rover: z.enum(['curiosity', 'opportunity', 'perseverance', 'spirit']),
  sol: z.number().int().nonnegative().optional(),
  earth_date: z.string().optional(),
  camera: z.string().optional(),
  page: z.number().int().positive().optional()
});

/**
 * Handle requests for NASA's Mars Rover Photos API
 */
export async function nasaMarsRoverHandler(params: MarsRoverParams) {
  try {
    const { rover, ...queryParams } = params;
    
    // Call the NASA Mars Rover Photos API
    const result = await nasaApiRequest(`/mars-photos/api/v1/rovers/${rover}/photos`, queryParams);
    
    // Process the results and register resources
    return processRoverResults(result, rover);
  } catch (error: any) {
    console.error('Error in Mars Rover handler:', error);
    
    if (error.name === 'ZodError') {
      return {
        content: [{
          type: "text",
          text: `Invalid request parameters: ${JSON.stringify(error.errors)}`
        }],
        isError: true
      };
    }
    
    return {
      content: [{
        type: "text",
        text: `Error fetching Mars Rover photos: ${error.message || 'Unknown error'}`
      }],
      isError: true
    };
  }
}

/**
 * Process the Mars Rover API results, register resources, and format the response
 */
async function processRoverResults(data: any, rover: string) {
  const photos = data.photos || [];
  const resources = [];
  // Collect base64 image data for direct display
  const images: Array<{ title: string; url: string; data: string; mimeType: string }> = [];
  
  if (photos.length === 0) {
    return {
      content: [{
        type: "text",
        text: `No photos found for rover ${rover} with the specified parameters.`
      }],
      isError: false
    };
  }
  
  // Register each photo as a resource
  for (const photo of photos) {
    const photoId = photo.id.toString();
    const resourceUri = `nasa://mars_rover/photo?rover=${rover}&id=${photoId}`;
    
    try {
      // Fetch the actual image data
      const imageResponse = await axios({
        url: photo.img_src,
        responseType: 'arraybuffer',
        timeout: 30000
      });
      
      // Convert image data to Base64
      const imageBase64 = Buffer.from(imageResponse.data).toString('base64');
      
      // Register the resource with binary data in the blob field
      addResource(resourceUri, {
        name: `Mars Rover Photo ${photoId}`,
        mimeType: "image/jpeg",
        // Store metadata as text for reference
        text: JSON.stringify({
          photo_id: photoId,
          rover: rover,
          camera: photo.camera?.name || 'Unknown',
          earth_date: photo.earth_date,
          sol: photo.sol,
          img_src: photo.img_src
        }),
        // Store the actual image data as a blob
        blob: Buffer.from(imageResponse.data)
      });
      // Keep base64 data for direct response
      images.push({ title: `Mars Rover Photo ${photoId}`, url: photo.img_src, data: imageBase64, mimeType: "image/jpeg" });
    } catch (error) {
      console.error(`Error fetching image for rover photo ${photoId}:`, error);
      
      // If fetching fails, register with just the metadata and URL
      addResource(resourceUri, {
        name: `Mars Rover Photo ${photoId}`,
        mimeType: "image/jpeg",
        text: JSON.stringify({
          photo_id: photoId,
          rover: rover,
          camera: photo.camera?.name || 'Unknown',
          img_src: photo.img_src,
          earth_date: photo.earth_date,
          sol: photo.sol,
          fetch_error: (error as Error).message
        })
      });
    }
    
    resources.push({
      title: `Mars Rover Photo ${photoId}`,
      description: `Photo taken by ${rover} rover on Mars`,
      resource_uri: resourceUri
    });
  }
  
  // Format the response for MCP
  return {
    content: [
      {
        type: "text",
        text: `Found ${photos.length} photos from Mars rover ${rover}.`
      },
      {
        type: "text",
        text: JSON.stringify(resources, null, 2)
      },
      // Include direct image links and binary data
      ...images.map(img => ({ type: "text", text: `![${img.title}](${img.url})` })),
      ...images.map(img => ({ type: "image", data: img.data, mimeType: img.mimeType })),
    ],
    isError: false
  };
}

// Export with all possible names that handleToolCall might be looking for
// Primary export should match file name convention
export const mars_roverHandler = nasaMarsRoverHandler;
export const marsRoverHandler = nasaMarsRoverHandler;

// Keep these secondary exports for compatibility
export const nasaMars_RoverHandler = nasaMarsRoverHandler;

// Default export
export default nasaMarsRoverHandler; 
