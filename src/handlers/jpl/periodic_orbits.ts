import axios from 'axios';
import { addResource } from '../../resources';
import { transformParamsToHyphenated } from '../../utils/param-transformer';

// Define expected parameters based on documentation
// Required: sys, family
// Optional: libr, branch, periodmin, periodmax, periodunits, jacobimin, jacobimax, stabmin, stabmax
interface PeriodicOrbitParams {
  sys: string;
  family: string;
  libr?: number;
  branch?: string;
  periodmin?: number;
  periodmax?: number;
  periodunits?: string;
  jacobimin?: number;
  jacobimax?: number;
  stabmin?: number;
  stabmax?: number;
}

/**
 * Handler for JPL Three-Body Periodic Orbits API
 * 
 * Fetches data on periodic orbits in specified three-body systems.
 * 
 * @param args Request parameters conforming to PeriodicOrbitParams
 * @returns API response
 */
export async function periodicOrbitsHandler(args: PeriodicOrbitParams) {
  try {
    // Validate required parameters
    if (!args.sys || !args.family) {
      throw new Error('Missing required parameters: sys and family must be provided.');
    }
    
    // Base URL for the Periodic Orbits API
    const baseUrl = 'https://ssd-api.jpl.nasa.gov/periodic_orbits.api';
    
    // Transform parameter names from underscore to hyphenated format
    const transformedParams = transformParamsToHyphenated(args);
    
    // Make the API request using GET with parameters
    const response = await axios.get(baseUrl, { params: transformedParams });
    const data = response.data;
    
    // Create a resource URI 
    // Example: jpl://periodic-orbits?sys=earth-moon&family=halo&libr=1&branch=N
    let resourceUri = `jpl://periodic-orbits?sys=${encodeURIComponent(args.sys)}&family=${encodeURIComponent(args.family)}`;
    let resourceName = `Periodic Orbits: ${args.sys} / ${args.family}`;
    if (args.libr) {
      resourceUri += `&libr=${args.libr}`;
      resourceName += ` / L${args.libr}`;
    }
    if (args.branch) {
      resourceUri += `&branch=${encodeURIComponent(args.branch)}`;
      resourceName += ` / Branch ${args.branch}`;
    }
    // Potentially add filter params to URI/Name if needed for uniqueness

    // Add response to resources
    addResource(resourceUri, {
      name: resourceName,
      mimeType: "application/json", 
      text: JSON.stringify(data, null, 2)
    });
    
    // Format the response for MCP
    return {
      content: [{
        type: "text",
        text: JSON.stringify(data, null, 2)
      }]
    };
  } catch (error: any) {
    let errorMessage = `Error accessing JPL Periodic Orbits API: ${error.message}`;
    if (error.response) {
      // Include more detail from the API response if available
      errorMessage += `\nStatus: ${error.response.status}\nData: ${JSON.stringify(error.response.data)}`;
    }
    return {
      content: [{
        type: "text",
        text: errorMessage
      }],
      isError: true
    };
  }
}

// Export default for dynamic imports in index.ts
export default periodicOrbitsHandler; 
