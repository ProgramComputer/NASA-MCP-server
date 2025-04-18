import { z } from 'zod';
import { nasaApiRequest } from '../../utils/api-client';
import { addResource } from '../../resources';

// Schema for validating NEO request parameters
export const neoParamsSchema = z.object({
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  asteroid_id: z.string().optional()
});

// Define the request parameter type based on the schema
export type NeoParams = z.infer<typeof neoParamsSchema>;

/**
 * Handle requests for NASA's Near Earth Object Web Service (NEO WS)
 */
export async function nasaNeoHandler(params: NeoParams) {
  try {
    // If we're looking for a specific asteroid by ID
    if (params.asteroid_id) {
      const endpoint = `/neo/rest/v1/neo/${params.asteroid_id}`;
      const result = await nasaApiRequest(endpoint, {});
      
      // Store the result as a resource
      addResource(`nasa://neo/${params.asteroid_id}`, {
        name: `Asteroid: ${result.name}`,
        mimeType: 'application/json',
        text: JSON.stringify(result, null, 2)
      });
      
      // Return formatted result
      return {
        content: [
          {
            type: "text",
            text: formatSingleAsteroidText(result)
          }
        ],
        isError: false
      };
    }
    
    // Default to today if no dates specified
    let startDate = params.start_date;
    let endDate = params.end_date;
    
    if (!startDate) {
      const today = new Date();
      startDate = today.toISOString().split('T')[0];
    }
    
    // If no end_date, use start_date (same day)
    if (!endDate) {
      endDate = startDate;
    }
    
    // API limits feed to 7 days
    const maxDays = 7;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const daysDiff = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysDiff > maxDays) {
      return {
        content: [
          {
            type: "text",
            text: `Error: Date range too large. NEO feed is limited to ${maxDays} days.`
          }
        ],
        isError: true
      };
    }
    
    // Call the NASA NEO API
    const endpoint = `/neo/rest/v1/feed?start_date=${startDate}&end_date=${endDate}`;
    const result = await nasaApiRequest(endpoint, {});
    
    // Process and format the results
    return processNeoFeedResults(result, startDate, endDate);
  } catch (error: any) {
    console.error('Error in NEO handler:', error);
    
    return {
      content: [
        {
          type: "text",
          text: `Error retrieving NEO data: ${error.message}`
        }
      ],
      isError: true
    };
  }
}

/**
 * Format a single asteroid object into a human-readable text
 */
function formatSingleAsteroidText(asteroid: any): string {
  // Format the diameter in km
  const minDiameterKm = asteroid.estimated_diameter?.kilometers?.estimated_diameter_min?.toFixed(3) || 'unknown';
  const maxDiameterKm = asteroid.estimated_diameter?.kilometers?.estimated_diameter_max?.toFixed(3) || 'unknown';
  const diameterText = `${minDiameterKm} - ${maxDiameterKm} km`;
  
  // Create intro text
  let text = `# Asteroid: ${asteroid.name}\n\n`;
  text += `**NEO Reference ID:** ${asteroid.id}\n`;
  text += `**Potentially Hazardous:** ${asteroid.is_potentially_hazardous_asteroid ? '⚠️ YES' : '✓ NO'}\n`;
  text += `**Estimated Diameter:** ${diameterText}\n\n`;
  
  // Add close approach data
  const closeApproaches = asteroid.close_approach_data || [];
  if (closeApproaches.length > 0) {
    text += `## Close Approaches\n\n`;
    
    // Only show the first 5 close approaches to avoid excessively long text
    const displayLimit = 5; 
    const showCount = Math.min(displayLimit, closeApproaches.length);
    
    for (let i = 0; i < showCount; i++) {
      const ca = closeApproaches[i];
      const date = ca.close_approach_date;
      const distance = Number(ca.miss_distance.kilometers).toFixed(3);
      const lunarDistance = (Number(ca.miss_distance.lunar) || 0).toFixed(2);
      const velocity = Number(ca.relative_velocity.kilometers_per_second).toFixed(2);
      
      text += `- **Date:** ${date}\n`;
      text += `  **Distance:** ${distance} km (${lunarDistance} lunar distances)\n`;
      text += `  **Relative Velocity:** ${velocity} km/s\n\n`;
    }
    
    // Add a note if there are more close approaches than we're showing
    if (closeApproaches.length > displayLimit) {
      text += `\n*...and ${closeApproaches.length - displayLimit} more close approaches*\n`;
    }
  }
  
  return text;
}

