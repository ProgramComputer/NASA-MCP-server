import axios from 'axios';
import { addResource } from '../../resources';

// Define expected parameters 
interface OsdrFilesParams {
  accession_number: string; 
}

/**
 * Handler for NASA OSDR Data Files API
 * 
 * Retrieves metadata about data files for a specific OSD study dataset,
 * including download links.
 * 
 * @param args Request parameters conforming to OsdrFilesParams
 * @returns API response
 */
export async function osdrFilesHandler(args: OsdrFilesParams) {
  try {
    // Validate required parameters
    if (!args.accession_number) {
      throw new Error('Missing required parameter: accession_number must be provided.');
    }
    
    // Base URL for the OSDR API
    const baseUrl = 'https://osdr.nasa.gov/osdr/data/osd/files';
    const apiUrl = `${baseUrl}/${encodeURIComponent(args.accession_number)}`;
    
    // Make the API request using GET
    const response = await axios.get(apiUrl, {
      // OSDR API might require specific headers, e.g., Accept
      headers: {
        'Accept': 'application/json' 
      }
    });
    const data = response.data;
    
    // Create a resource URI 
    const resourceUri = `nasa://osdr/files/${encodeURIComponent(args.accession_number)}`;
    const resourceName = `OSDR Files for ${args.accession_number}`;

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
    let errorMessage = `Error accessing NASA OSDR Files API: ${error.message}`;
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
export default osdrFilesHandler; 
