import { z } from 'zod';
import axios from 'axios';
import { addResource } from '../../resources';

// Schema for validating POWER request parameters
export const powerParamsSchema = z.object({
  parameters: z.string(),
  community: z.enum(['re', 'sb', 'ag', 'RE', 'SB', 'AG']).transform(val => val.toLowerCase()),
  format: z.enum(['json', 'csv', 'ascii', 'netcdf']).optional().default('json'),
  // Location parameters
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  // Regional parameters (alternative to lat/long)
  bbox: z.string().optional(),
  // Temporal parameters
  start: z.string().optional(),
  end: z.string().optional(),
  // Climatology parameters
  climatology_start: z.string().optional(),
  climatology_end: z.string().optional(),
  time_standard: z.enum(['utc', 'lst']).optional().default('utc')
});

export type PowerParams = z.infer<typeof powerParamsSchema>;

/**
 * Format POWER API data into a human-readable text
 */
function formatPowerDataText(responseData: any, params: PowerParams): string {
  try {
    const properties = responseData.properties || {};
    const parameterData = properties.parameter || {};
    const geometry = responseData.geometry || {};
    const header = responseData.header || {};
    
    const requestedParams = params.parameters.split(',');
    
    let locationStr = 'Global';
    if (geometry.type === 'Point' && geometry.coordinates) {
      locationStr = `Point (${geometry.coordinates[1]}, ${geometry.coordinates[0]})`;
    } else if (params.bbox) {
      locationStr = `Region (${params.bbox})`;
    }
    
    let dateRangeStr = '';
    if (header.start && header.end) {
      dateRangeStr = `${header.start} to ${header.end}`;
    } else if (params.start && params.end) {
      dateRangeStr = `${params.start} to ${params.end}`;
    }
    
    let text = `# NASA POWER Data\n\n`;
    text += `**Community:** ${params.community.toUpperCase()}\n`;
    text += `**Location:** ${locationStr}\n`;
    text += `**Date Range:** ${dateRangeStr || 'N/A'}\n\n`;
    
    text += `## Parameters\n\n`;
    
    requestedParams.forEach(paramKey => {
      const data = parameterData[paramKey];
      const unit = header.parameter_information?.[paramKey]?.units || 'N/A';
      const longName = header.parameter_information?.[paramKey]?.long_name || paramKey;
      
      text += `### ${longName} (${paramKey})\n`;
      text += `- **Units:** ${unit}\n`;
      
      if (data && typeof data === 'object') {
        const dates = Object.keys(data).sort();
        if (dates.length > 0) {
          text += `- **Data:**\n`;
          text += '| Date       | Value |\n';
          text += '|------------|-------|\n';
          // Show first 10 and last 10 dates to avoid excessive length
          const maxEntries = 10;
          const totalEntries = dates.length;
          let entriesShown = 0;
          
          for (let i = 0; i < Math.min(maxEntries, totalEntries); i++) {
            const date = dates[i];
            const value = data[date] !== undefined ? data[date] : 'N/A';
            text += `| ${date}   | ${value} |
`;
            entriesShown++;
          }
          
          if (totalEntries > maxEntries * 2) {
            text += `| ...        | ...   |\n`; // Indicate truncation
          }
          
          if (totalEntries > maxEntries) {
             const startIndex = Math.max(maxEntries, totalEntries - maxEntries);
             for (let i = startIndex; i < totalEntries; i++) {
                const date = dates[i];
                const value = data[date] !== undefined ? data[date] : 'N/A';
                text += `| ${date}   | ${value} |
`;
                entriesShown++;
             }
          }
          text += `\n*(Showing ${entriesShown} of ${totalEntries} daily values)*\n\n`;
        } else {
          text += `- Data: No data available for this period.\n\n`;
        }
      } else {
        text += `- Data: Not available or invalid format.\n\n`;
      }
    });
    
    return text;
  } catch (formatError: any) {
    console.error('Error formatting POWER data:', formatError);
    return `Error: Failed to format POWER data. Raw data might be available in resources. Error: ${formatError.message}`;
  }
}

/**
 * Handle requests for NASA's POWER (Prediction Of Worldwide Energy Resources) API
 * Provides solar and meteorological data sets
 */
