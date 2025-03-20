import axios, { AxiosRequestConfig } from 'axios';
import dotenv from 'dotenv';
import path from 'path';

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
      timeout: 10000, // 10 second timeout
      ...options
    });

    return response.data;
  } catch (error: any) {
    console.error(`Error calling NASA API (${endpoint}):`, error.message);
    
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      return {
        isError: true,
        content: [{
          type: "text",
          text: `NASA API error (${error.response.status}): ${error.response.data.error?.message || 'Unknown error'}`
        }]
      };
    } else if (error.request) {
      // The request was made but no response was received
      return {
        isError: true,
        content: [{
          type: "text",
          text: `NASA API network error: No response received or request timed out`
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
    // JPL endpoints use the same NASA API key as other NASA APIs
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
    
    const paramsWithKey = { ...params, api_key: apiKey };

    const response = await axios({
      url: `${JPL_SSD_API_BASE_URL}${endpoint}`,
      params: paramsWithKey,
      timeout: 10000, // 10 second timeout
      ...options
    });

    return response.data;
  } catch (error: any) {
    console.error(`Error calling JPL API (${endpoint}):`, error.message);
    
    if (error.response) {
      return {
        isError: true,
        content: [{
          type: "text",
          text: `JPL API error (${error.response.status}): ${error.response.data.message || 'Unknown error'}`
        }]
      };
    } else if (error.request) {
      return {
        isError: true,
        content: [{
          type: "text",
          text: `JPL API network error: No response received`
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