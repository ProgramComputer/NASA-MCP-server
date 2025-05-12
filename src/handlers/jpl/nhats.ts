import axios from 'axios';
import { addResource } from '../../resources';
import { transformParamsToHyphenated } from '../../utils/param-transformer';

/**
 * Handler for JPL NHATS API (Human-accessible NEOs data)
 * 
 * This API provides data from the NASA/JPL NHATS database about Near-Earth Objects (NEOs)
 * that are potentially accessible by human missions.
 * 
 * @param args Request parameters
 * @returns API response
 */
export async function nhatsHandler(args: Record<string, any>) {
  try {
    // Base URL for the NHATS API
    const baseUrl = 'https://ssd-api.jpl.nasa.gov/nhats.api';
    
    // Validate parameters if needed
    // Parameters are fairly flexible in this API, so minimal validation is needed
    
    // Transform parameter names from underscore to hyphenated format
    const transformedParams = transformParamsToHyphenated(args);
    
    // Make the API request
    const response = await axios.get(baseUrl, { params: transformedParams });
    const data = response.data;
    
    // Create a resource URI that represents this query
    let resourceUri: string;
    
    if (args.des) {
      // Object mode - query for a specific object
      resourceUri = `jpl://nhats/object/${args.des}`;
    } else if (args.spk) {
      // Object mode - query for a specific object by SPK-ID
      resourceUri = `jpl://nhats/object/${args.spk}`;
    } else {
      // Summary mode - query for a list of objects with constraints
      const constraints = Object.entries(args)
        .map(([key, value]) => `${key}=${value}`)
        .join('&');
      
      resourceUri = `jpl://nhats/summary${constraints ? '?' + constraints : ''}`;
    }
    
    // Add response to resources
    addResource(resourceUri, {
      name: args.des || args.spk 
        ? `NHATS data for object: ${args.des || args.spk}`
        : 'NHATS summary data',
      mimeType: "application/json",
      text: JSON.stringify(data, null, 2)
    });
    
    // Format the response
    return {
      content: [{
        type: "text",
        text: JSON.stringify(data, null, 2)
      }]
    };
  } catch (error: any) {
    return {
      content: [{
        type: "text",
        text: `Error accessing JPL NHATS API: ${error.message}`
      }],
      isError: true
    };
  }
}

// Export default for dynamic imports
export default nhatsHandler; 