export async function nasaPowerHandler(params: PowerParams) {
  try {
    // POWER API base URL
    const POWER_API_URL = 'https://power.larc.nasa.gov/api/temporal/daily/point';
    
    // Validate and normalize parameters using the schema
    const validatedParams = powerParamsSchema.parse(params);
    
    // Call the NASA POWER API
    const response = await axios({
      url: POWER_API_URL,
      params: validatedParams, // Use validated & normalized params
      method: 'GET',
      timeout: 30000 // Increased timeout to 30 seconds
    });
    
    // Create a resource ID based on key parameters
    const resourceParams = [];
    if (validatedParams.parameters) resourceParams.push(`parameters=${validatedParams.parameters}`);
    if (validatedParams.latitude !== undefined) resourceParams.push(`lat=${validatedParams.latitude}`);
    if (validatedParams.longitude !== undefined) resourceParams.push(`lon=${validatedParams.longitude}`);
    if (validatedParams.start) resourceParams.push(`start=${validatedParams.start}`);
    if (validatedParams.end) resourceParams.push(`end=${validatedParams.end}`);
    
    const resourceId = `nasa://power/${validatedParams.community}?${resourceParams.join('&')}`;
    
    // Register the response as a resource
    addResource(resourceId, {
      name: `NASA POWER ${validatedParams.community.toUpperCase()} Data${validatedParams.latitude !== undefined ? ` at (${validatedParams.latitude}, ${validatedParams.longitude})` : ''}`,
      mimeType: validatedParams.format === 'json' ? 'application/json' : 'text/plain',
      text: validatedParams.format === 'json' ? JSON.stringify(response.data, null, 2) : response.data
    });
    
    // Format the data for display
    const formattedText = formatPowerDataText(response.data, validatedParams);
    
    // Return the formatted result
    return {
      content: [
        {
          type: "text",
          text: formattedText
        }
      ],
      isError: false
    };
  } catch (error: any) {
    // Handle Zod validation errors separately
    if (error instanceof z.ZodError) {
        console.error('Error validating POWER parameters:', error.errors);
        return {
            isError: true,
            content: [{
                type: "text",
                text: `Error: Invalid parameters for NASA POWER API. Issues: ${error.errors.map(e => `${e.path.join('.')} - ${e.message}`).join('; ')}`
            }]
        };
    }
    
    console.error('Error in POWER handler:', error);
    
    let errorMessage = 'An unexpected error occurred';
    
    if (error.response) {
      // The request was made and the server responded with an error status
      console.error('Response status:', error.response.status);
      console.error('Response headers:', JSON.stringify(error.response.headers));
      console.error('Response data:', JSON.stringify(error.response.data).substring(0, 200));
      
      // Check content type before assuming JSON for error response
      const contentType = error.response.headers?.['content-type'] || '';
      let errorDetails = 'Unknown error';
      if (contentType.includes('application/json') && error.response.data) {
           errorDetails = error.response.data?.message || error.response.data?.errors?.join(', ') || 
                          JSON.stringify(error.response.data).substring(0, 100);
      } else if (typeof error.response.data === 'string') {
           errorDetails = error.response.data.substring(0, 150); // Show raw text if not JSON
      }
      
      errorMessage = `NASA POWER API error (${error.response.status}): ${errorDetails}`;
    } else if (error.request) {
      // The request was made but no response was received
      console.error('Request details:');
      console.error('- URL:', error.config?.url || 'Not available'); // Use config for URL
      console.error('- Params:', error.config?.params || 'Not available');
      console.error('- Method:', error.request.method || 'Not available');
      console.error('- Headers:', error.request._header || 'Not available');
      
      errorMessage = `NASA POWER API network error: No response received or request timed out. Check network connectivity and API status. URL: ${error.config?.url}`; 
    } else {
      // Something happened in setting up the request
      errorMessage = `NASA POWER API request setup error: ${error.message}`;
    }
    
    return {
      isError: true,
      content: [{
        type: "text",
        text: `Error: ${errorMessage}`
      }]
    };
  }
}

// Export the handler function directly as default
export default nasaPowerHandler; 
