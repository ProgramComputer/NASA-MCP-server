import { z } from 'zod';
import axios from 'axios';
import { nasaApiRequest } from '../../utils/api-client';
import { addResource } from '../../index';

// Define the EPIC API base URL
const EPIC_API_BASE_URL = 'https://epic.gsfc.nasa.gov/api';
const EPIC_IMAGE_BASE_URL = 'https://epic.gsfc.nasa.gov/archive';

// Schema for validating EPIC request parameters
export const epicParamsSchema = z.object({
  collection: z.enum(['natural', 'enhanced']).optional().default('natural'),
  date: z.string().optional(),
});

// Define the request parameter type based on the schema
export type EpicParams = z.infer<typeof epicParamsSchema>;

/**
 * Process EPIC API results and format them for MCP
 * @param epicData The raw EPIC data from the API
 * @param collection The collection type (natural or enhanced)
 * @returns Formatted results with summary and image data
 */
async function processEpicResults(epicData: any[], collection: string) {
  if (!Array.isArray(epicData) || epicData.length === 0) {
    return {
      summary: "No EPIC data available for the specified parameters.",
      images: []
    };
  }

  // Extract date information from the first image
  const firstImage = epicData[0];
  const date = firstImage.date || 'unknown date';
  
  // Get image date parts for URL construction
  const dateStr = firstImage.date.split(' ')[0];
  const [year, month, day] = dateStr.split('-');
  
  // Format each image and register it as a resource
  const images = [];
  
  for (const img of epicData) {
    // Construct the image URL according to NASA's format
    const imageUrl = `${EPIC_IMAGE_BASE_URL}/${collection}/${year}/${month}/${day}/png/${img.image}.png`;
    
    // Create a unique resource URI for this image
    const resourceUri = `nasa://epic/image/${collection}/${img.identifier}`;
    
    try {
      // Fetch the actual image data
      const imageResponse = await axios({
        url: imageUrl,
        responseType: 'arraybuffer',
        timeout: 30000
      });
      
      // Register this image as a resource with binary data
      addResource(resourceUri, {
        name: `NASA EPIC Earth Image - ${img.identifier}`,
        mimeType: "image/png",
        // Store metadata as text
        text: JSON.stringify({
          id: img.identifier,
          date: img.date,
          caption: img.caption || "Earth view from DSCOVR satellite",
          imageUrl: imageUrl,
          centroid_coordinates: img.centroid_coordinates,
          dscovr_j2000_position: img.dscovr_j2000_position,
          lunar_j2000_position: img.lunar_j2000_position,
          sun_j2000_position: img.sun_j2000_position,
          attitude_quaternions: img.attitude_quaternions
        }),
        // Store actual image data as blob
        blob: Buffer.from(imageResponse.data)
      });
      
      images.push({
        identifier: img.identifier,
        caption: img.caption || "Earth view from DSCOVR satellite",
        imageUrl: imageUrl,
        resourceUri: resourceUri
      });
    } catch (error) {
      console.error(`Error fetching EPIC image ${img.identifier}:`, error);
      
      // If fetch fails, register with just the metadata
      addResource(resourceUri, {
        name: `NASA EPIC Earth Image - ${img.identifier}`,
        mimeType: "image/png",
        text: JSON.stringify({
          id: img.identifier,
          date: img.date,
          caption: img.caption || "Earth view from DSCOVR satellite",
          imageUrl: imageUrl,
          centroid_coordinates: img.centroid_coordinates,
          dscovr_j2000_position: img.dscovr_j2000_position,
          lunar_j2000_position: img.lunar_j2000_position,
          sun_j2000_position: img.sun_j2000_position,
          attitude_quaternions: img.attitude_quaternions,
          fetch_error: (error as Error).message
        })
      });
      
      images.push({
        identifier: img.identifier,
        caption: img.caption || "Earth view from DSCOVR satellite",
        imageUrl: imageUrl,
        resourceUri: resourceUri,
        error: "Failed to fetch image data"
      });
    }
  }
  
  return {
    summary: `EPIC Earth imagery from ${date} - Collection: ${collection} - ${images.length} images available`,
    images: images
  };
}

/**
 * Handle requests for NASA's Earth Polychromatic Imaging Camera (EPIC) API
 */
export async function nasaEpicHandler(params: EpicParams) {
  try {
    // Parse the request parameters
    const { collection, date } = params;
    
    // Determine the endpoint based on parameters
    let endpoint = `/${collection}`;
    if (date) {
      endpoint += `/date/${date}`;
    }
    
    // Try to fetch EPIC data with timeout of 30 seconds
    const response = await axios.get(`${EPIC_API_BASE_URL}${endpoint}`, { 
      timeout: 30000 
    });
    
    const epicData = response.data;
    
    // Process the results
    if (epicData && epicData.length > 0) {
      const results = await processEpicResults(epicData, collection);
      
      return {
        content: [
          {
            type: "text",
            text: results.summary
          },
          ...results.images.map(img => ({
            type: "text",
            text: `![${img.caption}](${img.resourceUri})`
          }))
        ],
        isError: false
      };
    }
    
    // No data found for date
    return {
      content: [{
        type: "text",
        text: `No EPIC data found for date ${date || 'latest'} in collection ${collection}`
      }],
      isError: false
    };
  } catch (error: any) {
    console.error('Error in EPIC handler:', error);
    
    if (error.name === 'ZodError') {
      return {
        content: [{
          type: "text",
          text: `Invalid request parameters: ${error.message}`
        }],
        isError: true
      };
    }
    
    // Return a properly formatted error
    return {
      content: [{
        type: "text",
        text: `Error fetching EPIC data: ${error.message}`
      }],
      isError: true
    };
  }
}

// Export the handler function directly as default
export default nasaEpicHandler; 