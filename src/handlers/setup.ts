import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { z } from 'zod';
import axios from 'axios';

// NASA API handlers
import { nasaApodHandler, apodParamsSchema, ApodParams } from './nasa/apod';
import { nasaEpicHandler, epicParamsSchema, EpicParams } from './nasa/epic';
import { neoParamsSchema, NeoParams } from './nasa/neo';
import { nasaGibsHandler, gibsParamsSchema, GibsParams } from './nasa/gibs';
import { nasaCmrHandler, cmrParamsSchema, CmrParams } from './nasa/cmr';
import { nasaFirmsHandler, firmsParamsSchema, FirmsParams } from './nasa/firms';
import { nasaImagesHandler, imagesParamsSchema, ImagesParams } from './nasa/images';
import { nasaExoplanetHandler, exoplanetParamsSchema, ExoplanetParams } from './nasa/exoplanet';
import { nasaDonkiHandler } from './nasa/donki';
import { nasaMarsRoverHandler } from './nasa/mars_rover';
import { nasaEonetHandler } from './nasa/eonet';
import { nasaPowerHandler, powerParamsSchema, PowerParams } from './nasa/power';
import { nasaEarthHandler, earthParamsSchema, EarthParams } from './nasa/earth';

// JPL API handlers
import { jplSbdbHandler, sbdbParamsSchema, SbdbParams } from './jpl/sbdb';
import { jplFireballHandler, fireballParamsSchema, FireballParams } from './jpl/fireball';
import { jplScoutHandler } from './jpl/scout';

// Define schemas for all NASA API endpoints
const ApodSchema = z.object({
  date: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  count: z.number().optional(),
  thumbs: z.boolean().optional()
});

const EpicSchema = z.object({
  collection: z.enum(['natural', 'enhanced']).optional(),
  date: z.string().optional()
});

const NeoSchema = z.object({
  start_date: z.string(),
  end_date: z.string()
});

const GibsSchema = z.object({
  layer: z.string(),
  date: z.string(),
  format: z.enum(['png', 'jpg', 'jpeg']).optional(),
  resolution: z.number().optional()
});

const CmrSchema = z.object({
  keyword: z.string(),
  limit: z.number().optional(),
  page: z.number().optional(),
  sort_key: z.string().optional()
});

const FirmsSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  days: z.number().optional()
});

const ImagesSchema = z.object({
  q: z.string(),
  media_type: z.enum(['image', 'video', 'audio']).optional(),
  year_start: z.string().optional(),
  year_end: z.string().optional(),
  page: z.number().optional()
});

const ExoplanetSchema = z.object({
  table: z.string(),
  select: z.string().optional(),
  where: z.string().optional(),
  order: z.string().optional(),
  limit: z.number().optional()
});

const EarthSchema = z.object({
  lon: z.number().or(z.string().regex(/^-?\d+(\.\d+)?$/).transform(Number)),
  lat: z.number().or(z.string().regex(/^-?\d+(\.\d+)?$/).transform(Number)),
  date: z.string().optional(),
  dim: z.number().optional(),
  cloud_score: z.boolean().optional()
});

const SbdbSchema = z.object({
  search: z.string()
});

const FireballSchema = z.object({
  date_min: z.string().optional(),
  date_max: z.string().optional(),
  energy_min: z.number().optional()
});

const ScoutSchema = z.object({
  tdes: z.string().describe("Object temporary designation (e.g., P21Eolo)").optional(),
  orbit_id: z.string().describe("Scout internal orbit ID").optional(),
  limit: z.number().int().positive().describe("Limit number of results").optional(),
  file: z.enum(['summary', 'ephem', 'obs', 'crit', 'all']).describe("Type of data file to return").optional(),
  plot: z.boolean().describe("Include plots in the response").optional(),
  summary: z.boolean().describe("Include summary data in the response").optional()
});

// Define schemas for added APIs
const DonkiSchema = z.object({
  type: z.enum(['cme', 'cmea', 'gst', 'ips', 'flr', 'sep', 'mpc', 'rbe', 'hss', 'wsa', 'notifications']),
  startDate: z.string().optional(),
  endDate: z.string().optional()
});

const MarsRoverSchema = z.object({
  rover: z.enum(['curiosity', 'opportunity', 'perseverance', 'spirit']),
  sol: z.number().int().nonnegative().optional(),
  earth_date: z.string().optional(),
  camera: z.string().optional(),
  page: z.number().int().positive().optional()
});

const EonetSchema = z.object({
  category: z.string().optional(),
  days: z.number().int().positive().optional(),
  source: z.string().optional(),
  status: z.enum(['open', 'closed', 'all']).optional(),
  limit: z.number().int().positive().optional()
});

// Convert the Express handlers to MCP handlers
export const donkiParamsSchema = DonkiSchema;
export type DonkiParams = z.infer<typeof donkiParamsSchema>;

export const marsRoverParamsSchema = MarsRoverSchema;
export type MarsRoverParams = z.infer<typeof marsRoverParamsSchema>;

export const eonetParamsSchema = EonetSchema;
export type EonetParams = z.infer<typeof eonetParamsSchema>;

export const scoutParamsSchema = ScoutSchema;
export type ScoutParams = z.infer<typeof scoutParamsSchema>;

/**
 * Setup MCP handlers for NASA APIs
 * Note: With our new architecture, the actual CallToolRequestSchema handler is now
 * in the main index.ts file. This function simply registers the handlers for
 * validating parameters, but doesn't need to handle the actual tool execution.
 */
export function setupHandlers(context: Server) {
  // Our new architecture already handles the tool calls
  // This function is now mostly a placeholder, but could be used 
  // for additional server setup if needed
  
  // Register notifications handler if needed
  context.setRequestHandler(
    z.object({ method: z.literal("nasa/subscribe") }),
    async (request) => {
      return { success: true };
    }
  );
} 