import { z } from 'zod';
import { jplApiRequest } from '../../utils/api-client';
import { ScoutParams } from '../setup';
import { addResource } from '../../resources'; // Import addResource

/**
 * Process the Scout API result and format it for display.
 */
function processScoutResult(data: any, params: ScoutParams): string {
  // Handle API-level errors first
  if (data.error_code) {
    return `Error from Scout API (${data.error_code}): ${data.error_msg}`;
  }
  if (data.error) { // Handle other error format like "object does not exist"
    return `Error from Scout API: ${data.error}`;
  }

  let summary = `## JPL Scout Data\n\n`;

  if (params.tdes || params.orbit_id) {
    // Single object result
    if (!data.data || data.data.length === 0) {
      // If no specific error was returned, but data is empty, state that.
      return summary + `No data array found for object specified by ${params.tdes ? 'tdes='+params.tdes : ''}${params.orbit_id ? 'orbit_id='+params.orbit_id : ''}. Object may not exist or data type not available.`;
    }
    const obj = data.data[0];
    summary += `**Object:** ${obj.neo || 'N/A'} (${params.tdes || params.orbit_id})\n`;
    summary += `**Last Observed:** ${obj.last_obs || 'N/A'}\n`;
    summary += `**Observations:** ${obj.n_obs || 'N/A'}\n`;
    summary += `**RMS:** ${obj.rms || 'N/A'}\n`;
    summary += `**MOID (AU):** ${obj.moid || 'N/A'}\n`;
    summary += `**V_inf (km/s):** ${obj.v_inf || 'N/A'}\n`;
    summary += `**Impact Probability:** ${obj.impact_prob || 'N/A'}\n`;
    if (obj.summary) {
      summary += `**Summary:** ${obj.summary}\n`;
    }
    // Add more fields if file=ephem, obs, crit, all are requested
  } else {
    // List result
    summary += `**Total Objects Found:** ${data.total || 'N/A'}\n`;
    summary += `**Showing:** ${data.count !== undefined ? data.count : 'N/A'} (Limit: ${params.limit || data.limit || 'default'})\n\n`;
    if (data.data && Array.isArray(data.data) && data.data.length > 0) {
      data.data.forEach((obj: any, index: number) => {
        summary += `### ${index + 1}. ${obj.neo || 'Unknown Designation'}\n`;
        summary += `  - Last Observed: ${obj.last_obs || 'N/A'}\n`;
        summary += `  - Observations: ${obj.n_obs || 'N/A'}\n`;
        summary += `  - MOID (AU): ${obj.moid || 'N/A'}\n`;
        summary += `  - Impact Probability: ${obj.impact_prob || 'N/A'}\n`;
      });
    } else {
      summary += `No objects found matching criteria or returned in list.\n`;
    }
  }
  
  return summary;
}

/**
 * Handle requests for JPL's Scout API
 * Scout is a hazard assessment system that automatically calculates the potential 
 * for an object to be an impactor based on the available observations.
 */
export async function jplScoutHandler(params: ScoutParams) {
  try {
    // Call the Scout API using jplApiRequest
    const result = await jplApiRequest('/scout.api', params);

    // Check for errors returned by jplApiRequest itself (network, etc.)
    if (result.isError) {
      return result; // Already formatted error response
    }
    
    // Check for API-specific errors within the payload (different formats)
    if (result.error_code || result.error) {
       return {
        isError: true,
        content: [{
          type: "text",
          text: `Error from Scout API: ${result.error_msg || result.error}`
        }]
      };
    }

    // Process the successful result
    const summaryText = processScoutResult(result, params);
    
    // Add the result as an MCP resource
    let resourceUri = 'jpl://scout/list';
    if (params.tdes) {
      resourceUri = `jpl://scout?tdes=${params.tdes}`;
    } else if (params.orbit_id) {
      resourceUri = `jpl://scout?orbit_id=${params.orbit_id}`;
    } else if (params.limit) {
      resourceUri = `jpl://scout/list?limit=${params.limit}`;
    } // Add more specific URIs if other params like 'file' are used
    
    addResource(resourceUri, {
      name: `JPL Scout Data ${params.tdes || params.orbit_id || '(List)'}`,
      mimeType: 'application/json',
      text: JSON.stringify(result, null, 2)
    });

    return {
      content: [{
        type: "text",
        text: summaryText
      }],
      isError: false
    };
    
  } catch (error: any) { // Catch unexpected errors during processing
    console.error('Error in JPL Scout handler:', error);
    return {
      isError: true,
      content: [{
        type: "text",
        text: `Handler Error: ${error.message || 'An unexpected error occurred processing Scout data'}`
      }]
    };
  }
} 
