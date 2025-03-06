import { z } from 'zod';
import { nasaApiRequest } from '../../utils/api-client';
import { addResource } from '../../index.js';

// Schema for validating NEO request parameters
export const neoParamsSchema = z.object({
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  asteroid_id: z.string().optional()
});

// Define the request parameter type based on the schema
export type NeoParams = z.infer<typeof neoParamsSchema>;

/**
 * Simplified NEO handler to avoid TypeScript issues
 */
export async function simpleNeoHandler(params: NeoParams) {
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
    
    // Call the NASA NEO API
    const result = await nasaApiRequest('/neo/rest/v1/feed', {
      start_date: startDate,
      end_date: endDate
    });
    
    // Store the result as a resource
    const resourceId = `neo-feed-${startDate}-${endDate}`;
    addResource(`nasa://neo/feed/${resourceId}`, {
      name: `NEO Feed: ${startDate} to ${endDate}`,
      mimeType: 'application/json',
      text: JSON.stringify(result, null, 2)
    });
    
    // Return formatted result
    return {
      content: [
        {
          type: "text",
          text: formatNeoFeedText(result, startDate, endDate)
        }
      ],
      isError: false
    };
  } catch (error: unknown) {
    console.error('Error in NEO handler:', error);
    
    return {
      content: [
        {
          type: "text",
          text: `Error retrieving NEO data: ${error instanceof Error ? error.message : String(error)}`
        }
      ],
      isError: true
    };
  }
}

/**
 * Format text for a single asteroid
 */
function formatSingleAsteroidText(asteroid: any): string {
  // Create a summary with the most important information
  let text = `# Asteroid: ${asteroid.name}\n\n`;
  text += `**NEO Reference ID:** ${asteroid.id}\n`;
  text += `**Potentially Hazardous:** ${asteroid.is_potentially_hazardous_asteroid ? '⚠️ YES' : 'No'}\n`;
  
  // Add diameter info if available
  if (asteroid.estimated_diameter && asteroid.estimated_diameter.kilometers) {
    const min = asteroid.estimated_diameter.kilometers.estimated_diameter_min.toFixed(3);
    const max = asteroid.estimated_diameter.kilometers.estimated_diameter_max.toFixed(3);
    text += `**Estimated Diameter:** ${min} - ${max} km\n`;
  }
  
  // Add close approach data if available
  if (asteroid.close_approach_data && asteroid.close_approach_data.length > 0) {
    text += `\n## Close Approaches\n\n`;
    
    // Only show the first 5 approaches
    const approachesToShow = asteroid.close_approach_data.slice(0, 5);
    
    for (const approach of approachesToShow) {
      text += `- **Date:** ${approach.close_approach_date}\n`;
      
      // Add distance if available
      if (approach.miss_distance) {
        const kmDistance = parseFloat(approach.miss_distance.kilometers).toLocaleString();
        const lunarDistance = parseFloat(approach.miss_distance.lunar).toFixed(2);
        text += `  **Distance:** ${kmDistance} km (${lunarDistance} lunar distances)\n`;
      }
      
      // Add velocity if available
      if (approach.relative_velocity) {
        const kps = parseFloat(approach.relative_velocity.kilometers_per_second).toFixed(2);
        text += `  **Relative Velocity:** ${kps} km/s\n`;
      }
      
      text += `\n`;
    }
    
    // Indicate if there are more approaches not shown
    if (asteroid.close_approach_data.length > 5) {
      text += `\n*...and ${asteroid.close_approach_data.length - 5} more close approaches*\n`;
    }
  }
  
  return text;
}

/**
 * Format text for NEO feed data
 */
