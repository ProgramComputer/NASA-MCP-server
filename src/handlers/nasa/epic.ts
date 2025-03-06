import { z } from 'zod';
import axios from 'axios';
import { nasaApiRequest } from '../../utils/api-client';

// Define the EPIC API base URL
const EPIC_API_BASE_URL = 'https://epic.gsfc.nasa.gov/api';

// Schema for validating EPIC request parameters
export const epicParamsSchema = z.object({
  collection: z.enum(['natural', 'enhanced']).optional().default('natural'),
  date: z.string().optional(),
});

// Define the request parameter type based on the schema
export type EpicParams = z.infer<typeof epicParamsSchema>;

/**
 * Handle requests for NASA's Earth Polychromatic Imaging Camera (EPIC) API
 */
export async function nasaEpicHandler(params: EpicParams) {
  try {
    // Parse the request parameters
    const { collection, date } = params;
    
    // If date is provided, verify if it's available first
    if (date) {
      try {
        // First try to get the list of available dates
        const availableDatesResponse = await axios.get(`${EPIC_API_BASE_URL}/${collection}/available`, {
          timeout: 5000 // 5 second timeout for checking dates
        });
        
        const availableDates = availableDatesResponse.data;
        
        // Check if the requested date is available
        if (Array.isArray(availableDates) && !availableDates.includes(date)) {
          console.log(`Date ${date} not available for EPIC ${collection} imagery, using most recent data instead`);
          // Requested date not available, fall back to most recent
          const response = await axios.get(`${EPIC_API_BASE_URL}/${collection}`, {
            timeout: 10000 // 10 second timeout
          });
          return response.data;
        }
      } catch (error) {
        console.warn('Error checking EPIC available dates, proceeding with requested date anyway:', error);
        // Continue with the requested date anyway
      }
    }
    
    // Determine the endpoint based on parameters
    let endpoint = `/${collection}`;
    if (date) {
      endpoint += `/date/${date}`;
    }
    
    // Direct call to EPIC API with the correct URL structure
    const response = await axios.get(`${EPIC_API_BASE_URL}${endpoint}`, {
      // Removed timeout to prevent timeouts with specific dates
    });
    
    // If we got an empty array, try to get the most recent data instead
    if (Array.isArray(response.data) && response.data.length === 0) {
      console.log('No data available for the specified parameters, using most recent data instead');
      const fallbackResponse = await axios.get(`${EPIC_API_BASE_URL}/${collection}`, {
        timeout: 10000
      });
      return fallbackResponse.data;
    }
    
    // Return the result
    return response.data;
  } catch (error: any) {
    console.error('Error in EPIC handler:', error);
    
    if (error.name === 'ZodError') {
      throw new Error(`Invalid request parameters: ${error.message}`);
    }
    
    // Use recent data as fallback if we encounter a timeout
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      try {
        console.log('Timeout occurred, trying fallback to most recent data');
        const { collection } = params;
        const fallbackResponse = await axios.get(`${EPIC_API_BASE_URL}/${collection}`, {
          timeout: 10000
        });
        return fallbackResponse.data;
      } catch (fallbackError) {
        console.error('Even fallback request failed:', fallbackError);
        throw new Error(`API error (with fallback): ${error.message}`);
      }
    }
    
    throw new Error(`API error: ${error.message}`);
  }
} 