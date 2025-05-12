import axios, { AxiosRequestConfig } from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { transformParamsToHyphenated } from './param-transformer';

// Try to load environment variables from .env file with absolute path
dotenv.config();
// Also try with explicit path as fallback
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// NASA API Base URLs
export const NASA_API_BASE_URL = 'https://api.nasa.gov';
export const JPL_SSD_API_BASE_URL = 'https://ssd-api.jpl.nasa.gov';

/**
 * Make a request to a NASA API endpoint
 */
export async function nasaApiRequest(
  endpoint: string,
  params: Record<string, any> = {},
  options: AxiosRequestConfig = {}
) {
  try {
    // First check for API key in environment variables
    let apiKey = process.env.NASA_API_KEY;
    
    // If not found, try loading from .env file with explicit path
    if (!apiKey) {
      try {
        const envPath = path.resolve(process.cwd(), '.env');
        dotenv.config({ path: envPath });
        apiKey = process.env.NASA_API_KEY;
      } catch (error) {
        console.error('Error loading .env file:', error);
      }
    }
    
    if (!apiKey) {
      return {
        isError: true,
        content: [{
          type: "text",
          text: 'NASA API key not found. Please set NASA_API_KEY in .env file'
        }]
      };
    }

    const response = await axios({
      url: `${NASA_API_BASE_URL}${endpoint}`,
      params: {
        ...params,
        api_key: apiKey
      },
      timeout: 30000, // 30 second timeout
      ...options
    });

    return response.data;
  } catch (error: any) {
    console.error(`Error calling NASA API (${endpoint}):`, error.message);
    
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error('Response status:', error.response.status);
      console.error('Response headers:', JSON.stringify(error.response.headers));
      console.error('Response data:', JSON.stringify(error.response.data).substring(0, 200));
      
      return {
        isError: true,
        content: [{
          type: "text",
          text: `NASA API error (${error.response.status}): ${error.response.data.error?.message || 'Unknown error'}`
        }]
      };
    } else if (error.request) {
      // The request was made but no response was received
      console.error('Request details:');
      console.error('- URL:', error.request._currentUrl || 'Not available');
      console.error('- Method:', error.request.method || 'Not available');
      console.error('- Headers:', error.request._header || 'Not available');
      console.error('- Timeout:', error.request.timeout || 'Not available');
      
      return {
        isError: true,
        content: [{
          type: "text",
          text: `NASA API network error: No response received or request timed out. URL: ${error.request._currentUrl || 'Unknown'}`
        }]
      };
    } else {
      // Something happened in setting up the request that triggered an Error
      return {
        isError: true,
        content: [{
          type: "text",
          text: `NASA API request error: ${error.message}`
        }]
      };
    }
  }
}

/**
 * Make a request to a JPL SSD API endpoint
 */
export async function jplApiRequest(
  endpoint: string,
  params: Record<string, any> = {},
  options: AxiosRequestConfig = {}
) {
  try {
    // JPL endpoints might use the NASA API key, but check exceptions like Scout
    let apiKey = process.env.NASA_API_KEY;
    
    // Transform parameter names from underscore to hyphenated format
    // as the JPL APIs expect hyphenated parameter names
    let paramsToSend = transformParamsToHyphenated(params);

    // Only add api_key if required and available, and not for scout.api
    if (endpoint !== '/scout.api' && apiKey) {
      paramsToSend.api_key = apiKey;
    } else if (endpoint !== '/scout.api' && !apiKey) {
      // If other JPL endpoints require a key but it's missing, try loading .env
      try {
        const envPath = path.resolve(process.cwd(), '.env');
        dotenv.config({ path: envPath });
        apiKey = process.env.NASA_API_KEY;
        if (apiKey) {
          paramsToSend.api_key = apiKey;
        } else {
          // Return error if key is needed but not found AFTER trying .env
          return {
            isError: true,
            content: [{
              type: "text",
              text: 'NASA API key not found for JPL endpoint. Please set NASA_API_KEY in .env file'
            }]
          };
        }
      } catch (error) {
        console.error('Error loading .env file for JPL key:', error);
        // Proceed without key for now, endpoint might not strictly require it
      }
    } // else: if endpoint is /scout.api, we intentionally DO NOT add the api_key
    
    const response = await axios({
      url: `${JPL_SSD_API_BASE_URL}${endpoint}`,
      params: paramsToSend, // Use the potentially modified params object
      timeout: 30000, // 30 second timeout
      ...options
    });

    return response.data;
  } catch (error: any) {
    console.error(`Error calling JPL API (${endpoint}):`, error.message);
    
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data).substring(0, 200));
      
      return {
        isError: true,
        content: [{
          type: "text",
          text: `JPL API error (${error.response.status}): ${error.response.data.message || 'Unknown error'}`
        }]
      };
    } else if (error.request) {
      console.error('Request details:');
      console.error('- URL:', error.request._currentUrl || 'Not available');
      console.error('- Method:', error.request.method || 'Not available');
      console.error('- Headers:', error.request._header || 'Not available');
      console.error('- Timeout:', error.request.timeout || 'Not available');
      
      return {
        isError: true,
        content: [{
          type: "text",
          text: `JPL API network error: No response received. URL: ${error.request._currentUrl || 'Unknown'}`
        }]
      };
    } else {
      return {
        isError: true,
        content: [{
          type: "text",
          text: `JPL API request error: ${error.message}`
        }]
      };
    }
  }
} 