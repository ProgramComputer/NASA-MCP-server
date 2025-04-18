import axios from 'axios';
import { addResource } from '../../resources';

/**
 * Handler for JPL Horizons API
 * 
 * This API provides ephemeris data for solar system objects (planets, moons, asteroids, comets, etc.).
 * 
 * @param args Request parameters
 * @returns API response
 */
export async function horizonsHandler(args: Record<string, any>) {
  try {
    // Base URL for the Horizons API
    const baseUrl = 'https://ssd.jpl.nasa.gov/api/horizons.api';
    
    // Make the API request
    const response = await axios.get(baseUrl, { params: args });
    const data = response.data;
    
    // Create a resource URI that represents this query
    let resourceUri = 'jpl://horizons';
    let resourceName = 'JPL Horizons ephemeris data';
    
    // Customize resource name based on the request type
    if (args.COMMAND) {
      // Add the object identifier to the resource URI
      resourceUri += `/object/${encodeURIComponent(args.COMMAND)}`;
      
      // Update resource name based on EPHEM_TYPE
      if (args.EPHEM_TYPE === 'OBSERVER') {
        resourceName = `${args.COMMAND} observer ephemeris data`;
      } else if (args.EPHEM_TYPE === 'VECTORS') {
        resourceName = `${args.COMMAND} vector ephemeris data`;
      } else if (args.EPHEM_TYPE === 'ELEMENTS') {
        resourceName = `${args.COMMAND} orbital elements data`;
      } else {
        resourceName = `${args.COMMAND} ephemeris data`;
      }
      
      // Add time range info if available
      if (args.START_TIME && args.STOP_TIME) {
        resourceName += ` (${args.START_TIME} to ${args.STOP_TIME})`;
      }
    }
    
    // Add query parameters to the URI
    const queryParams = Object.entries(args)
      .filter(([key]) => key !== 'COMMAND' && key !== 'format')
      .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
      .join('&');
    
    if (queryParams) {
      resourceUri += `?${queryParams}`;
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
        text: `Error accessing JPL Horizons API: ${error.message}`
      }],
      isError: true
    };
  }
}

// Export default for dynamic imports
export default horizonsHandler; 
