import { z } from 'zod';
import { nasaApiRequest } from '../../utils/api-client';
import { DonkiParams } from '../setup';
import { addResource } from '../../index';

/**
 * Handle requests for NASA's Space Weather Database Of Notifications, Knowledge, Information (DONKI) API
 */
export async function nasaDonkiHandler(params: DonkiParams) {
  try {
    const { type, startDate, endDate } = params;
    
    // Map the type to the appropriate endpoint
    const typeEndpoints: Record<string, string> = {
      cme: '/DONKI/CME',
      cmea: '/DONKI/CMEAnalysis',
      gst: '/DONKI/GST',
      ips: '/DONKI/IPS',
      flr: '/DONKI/FLR',
      sep: '/DONKI/SEP',
      mpc: '/DONKI/MPC',
      rbe: '/DONKI/RBE',
      hss: '/DONKI/HSS',
      wsa: '/DONKI/WSAEnlilSimulations',
      notifications: '/DONKI/notifications'
    };
    
    const endpoint = typeEndpoints[type];
    const queryParams: Record<string, any> = {};
    
    // Add date parameters if provided
    if (startDate) queryParams.startDate = startDate;
    if (endDate) queryParams.endDate = endDate;
    
    // Call the NASA DONKI API
    const result = await nasaApiRequest(endpoint, queryParams);
    
    // Create a resource ID and register the resource
    const dateParams = [];
    if (startDate) dateParams.push(`start=${startDate}`);
    if (endDate) dateParams.push(`end=${endDate}`);
    
    const resourceId = `nasa://donki/${type}${dateParams.length > 0 ? '?' + dateParams.join('&') : ''}`;
    
    addResource(resourceId, {
      name: `DONKI ${type.toUpperCase()} Space Weather Data${startDate ? ` from ${startDate}` : ''}${endDate ? ` to ${endDate}` : ''}`,
      mimeType: 'application/json',
      text: JSON.stringify(result, null, 2)
    });
    
    // Return the result
    return { result };
  } catch (error: any) {
    console.error('Error in DONKI handler:', error);
    
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

// Export the handler function directly as default
export default nasaDonkiHandler; 