/**
 * Process and format NEO feed results for a date range
 */
function processNeoFeedResults(feedData: any, startDate: string, endDate: string) {
  try {
    // Store the feed data as a resource
    const resourceId = `neo-feed-${startDate}-${endDate}`;
    addResource(`nasa://neo/feed/${resourceId}`, {
      name: `NEO Feed: ${startDate} to ${endDate}`,
      mimeType: 'application/json',
      text: JSON.stringify(feedData, null, 2)
    });
    
    // Format the data for display
    const text = formatNeoFeedText(feedData, startDate, endDate);
    
    return {
      content: [
        {
          type: "text",
          text: text
        }
      ],
      isError: false
    };
  } catch (error: any) {
    console.error('Error processing NEO feed results:', error);
    return {
      content: [
        {
          type: "text",
          text: `Error processing NEO feed data: ${error.message}`
        }
      ],
      isError: true
    };
  }
}

/**
 * Format NEO feed data into a human-readable text
 */
function formatNeoFeedText(feedData: any, startDate: string, endDate: string): string {
  // Get the count of NEOs
  const neoCount = feedData.element_count || 0;
  const dateRangeText = startDate === endDate ? startDate : `${startDate} to ${endDate}`;
  
  // Start with a summary
  let text = `# Near Earth Objects (${dateRangeText})\n\n`;
  text += `**Found ${neoCount} near-Earth objects**\n\n`;
  
  // Get the near earth objects by date
  const neosByDate = feedData.near_earth_objects || {};
  
  // For each date
  Object.keys(neosByDate).sort().forEach(date => {
    const objects = neosByDate[date] || [];
    text += `## ${date} (${objects.length} objects)\n\n`;
    
    // Sort by close approach time
    objects.sort((a: any, b: any) => {
      const timeA = a.close_approach_data?.[0]?.close_approach_date_full || '';
      const timeB = b.close_approach_data?.[0]?.close_approach_date_full || '';
      return timeA.localeCompare(timeB);
    });
    
    // For each object
    objects.forEach((neo: any) => {
      const name = neo.name;
      const id = neo.id;
      const isHazardous = neo.is_potentially_hazardous_asteroid;
      const minDiameterKm = neo.estimated_diameter?.kilometers?.estimated_diameter_min?.toFixed(3) || '?';
      const maxDiameterKm = neo.estimated_diameter?.kilometers?.estimated_diameter_max?.toFixed(3) || '?';
      
      // Close approach data
      const closeApproach = neo.close_approach_data?.[0] || {};
      const approachTime = closeApproach.close_approach_date_full || '?';
      const distanceKm = Number(closeApproach.miss_distance?.kilometers || 0).toFixed(0);
      const lunarDistance = Number(closeApproach.miss_distance?.lunar || 0).toFixed(2);
      const velocityKmps = Number(closeApproach.relative_velocity?.kilometers_per_second || 0).toFixed(2);
      
      text += `### ${name} (ID: ${id})\n\n`;
      text += `- **Potentially Hazardous:** ${isHazardous ? '⚠️ YES' : '✓ NO'}\n`;
      text += `- **Estimated Diameter:** ${minDiameterKm} - ${maxDiameterKm} km\n`;
      text += `- **Closest Approach:** ${approachTime}\n`;
      text += `- **Miss Distance:** ${distanceKm} km (${lunarDistance} lunar distances)\n`;
      text += `- **Relative Velocity:** ${velocityKmps} km/s\n\n`;
    });
  });
  
  return text;
}

// Export the handler function directly as default
export default nasaNeoHandler; 
