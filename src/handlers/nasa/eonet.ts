import { z } from 'zod';
import axios from 'axios';
import { nasaApiRequest } from '../../utils/api-client';
import { EonetParams } from '../setup';
import { addResource } from '../../resources';

// Define the EONET API base URL
const EONET_API_BASE_URL = 'https://eonet.gsfc.nasa.gov/api';

/**
 * Handle requests for NASA's Earth Observatory Natural Event Tracker (EONET) API
 */
export async function nasaEonetHandler(params: EonetParams) {
  try {
    const { category, days, source, status, limit } = params;
    
    // Build the endpoint path
    let endpointPath = '/v3/events';
    const apiParams: Record<string, any> = {};
    
    // Add query parameters - using more default values to ensure we get results
    if (days) apiParams.days = days;
    if (source) apiParams.source = source;
    if (status) apiParams.status = status;
    if (limit) apiParams.limit = limit;
    
    // If no status is provided, default to "all" to ensure we get some events
    if (!status) apiParams.status = "all";
    
    // If no days parameter, default to 60 days to ensure we get more events 
    if (!days) apiParams.days = 60;
    
    // If a category is specified, use the category-specific endpoint
    if (category) {
      endpointPath = `/v3/categories/${category}`;
    }
    
    // Use direct axios call with the EONET-specific base URL
    const response = await axios.get(`${EONET_API_BASE_URL}${endpointPath}`, {
      params: apiParams,
      timeout: 10000 // 10 second timeout
    });
    
    // If we don't have any events, try again with broader parameters
    if (!response.data.events || response.data.events.length === 0) {
      // Reset to the main events endpoint for maximum results
      endpointPath = '/v3/events';
      
      // Use broader parameters
      const broadParams = {
        status: 'all',       // Get both open and closed events
        days: 90,            // Look back further
        limit: limit || 50   // Increase the limit
      };
      
      const broadResponse = await axios.get(`${EONET_API_BASE_URL}${endpointPath}`, {
        params: broadParams,
        timeout: 10000
      });
      
      // Register the response as a resource
      const resourceId = `nasa://eonet/events?days=${broadParams.days}&status=${broadParams.status}`;
      addResource(resourceId, {
        name: `EONET Events (${broadParams.days} days, ${broadParams.status} status)`,
        mimeType: 'application/json',
        text: JSON.stringify(broadResponse.data, null, 2)
      });
      
      return { 
        content: [{
          type: "text",
          text: `Used broader search criteria due to no events found with original parameters. Found ${broadResponse.data.events?.length || 0} events.`
        }],
        isError: false
      };
    }
    
    // Register the response as a resource
    const resourceParams = [];
    if (days) resourceParams.push(`days=${days}`);
    if (category) resourceParams.push(`category=${category}`);
    if (status) resourceParams.push(`status=${status}`);
    
    const resourceId = `nasa://eonet/events${category ? '/categories/' + category : ''}?${resourceParams.join('&')}`;
    addResource(resourceId, {
      name: `EONET Events${category ? ' (' + category + ')' : ''}`,
      mimeType: 'application/json',
      text: JSON.stringify(response.data, null, 2)
    });
    
    // Return the original result
    return { 
      content: [{
        type: "text",
        text: `Found ${response.data.events?.length || 0} EONET events.`
      }],
      isError: false
    };
  } catch (error: any) {
    console.error('Error in EONET handler:', error);
    
    return {
      isError: true,
      content: [{
        type: "text",
        text: `Error: ${error.message || 'An unexpected error occurred'}`
      }]
    };
  }
}

// Export the handler function directly as default
export default nasaEonetHandler; 
