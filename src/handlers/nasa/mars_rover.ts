import { z } from 'zod';
import { nasaApiRequest } from '../../utils/api-client';
import { MarsRoverParams } from '../setup';
import { addResource } from '../../index';

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
function processRoverResults(data: any, rover: string) {
  const photos = data.photos || [];
  const resources = [];
  
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
    
    // Register the resource
    addResource(resourceUri, {
      name: `Mars Rover Photo ${photoId}`,
      mimeType: "image/jpeg",
      text: JSON.stringify({
        photo_id: photoId,
        rover: rover,
        camera: photo.camera?.name || 'Unknown',
        img_src: photo.img_src,
        earth_date: photo.earth_date,
        sol: photo.sol
      })
    });
    
    resources.push({
      title: `Mars Rover Photo ${photoId}`,
      description: `Photo taken by ${rover} rover on Mars`,
      resource_uri: `nasa://mars_rover/photo?rover=${rover}&id=${photo.id}`
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
      }
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