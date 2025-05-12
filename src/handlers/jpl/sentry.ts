import axios from 'axios';
import { addResource } from '../../resources';
import { transformParamsToHyphenated } from '../../utils/param-transformer';

/**
 * Handler for JPL Sentry API
 * 
 * This API provides NEO Earth impact risk assessment data for potentially hazardous asteroids.
 * 
 * @param args Request parameters
 * @returns API response
 */
export async function sentryHandler(args: Record<string, any>) {
  try {
    // Base URL for the Sentry API
    const baseUrl = 'https://ssd-api.jpl.nasa.gov/sentry.api';
    
    // Transform parameter names from underscore to hyphenated format
    const transformedParams = transformParamsToHyphenated(args);
    
    // Make the API request
    const response = await axios.get(baseUrl, { params: transformedParams });
    const data = response.data;
    
    // Create a resource URI that represents this query
    let resourceUri: string;
    let resourceName: string;
    
    if (args.des) {
      // Object mode - query for a specific object
      resourceUri = `jpl://sentry/object/${args.des}`;
      resourceName = `Impact risk assessment for object ${args.des}`;
      
      // Check if object is in the Sentry database or was removed
      if (data.error && data.error === "specified object removed") {
        resourceName += ` (removed on ${data.removed})`;
      } else if (data.error && data.error === "specified object not found") {
        resourceName += ` (not found)`;
      } else if (data.summary) {
        resourceName = `Impact risk assessment for ${data.summary.fullname}`;
      }
    } else if (args.spk) {
      // Object mode - query for a specific object by SPK-ID
      resourceUri = `jpl://sentry/object/${args.spk}`;
      resourceName = `Impact risk assessment for object SPK ${args.spk}`;
      
      // Update name if we have more info
      if (data.summary) {
        resourceName = `Impact risk assessment for ${data.summary.fullname}`;
      }
    } else if (args.removed === true || args.removed === '1' || args.removed === 'Y' || args.removed === 'true') {
      // Removed objects mode
      resourceUri = `jpl://sentry/removed`;
      resourceName = `Objects removed from Sentry impact monitoring`;
    } else if (args.all === true || args.all === '1' || args.all === 'Y' || args.all === 'true') {
      // Virtual impactors mode
      resourceUri = `jpl://sentry/vi`;
      
      // Add any constraints to the URI
      const constraints = Object.entries(args)
        .filter(([key]) => key !== 'all')
        .map(([key, value]) => `${key}=${value}`)
        .join('&');
      
      if (constraints) {
        resourceUri += `?${constraints}`;
      }
      
      resourceName = `Sentry virtual impactors data`;
    } else {
      // Summary mode
      resourceUri = `jpl://sentry/summary`;
      
      // Add any constraints to the URI
      const constraints = Object.entries(args)
        .map(([key, value]) => `${key}=${value}`)
        .join('&');
      
      if (constraints) {
        resourceUri += `?${constraints}`;
      }
      
      resourceName = `Sentry impact risk summary data`;
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
        text: `Error accessing JPL Sentry API: ${error.message}`
      }],
      isError: true
    };
  }
}

// Export default for dynamic imports
export default sentryHandler; 
