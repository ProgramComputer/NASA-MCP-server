import axios from 'axios';
import FormData from 'form-data'; // Need form-data for multipart POST
import { addResource } from '../../resources';

/**
 * Handler for JPL Horizons File API (POST request)
 * 
 * This API provides ephemeris data for solar system objects using a file-based input.
 * It accepts the same parameters as the GET version but formats them for file submission.
 * 
 * @param args Request parameters (e.g., COMMAND, START_TIME, STOP_TIME, etc.)
 * @returns API response
 */
export async function horizonsFileHandler(args: Record<string, any>) {
  try {
    // Base URL for the Horizons File API (POST)
    const baseUrl = 'https://ssd.jpl.nasa.gov/api/horizons_file.api';
    
    // Format arguments into the key='value' text format for the input file
    // DO NOT include format here, it's a separate form field.
    const formattedArgs = { ...args };
    delete formattedArgs.format; // Remove format if present

    let fileContent = '!$$SOF\n'; // Add !SOF marker
    for (const [key, value] of Object.entries(formattedArgs)) {
      let formattedValue: string | number;
      const upperKey = key.toUpperCase();

      // Leave numbers unquoted
      if (typeof value === 'number') {
        formattedValue = value;
      } 
      // Quote ALL other values (strings, including YES/NO)
      else {
        formattedValue = `'${String(value).replace(/'/g, "\'")}'`;
      }
      
      fileContent += `${upperKey}=${formattedValue}\n`;
    }
    fileContent += '!$$EOF\n'; // Correct !EOF marker

    // Create FormData payload
    const form = new FormData();
    // Add format as a separate field
    form.append('format', args.format || 'json'); 
    // Add the file content under the 'input' field name
    form.append('input', fileContent, {
      filename: 'horizons_input.txt', // Required filename, content doesn't matter
      contentType: 'text/plain',
    });

    // Make the API request using POST with multipart/form-data
    const response = await axios.post(baseUrl, form, {
      headers: {
        ...form.getHeaders(), // Important for correct boundary
      },
    });
    const data = response.data; // Assume response is JSON based on 'format=json'

    // Create a resource URI that represents this query (similar to GET handler)
    let resourceUri = 'jpl://horizons-file'; // Distinguish from GET
    let resourceName = 'JPL Horizons file-based ephemeris data';

    if (args.COMMAND) {
      resourceUri += `/object/${encodeURIComponent(args.COMMAND)}`;
      resourceName = `${args.COMMAND} ephemeris data (file input)`;
      if (args.START_TIME && args.STOP_TIME) {
        resourceName += ` (${args.START_TIME} to ${args.STOP_TIME})`;
      }
    }
    
    // Add response to resources
    addResource(resourceUri, {
      name: resourceName,
      mimeType: "application/json", // Assuming JSON response
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
    let errorMessage = `Error accessing JPL Horizons File API: ${error.message}`;
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
export default horizonsFileHandler; 
