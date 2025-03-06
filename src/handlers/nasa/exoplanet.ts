import { z } from 'zod';
import axios from 'axios';

// Base URL for NASA's Exoplanet Archive
const EXOPLANET_API_URL = 'https://exoplanetarchive.ipac.caltech.edu/TAP/sync';

// Schema for validating Exoplanet Archive request parameters
export const exoplanetParamsSchema = z.object({
  table: z.string(),
  select: z.string().optional().default('*'),
  where: z.string().optional(),
  order: z.string().optional(),
  format: z.enum(['json', 'csv', 'tsv', 'votable']).optional().default('json'),
  limit: z.number().int().min(1).max(1000).optional().default(100)
});

// Define the request parameter type based on the schema
export type ExoplanetParams = z.infer<typeof exoplanetParamsSchema>;

/**
 * Handle requests for NASA's Exoplanet Archive
 */
export async function nasaExoplanetHandler(params: ExoplanetParams) {
  try {
    const { table, select, where, order, format, limit } = params;
    
    // Construct the ADQL query - Use Oracle compatible syntax
    let query = '';
    
    // If we have a where clause and limit, we need to use a nested query to apply the ROWNUM properly
    if (limit && where) {
      query = `SELECT ${select} FROM ${table} WHERE ${where}`;
      if (order) {
        query += ` ORDER BY ${order}`;
      }
      // Oracle doesn't support LIMIT, use ROWNUM instead
      query = `SELECT * FROM (${query}) WHERE ROWNUM <= ${limit}`;
    } else if (limit) {
      // Simple case with just a limit
      query = `SELECT ${select} FROM ${table}`;
      if (order) {
        query += ` ORDER BY ${order}`;
      }
      query += ` WHERE ROWNUM <= ${limit}`;
    } else {
      // No limit specified
      query = `SELECT ${select} FROM ${table}`;
      if (where) {
        query += ` WHERE ${where}`;
      }
      if (order) {
        query += ` ORDER BY ${order}`;
      }
    }
    
    // Make the request to the Exoplanet Archive
    const response = await axios.get(EXOPLANET_API_URL, {
      params: {
        query,
        format
      }
    });
    
    if (format === 'json') {
      return { results: response.data };
    } else {
      // For non-JSON formats, return text data
      return { 
        results: response.data,
        format: format
      };
    }
  } catch (error: any) {
    console.error('Error in Exoplanet Archive handler:', error);
    
    if (error.name === 'ZodError') {
      throw new Error(`Invalid request parameters: ${error.message}`);
    }
    
    throw new Error(`API error: ${error.message}`);
  }
} 