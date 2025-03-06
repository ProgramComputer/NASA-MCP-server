import { z } from 'zod';
import axios from 'axios';
import { nasaApiRequest } from '../../utils/api-client';
import { EonetParams } from '../setup';

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
      console.log('No EONET events found with current parameters, trying with broader criteria');
      
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
      
      return { 
        result: broadResponse.data,
        note: 'Used broader search criteria due to no events found with original parameters'
      };
    }
    
    // Return the original result
    return { result: response.data };
  } catch (error: any) {
    console.error('Error in EONET handler:', error);
    
    if (error.name === 'ZodError') {
      throw {
        error: {
          type: 'invalid_request',
          message: 'Invalid request parameters',
          details: error.errors
        }
      };
    }
    
    throw {
      error: {
        type: 'server_error',
        message: error.message || 'An unexpected error occurred',
        details: error.response?.data || null
      }
    };
  }
} 