function formatNeoFeedText(data: any, startDate: string, endDate: string): string {
  // Create a summary for the response
  let text = `# Near Earth Objects (${startDate} to ${endDate})\n\n`;
  text += `**Total Objects Found:** ${data.element_count}\n\n`;
  
  // Process all days in the feed to gather stats
  let hazardousCount = 0;
  let closestApproachInfo = null;
  let closestApproachDistance = Number.MAX_VALUE;
  let largestObjectInfo = null;
  let largestObjectDiameter = 0;
  
  // Process all days in the feed
  for (const date of Object.keys(data.near_earth_objects)) {
    const asteroids = data.near_earth_objects[date];
    
    for (const asteroid of asteroids) {
      // Count hazardous
      if (asteroid.is_potentially_hazardous_asteroid) {
        hazardousCount++;
      }
      
      // Track closest approach
      if (asteroid.close_approach_data && asteroid.close_approach_data.length > 0) {
        const approach = asteroid.close_approach_data[0];
        const distance = parseFloat(approach.miss_distance.kilometers);
        
        if (distance < closestApproachDistance) {
          closestApproachDistance = distance;
          closestApproachInfo = {
            name: asteroid.name,
            id: asteroid.id,
            date: approach.close_approach_date,
            distance: distance
          };
        }
      }
      
      // Track largest object
      if (asteroid.estimated_diameter && asteroid.estimated_diameter.kilometers) {
        const maxDiameter = asteroid.estimated_diameter.kilometers.estimated_diameter_max;
        if (maxDiameter > largestObjectDiameter) {
          largestObjectDiameter = maxDiameter;
          largestObjectInfo = {
            name: asteroid.name,
            id: asteroid.id,
            diameter: maxDiameter
          };
        }
      }
    }
  }
  
  // Add summary stats
  text += `**Potentially Hazardous:** ${hazardousCount} asteroids\n\n`;
  
  if (closestApproachInfo) {
    text += `**Closest Approach:** ${closestApproachInfo.name} (ID: ${closestApproachInfo.id})\n`;
    text += `  - Date: ${closestApproachInfo.date}\n`;
    text += `  - Distance: ${closestApproachInfo.distance.toLocaleString()} km\n\n`;
  }
  
  if (largestObjectInfo) {
    text += `**Largest Object:** ${largestObjectInfo.name} (ID: ${largestObjectInfo.id})\n`;
    text += `  - Estimated Max Diameter: ${largestObjectInfo.diameter.toLocaleString()} km\n\n`;
  }
  
  // Add details for each day
  text += `## Daily Breakdown\n\n`;
  
  // Sort dates chronologically
  const sortedDates = Object.keys(data.near_earth_objects).sort();
  
  for (const date of sortedDates) {
    const asteroids = data.near_earth_objects[date];
    text += `### ${date} - ${asteroids.length} objects\n\n`;
    
    // Show hazardous asteroids first
    const hazardous = asteroids.filter((a: any) => a.is_potentially_hazardous_asteroid);
    if (hazardous.length > 0) {
      text += `**⚠️ Potentially Hazardous:**\n\n`;
      
      for (const asteroid of hazardous) {
        text += `- **${asteroid.name}** (ID: ${asteroid.id})\n`;
        
        // Add diameter info
        if (asteroid.estimated_diameter && asteroid.estimated_diameter.kilometers) {
          const min = asteroid.estimated_diameter.kilometers.estimated_diameter_min.toFixed(3);
          const max = asteroid.estimated_diameter.kilometers.estimated_diameter_max.toFixed(3);
          text += `  - Diameter: ${min} - ${max} km\n`;
        }
        
        // Add close approach info
        if (asteroid.close_approach_data && asteroid.close_approach_data.length > 0) {
          const approach = asteroid.close_approach_data[0];
          
          // Add distance
          if (approach.miss_distance) {
            const km = parseFloat(approach.miss_distance.kilometers).toLocaleString();
            const lunar = parseFloat(approach.miss_distance.lunar).toFixed(2);
            text += `  - Distance: ${km} km (${lunar} lunar distances)\n`;
          }
          
          // Add velocity
          if (approach.relative_velocity) {
            const kps = parseFloat(approach.relative_velocity.kilometers_per_second).toFixed(2);
            text += `  - Velocity: ${kps} km/s\n`;
          }
        }
        
        text += `\n`;
      }
    }
    
    // Show non-hazardous asteroids (limit to 10 for brevity)
    const safe = asteroids.filter((a: any) => !a.is_potentially_hazardous_asteroid);
    if (safe.length > 0) {
      text += `**Other Objects:**\n\n`;
      
      // Only show the first 10 non-hazardous objects
      const safeToShow = safe.slice(0, 10);
      
      for (const asteroid of safeToShow) {
        text += `- **${asteroid.name}** (ID: ${asteroid.id})\n`;
        
        // Add approach info if available
        if (asteroid.close_approach_data && asteroid.close_approach_data.length > 0) {
          const approach = asteroid.close_approach_data[0];
          
          if (approach.miss_distance) {
            const km = parseFloat(approach.miss_distance.kilometers).toLocaleString();
            text += `  - Distance: ${km} km\n`;
          }
        }
      }
      
      // Indicate if there are more objects not shown
      if (safe.length > 10) {
        text += `\n*...and ${safe.length - 10} more non-hazardous objects*\n`;
      }
    }
    
    text += `\n`;
  }
  
  return text;
} 