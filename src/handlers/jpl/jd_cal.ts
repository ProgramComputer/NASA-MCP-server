import axios from 'axios';
import { addResource } from '../../resources';
import { transformParamsToHyphenated } from '../../utils/param-transformer';

/**
 * Handler for JPL Julian Date Calendar Conversion API
 * 
 * This API converts between Julian dates and calendar dates (UTC)
 * 
 * @param args Request parameters
 * @returns API response
 */
export async function jdCalHandler(args: Record<string, any>) {
  try {
    // Base URL for the JD Calendar API
    const baseUrl = 'https://ssd-api.jpl.nasa.gov/jd_cal.api';
    
    // Validate parameters
    if (!args.jd && !args.cd) {
      return {
        content: [{
          type: "text",
          text: "Error: Either a Julian date (jd) or calendar date (cd) must be provided."
        }],
        isError: true
      };
    }
    
    // Transform parameter names from underscore to hyphenated format
    const transformedParams = transformParamsToHyphenated(args);
    
    // Make the API request
    const response = await axios.get(baseUrl, { params: transformedParams });
    const data = response.data;
    
    // Add response to resources
    const resourceUri = `jpl://jd_cal/${args.jd || args.cd}`;
    addResource(resourceUri, {
      name: `Julian Date / Calendar Date Conversion: ${args.jd || args.cd}`,
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
        text: `Error accessing JPL Julian Date Calendar API: ${error.message}`
      }],
      isError: true
    };
  }
}

// Export default for dynamic imports
export default jdCalHandler; 
