import axios from 'axios';
import { addResource } from '../../resources';
import { transformParamsToHyphenated } from '../../utils/param-transformer';

/**
 * Handler for JPL SB Close Approach (CAD) API
 * 
 * This API provides data about asteroid and comet close approaches to planets
 * in the past and future.
 * 
 * @param args Request parameters
 * @returns API response
 */
export async function cadHandler(args: Record<string, any>) {
  try {
    // Base URL for the CAD API
    const baseUrl = 'https://ssd-api.jpl.nasa.gov/cad.api';
    
    // Validate parameters if needed
    // Parameters are fairly flexible in this API, so minimal validation is needed
    
    // Transform parameter names from underscore to hyphenated format
    const transformedParams = transformParamsToHyphenated(args);
    
    // Make the API request
    const response = await axios.get(baseUrl, { params: transformedParams });
    const data = response.data;
    
    // Create a resource URI that represents this query
    let resourceUri: string;
    let resourceName: string;
    
    if (args.des) {
      // Query for a specific object
      resourceUri = `jpl://cad/object/${args.des}`;
      resourceName = `Close approaches for object ${args.des}`;
    } else if (args.spk) {
      // Query for a specific object by SPK-ID
      resourceUri = `jpl://cad/object/${args.spk}`;
      resourceName = `Close approaches for object ${args.spk}`;
    } else {
      // Query for close approaches with constraints
      const constraints = Object.entries(args)
        .map(([key, value]) => `${key}=${value}`)
        .join('&');
      
      resourceUri = `jpl://cad/list${constraints ? '?' + constraints : ''}`;
      
      // Create a readable name based on date range and body
      const dateMin = args['date_min'] || 'now';
      const dateMax = args['date_max'] || '+60';
      const body = args.body || 'Earth';
      
      resourceName = `Close approaches to ${body} from ${dateMin} to ${dateMax}`;
    }
    
    // Add response to resources
    addResource(resourceUri, {
      name: resourceName,
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
        text: `Error accessing JPL SB Close Approach API: ${error.message}`
      }],
      isError: true
    };
  }
}

// Export default for dynamic imports
export default cadHandler; 
