#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import dotenv from "dotenv";
import { setupHandlers } from "./handlers/setup";
import { setupEnvironment } from "./utils/env-setup";
import { z } from "zod";
import { 
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import path from 'path';
import { nasaApiRequest, jplApiRequest } from './utils/api-client';
import { apodParamsSchema } from './handlers/nasa/apod';
import { resources, addResource as addResourceCore, Resource } from './resources';

// Load environment variables with enhanced setup
setupEnvironment();
// Also load with standard dotenv for compatibility
dotenv.config();

// Keep a reference to the server for notifications
let serverInstance: Server | null = null;

// Define resource generator function type
type ResourceGenerator = (params: Record<string, string>) => Promise<{
  name: string;
  mimeType: string;
  text?: string;
  blob?: Uint8Array;
}>;

// Resource templates definition
export const resourceTemplates: Array<{
  uriTemplate: string;
  name: string;
  description: string;
  generator: ResourceGenerator;
}> = [
  {
    name: "nasa-apod-image",
    description: "NASA Astronomy Picture of the Day",
    uriTemplate: "nasa://apod/image?date={date}",
    generator: async (params) => {
      const date = params["date"] || "2023-01-01";
      return {
        name: `Astronomy Picture of the Day (${date})`,
        mimeType: "application/json",
        text: JSON.stringify({
          date,
          title: "The Tail of a Christmas Comet",
          url: "https://apod.nasa.gov/apod/image/2301/CometZTF_Hernandez_1080.jpg",
          explanation: "Better known as Comet ZTF, this comet was captured on January 1, glowing in the predawn sky."
        }, null, 2)
      };
    }
  },
  {
    name: "nasa-epic-image",
    description: "NASA EPIC Earth observation image",
    uriTemplate: "nasa://epic/image?date={date}&collection={collection}",
    generator: async (params) => {
      const date = params["date"] || "2023-01-01";
      const collection = params["collection"] || "natural";
      return {
        name: `EPIC Earth View (${date})`,
        mimeType: "application/json",
        text: JSON.stringify({
          date,
          collection,
          images: [
            {
              identifier: "20230101010203",
              caption: "Earth from the DSCOVR satellite",
              image: "https://epic.gsfc.nasa.gov/archive/natural/2023/01/01/png/epic_1b_20230101010203.png"
            }
          ]
        }, null, 2)
      };
    }
  },
  {
    name: "mars-rover-photo",
    description: "NASA Mars Rover photograph",
    uriTemplate: "nasa://mars-rover/photo?rover={rover}&id={id}",
    generator: async (params) => {
      const rover = params["rover"] || "curiosity";
      const id = params["id"] || "1";
      return {
        name: `NASA Mars Rover photograph`,
        mimeType: "image/jpeg",
        text: `https://mars.nasa.gov/msl-raw-images/proj/msl/redops/odyssey/images/${rover}/edr/fcam/${id}.jpg`,
        blob: new Uint8Array()
      };
    }
  },
  {
    name: "nasa-image",
    description: "NASA Image and Video Library item",
    uriTemplate: "nasa://images/item?nasa_id={nasa_id}",
    generator: async (params) => {
      const nasa_id = params["nasa_id"] || "1";
      return {
        name: `NASA Image and Video Library item (${nasa_id})`,
        mimeType: "image/jpeg",
        text: `https://images-assets.nasa.gov/image/${nasa_id}/metadata.json`,
        blob: new Uint8Array()
      };
    }
  },
  {
    name: "nasa-gibs-imagery",
    description: "NASA Global Imagery Browse Services (GIBS) satellite image",
    uriTemplate: "nasa://gibs/imagery?layer={layer}&date={date}",
    generator: async (params) => {
      const layer = params["layer"] || "MODIS_Terra_CorrectedReflectance_TrueColor";
      const date = params["date"] || "2023-01-01";
      return {
        name: `NASA Global Imagery Browse Services satellite image (${layer}, ${date})`,
        mimeType: "image/jpeg",
        text: `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/${layer}/${date}/default/default.jpg`,
        blob: new Uint8Array()
      };
    }
  },
  {
    name: "jpl-asteroid-data",
    description: "JPL Small-Body Database entry",
    uriTemplate: "jpl://sbdb?object={object}",
    generator: async (params) => {
      const object = params["object"] || "Ceres";
      return {
        name: `JPL Small-Body Database entry (${object})`,
        mimeType: "application/json",
        text: `https://ssd.jpl.nasa.gov/api/astorb.api?format=json&number=1&orb=0&fullname=${encodeURIComponent(object)}`,
        blob: new Uint8Array()
      };
    }
  },
  {
    name: "nasa-earth-imagery",
    description: "NASA Earth Landsat satellite imagery",
    uriTemplate: "nasa://earth/imagery?lon={lon}&lat={lat}&date={date}",
    generator: async (params) => {
      const lon = params["lon"] || "-122.4783";
      const lat = params["lat"] || "37.8199";
      const date = params["date"] || "";
      
      return {
        name: `Landsat imagery at coordinates (${lon}, ${lat})`,
        mimeType: "application/json",
        text: JSON.stringify({
          coordinates: {
            lon,
            lat
          },
          date: date || "latest",
          image_url: `https://api.nasa.gov/planetary/earth/imagery?lon=${lon}&lat=${lat}${date ? `&date=${date}` : ''}&api_key=DEMO_KEY`
        }, null, 2)
      };
    }
  }
];

// Add some initial example resources
function initializeResources() {
  // Add an example APOD resource
  addResource("nasa://apod/image?date=2023-01-01", {
    name: "Astronomy Picture of the Day (2023-01-01)",
    mimeType: "application/json",
    text: JSON.stringify({
      date: "2023-01-01",
      title: "The Tail of a Christmas Comet",
      url: "https://apod.nasa.gov/apod/image/2301/CometZTF_Hernandez_1080.jpg",
      explanation: "Better known as Comet ZTF, this comet was captured on January 1, glowing in the predawn sky."
    }, null, 2)
  });

  // Add an example EPIC resource
  addResource("nasa://epic/image?date=2023-01-01&collection=natural", {
    name: "EPIC Earth View (2023-01-01)",
    mimeType: "application/json",
    text: JSON.stringify({
      date: "2023-01-01",
      collection: "natural",
      images: [
        {
          identifier: "20230101010203",
          caption: "Earth from the DSCOVR satellite",
          image: "https://epic.gsfc.nasa.gov/archive/natural/2023/01/01/png/epic_1b_20230101010203.png"
        }
      ]
    }, null, 2)
  });

  // Add an example NEO resource
  addResource("nasa://neo/list?date=2023-01-01", {
    name: "Near Earth Objects (2023-01-01)",
    mimeType: "application/json",
    text: JSON.stringify({
      date: "2023-01-01",
      element_count: 2,
      near_earth_objects: {
        "2023-01-01": [
          {
            id: "3542519",
            name: "2054 UR6",
            absolute_magnitude_h: 20.7,
            is_potentially_hazardous_asteroid: false
          },
          {
            id: "3759690",
            name: "2016 WF9",
            absolute_magnitude_h: 19.3,
            is_potentially_hazardous_asteroid: true
          }
        ]
      }
    }, null, 2)
  });
}

// Define our prompts
const nasaPrompts = [
  {
    name: "nasa/get-astronomy-picture",
    description: "Fetch NASA's Astronomy Picture of the Day with optional date selection",
    arguments: [
      {
        name: "date",
        description: "The date of the APOD image to retrieve (YYYY-MM-DD format)",
        required: false
      },
      {
        name: "count",
        description: "Number of random APODs to retrieve",
        required: false
      },
      {
        name: "start_date",
        description: "Start date for date range search (YYYY-MM-DD)",
        required: false
      },
      {
        name: "end_date",
        description: "End date for date range search (YYYY-MM-DD)",
        required: false
      },
      {
        name: "thumbs",
        description: "Return URL of thumbnail for video content",
        required: false
      }
    ]
  },
  {
    name: "nasa/browse-near-earth-objects",
    description: "Find near-Earth asteroids within a specific date range",
    arguments: [
      {
        name: "start_date",
        description: "Start date for asteroid search (YYYY-MM-DD format)",
        required: true
      },
      {
        name: "end_date",
        description: "End date for asteroid search (YYYY-MM-DD format)",
        required: true
      }
    ]
  },
  {
    name: "nasa/view-epic-imagery",
    description: "Browse Earth Polychromatic Imaging Camera views of Earth",
    arguments: [
      {
        name: "collection",
        description: "Image collection to view ('natural' or 'enhanced')",
        required: false
      },
      {
        name: "date",
        description: "Date of images to retrieve (YYYY-MM-DD format)",
        required: false
      }
    ]
  }
];

const jplPrompts = [
  {
    name: "jpl_query-small-body-database",
    description: "Search the Small-Body Database for asteroids and comets matching specific criteria",
    arguments: [
      {
        name: "object_name",
        description: "Name or designation of the object (e.g., 'Ceres')",
        required: false
      },
      {
        name: "spk_id",
        description: "SPK ID of the object",
        required: false
      },
      {
        name: "object_type",
        description: "Type of object ('ast' for asteroid, 'com' for comet)",
        required: false
      }
    ]
  },
  {
    name: "jpl_find-close-approaches",
    description: "Find close approaches of asteroids and comets to Earth or other planets",
    arguments: [
      {
        name: "dist_max",
        description: "Maximum approach distance in lunar distances (LD)",
        required: false
      },
      {
        name: "date_min",
        description: "Start date for search (YYYY-MM-DD)",
        required: false
      },
      {
        name: "date_max",
        description: "End date for search (YYYY-MM-DD)",
        required: false
      },
      {
        name: "body",
        description: "Body to find close approaches to (default: Earth)",
        required: false
      }
    ]
  },
  {
    name: "jpl_get-fireball-data",
    description: "Retrieve data about fireballs detected by US Government sensors",
    arguments: [
      {
        name: "date_min",
        description: "Start date for fireball data (YYYY-MM-DD)",
        required: false
      },
      {
        name: "date_max", 
        description: "End date for fireball data (YYYY-MM-DD)",
        required: false
      },
      {
        name: "energy_min",
        description: "Minimum energy in kilotons of TNT",
        required: false
      }
    ]
  }
];

// Define the additional direct MCP prompts
const mcpPrompts = [
  {
    name: "apod-daily",
    description: "Get NASA's Astronomy Picture of the Day with a natural language prompt",
    arguments: [
      {
        name: "date",
        description: "The date of the APOD image to retrieve (YYYY-MM-DD format)",
        required: false
      },
      {
        name: "count",
        description: "Number of random APODs to retrieve",
        required: false
      },
      {
        name: "start_date",
        description: "Start date for date range search (YYYY-MM-DD)",
        required: false
      },
      {
        name: "end_date",
        description: "End date for date range search (YYYY-MM-DD)",
        required: false
      },
      {
        name: "thumbs",
        description: "Return URL of thumbnail for video content",
        required: false
      }
    ]
  }
];

// Combine all prompts
const allPrompts = [...nasaPrompts, ...jplPrompts, ...mcpPrompts];

async function startServer() {
  try {
    // Initialize resources
    initializeResources();
    
    // Initialize MCP server with proper capabilities structure
    const server = new Server(
      {
        name: "NASA MCP Server",
        description: "Model Context Protocol server for NASA APIs",
        version: "1.0.13"
      },
      {
        capabilities: {
          resources: {
            uriSchemes: ["nasa", "jpl"]
          },
          tools: {
            callSchema: CallToolRequestSchema
          },
          prompts: {
            list: allPrompts
          },
          logging: {}
        }
      }
    );
    
    // Store the server instance for global access
    serverInstance = server;
    
    // Register the tools/manifest method handler (important for MCP compliance)
    server.setRequestHandler(
      z.object({ 
        method: z.literal("tools/manifest"),
        params: z.object({}).optional()
      }),
      async () => {
        // Return all tools we support in the MCP required format
        return {
          apis: [
            {
              name: "nasa_apod",
              id: "nasa/apod",
              description: "Fetch NASA's Astronomy Picture of the Day"
            },
            {
              name: "nasa_neo",
              id: "nasa/neo",
              description: "Information about asteroids and near-Earth objects"
            },
            {
              name: "nasa_epic",
              id: "nasa/epic",
              description: "Earth Polychromatic Imaging Camera views of Earth"
            },
            {
              name: "nasa_gibs",
              id: "nasa/gibs",
              description: "Global Imagery Browse Services satellite imagery"
            },
            {
              name: "nasa_cmr",
              id: "nasa/cmr",
              description: "Search NASA's Common Metadata Repository for satellite data"
            },
            {
              name: "nasa_firms",
              id: "nasa/firms",
              description: "Fire Information for Resource Management System"
            },
            {
              name: "nasa_images",
              id: "nasa/images",
              description: "Search NASA's image and video library"
            },
            {
              name: "nasa_exoplanet",
              id: "nasa/exoplanet",
              description: "Access NASA's Exoplanet Archive data"
            },
            {
              name: "nasa_donki",
              id: "nasa/donki",
              description: "Space Weather Database Of Notifications, Knowledge, Information"
            },
            {
              name: "nasa_mars_rover",
              id: "nasa/mars-rover",
              description: "Browse photos from NASA's Mars rovers"
            },
            {
              name: "nasa_eonet",
              id: "nasa/eonet",
              description: "Earth Observatory Natural Event Tracker"
            },
            {
              name: "nasa_power",
              id: "nasa/power",
              description: "Prediction of Worldwide Energy Resources"
            },
            {
              name: "jpl_sbdb",
              id: "jpl/sbdb",
              description: "Small-Body DataBase (SBDB) - primarily orbital data on all known asteroids and comets"
            },
            {
              name: "jpl_fireball",
              id: "jpl/fireball",
              description: "Fireball atmospheric impact data reported by US Government sensors"
            },
            {
              name: "jpl_jd_cal",
              id: "jpl/jd_cal",
              description: "Julian Day number to/from calendar date/time converter"
            },
            {
              name: "jpl_nhats",
              id: "jpl/nhats",
              description: "Human-accessible NEOs (Near-Earth Objects) data"
            },
            {
              name: "jpl_cad",
              id: "jpl/cad",
              description: "Asteroid and comet close approaches to the planets in the past and future"
            },
            {
              name: "jpl_sentry",
              id: "jpl/sentry",
              description: "JPL Sentry - NEO Earth impact risk assessment data"
            },
            {
              name: "jpl_horizons",
              id: "jpl/horizons",
              description: "JPL Horizons - Solar system objects ephemeris data"
            },
            {
              name: "jpl_scout",
              id: "jpl/scout",
              description: "NEOCP orbits, ephemerides, and impact risk data (Scout)"
            },
            // {
            //   name: "nasa_earth",
            //   id: "nasa/earth", 
            //   description: "Earth - Landsat satellite imagery and data"
            // }
          ]
        };
      }
    );
    
    // Register the standard MCP methods
    // List Resources Handler
    server.setRequestHandler(
      z.object({ 
        method: z.literal("resources/list"),
        params: z.object({}).optional()
      }),
      async () => {
        // Get concrete resources
        const concreteResources = Array.from(resources.entries()).map(([uri, resource]) => ({
          uri: uri,
          mimeType: resource.mimeType,
          name: resource.name
        }));
        
        // Get resource templates
        const resourceTemplatesList = resourceTemplates.map(template => ({
          uriTemplate: template.uriTemplate,
          name: template.name,
          description: template.description
        }));
        
        // Return combined list
        return {
          resources: [...concreteResources, ...resourceTemplatesList]
        };
      }
    );
    
    // Standard handler using the ListResourcesRequestSchema (may be an alternate way to call the same endpoint)
    server.setRequestHandler(ListResourcesRequestSchema, async () => {
      // Get concrete resources
      const concreteResources = Array.from(resources.entries()).map(([uri, resource]) => ({
        uri: uri,
        mimeType: resource.mimeType,
        name: resource.name
      }));
      
      // Get resource templates - mapped to have uri property to match protocol requirements
      const resourceTemplatesList = resourceTemplates.map(template => ({
        uri: template.uriTemplate, // Use uriTemplate as uri
        name: template.name,
        description: template.description
      }));
      
      // Return combined list
      return {
        resources: [...concreteResources, ...resourceTemplatesList]
      };
    });
    
    // Read Resource Handler
    server.setRequestHandler(
      z.object({ 
        method: z.literal("resources/read"),
        params: z.object({
          uri: z.string()
        })
      }),
      async (request) => {
        const uri = request.params.uri.toString();
        const resource = resources.get(uri);
        
        if (!resource) {
          throw new Error(`Resource not found: ${uri}`);
        }
        
        return {
          contents: [{
            uri,
            mimeType: resource.mimeType,
            text: resource.text,
            blob: resource.blob
          }]
        };
      }
    );
    
    // Standard handler using the ReadResourceRequestSchema
    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri.toString();
      
      // Check if this is a concrete resource
      const resource = resources.get(uri);
      if (resource) {
        return {
          contents: [{
            uri,
            mimeType: resource.mimeType,
            text: resource.text,
            blob: resource.blob
          }]
        };
      }
      
      // If not found as a concrete resource, check if it matches any resource templates
      for (const template of resourceTemplates) {
        // Create a regex pattern from the template URI, replacing parameters with capture groups
        // This is a basic implementation - a more robust one would properly parse URI templates
        const pattern = template.uriTemplate.replace(/\{([^}]+)\}/g, '([^/]+)');
        const regex = new RegExp(`^${pattern}$`);
        const match = uri.match(regex);
        
        if (match) {
          // Extract parameter values from the URI
          const paramNames = Array.from(template.uriTemplate.matchAll(/\{([^}]+)\}/g)).map(m => m[1]);
          const paramValues = match.slice(1); // Skip the first element (full match)
          
          const params: Record<string, string> = {};
          paramNames.forEach((name, index) => {
            params[name] = paramValues[index];
          });
          
          // Call the parameterized generator function to get the resource
          try {
            const generatedResource = await template.generator(params);
            return {
              contents: [{
                uri,
                mimeType: generatedResource.mimeType,
                text: generatedResource.text,
                blob: generatedResource.blob
              }]
            };
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to generate resource: ${errorMessage}`);
          }
        }
      }
      
      // If we get here, the resource was not found
      throw new Error(`Resource not found: ${uri}`);
    });
    
    // List Tools Handler - Fixed the method name from "list-tools" to "tools/list"
    server.setRequestHandler(
      z.object({ 
        method: z.literal("tools/list"),
        params: z.object({}).optional()
      }),
      async () => {
        // Return all tools we support in the MCP required format
        return {
          tools: [
            {
              name: "nasa_apod",
              description: "Fetch NASA's Astronomy Picture of the Day",
              inputSchema: {
                type: "object",
                properties: {
                  date: {
                    type: "string",
                    description: "The date of the APOD image to retrieve (YYYY-MM-DD)"
                  },
                  count: {
                    type: "number",
                    description: "Count of random APODs to retrieve"
                  },
                  start_date: {
                    type: "string",
                    description: "Start date for date range search (YYYY-MM-DD)"
                  },
                  end_date: {
                    type: "string",
                    description: "End date for date range search (YYYY-MM-DD)"
                  },
                  thumbs: {
                    type: "boolean",
                    description: "Return URL of thumbnail for video content"
                  }
                },
                required: ["date"]
              }
            },
            {
              name: "nasa_neo",
              description: "Near Earth Object Web Service - information about asteroids",
              inputSchema: {
                type: "object",
                properties: {
                  start_date: {
                    type: "string",
                    description: "Start date for asteroid search (YYYY-MM-DD)"
                  },
                  end_date: {
                    type: "string",
                    description: "End date for asteroid search (YYYY-MM-DD)"
                  },
                  asteroid_id: {
                    type: "string",
                    description: "ID of a specific asteroid"
                  }
                },
                required: ["start_date", "end_date"]
              }
            },
            {
              name: "nasa_epic",
              description: "Earth Polychromatic Imaging Camera - views of Earth",
              inputSchema: {
                type: "object",
                properties: {
                  collection: {
                    type: "string",
                    description: "Image collection (natural or enhanced)"
                  },
                  date: {
                    type: "string",
                    description: "Date of the image (YYYY-MM-DD)"
                  }
                }
              }
            },
            {
              name: "nasa_gibs",
              description: "Global Imagery Browse Services - satellite imagery",
              inputSchema: {
                type: "object",
                properties: {
                  layer: {
                    type: "string",
                    description: "Layer name (e.g., MODIS_Terra_CorrectedReflectance_TrueColor)"
                  },
                  date: {
                    type: "string",
                    description: "Date of imagery (YYYY-MM-DD)"
                  },
                  format: {
                    type: "string",
                    description: "Image format (png, jpg, jpeg)"
                  },
                  resolution: {
                    type: "number",
                    description: "Resolution in pixels per degree"
                  }
                },
                required: ["layer", "date"]
              }
            },
            {
              name: "nasa_cmr",
              description: "NASA Common Metadata Repository - search for NASA data collections",
              inputSchema: {
                type: "object",
                properties: {
                  keyword: {
                    type: "string",
                    description: "Search keyword"
                  },
                  search_type: {
                    type: "string",
                    description: "Search type (collections or granules)",
                    enum: ["collections", "granules"],
                    default: "collections"
                  },
                  format: {
                    type: "string",
                    description: "Response format",
                    enum: ["json", "umm_json", "atom", "echo10", "iso19115", "iso_smap", "kml"],
                    default: "json"
                  },
                  limit: {
                    type: "number",
                    description: "Maximum number of results to return"
                  },
                  page: {
                    type: "number",
                    description: "Page number for pagination"
                  },
                  sort_key: {
                    type: "string",
                    description: "Field to sort results by"
                  }
                },
                required: ["keyword","search_type", "format"]
              }
            },
            {
              name: "nasa_firms",
              description: "NASA Fire Information for Resource Management System - fire data",
              inputSchema: {
                type: "object",
                properties: {
                  latitude: {
                    type: "number",
                    description: "Latitude coordinate"
                  },
                  longitude: {
                    type: "number",
                    description: "Longitude coordinate"
                  },
                  days: {
                    type: "number",
                    description: "Number of days of data to retrieve"
                  }
                },
                required: ["latitude", "longitude"]
              }
            },
            {
              name: "nasa_images",
              description: "NASA Image and Video Library - search NASA's media archive",
              inputSchema: {
                type: "object",
                properties: {
                  q: {
                    type: "string",
                    description: "Search query"
                  },
                  media_type: {
                    type: "string",
                    description: "Media type (image, video, audio)"
                  },
                  year_start: {
                    type: "string",
                    description: "Start year for results"
                  },
                  year_end: {
                    type: "string",
                    description: "End year for results"
                  },
                  page: {
                    type: "number",
                    description: "Page number for pagination"
                  }
                },
                required: ["q"]
              }
            },
            {
              name: "nasa_exoplanet",
              description: "NASA Exoplanet Archive - data about planets beyond our solar system",
              inputSchema: {
                type: "object",
                properties: {
                  table: {
                    type: "string",
                    description: "Database table to query"
                  },
                  select: {
                    type: "string",
                    description: "Columns to return"
                  },
                  where: {
                    type: "string",
                    description: "Filter conditions"
                  },
                  order: {
                    type: "string",
                    description: "Ordering of results"
                  },
                  limit: {
                    type: "number",
                    description: "Maximum number of results"
                  }
                },
                required: ["table"]
              }
            },
            {
              name: "nasa_donki",
              description: "Space Weather Database Of Notifications, Knowledge, Information",
              inputSchema: {
                type: "object",
                properties: {
                  type: {
                    type: "string",
                    description: "Type of space weather event"
                  },
                  startDate: {
                    type: "string",
                    description: "Start date (YYYY-MM-DD)"
                  },
                  endDate: {
                    type: "string",
                    description: "End date (YYYY-MM-DD)"
                  }
                },
                required: ["type"]
              }
            },
            {
              name: "nasa_mars_rover",
              description: "NASA Mars Rover Photos - images from Mars rovers",
              inputSchema: {
                type: "object",
                properties: {
                  rover: {
                    type: "string",
                    description: "Name of the rover (curiosity, opportunity, spirit, perseverance)"
                  },
                  sol: {
                    type: "number",
                    description: "Martian sol (day) of the photos"
                  },
                  earth_date: {
                    type: "string",
                    description: "Earth date of the photos (YYYY-MM-DD)"
                  },
                  camera: {
                    type: "string",
                    description: "Camera name"
                  },
                  page: {
                    type: "number",
                    description: "Page number for pagination"
                  }
                },
                required: ["rover"]
              }
            },
            {
              name: "nasa_eonet",
              description: "Earth Observatory Natural Event Tracker - natural events data",
              inputSchema: {
                type: "object",
                properties: {
                  category: {
                    type: "string",
                    description: "Event category (wildfires, volcanoes, etc.)"
                  },
                  days: {
                    type: "number",
                    description: "Number of days to look back"
                  },
                  source: {
                    type: "string",
                    description: "Data source"
                  },
                  status: {
                    type: "string",
                    description: "Event status (open, closed)"
                  },
                  limit: {
                    type: "number",
                    description: "Maximum number of events to return"
                  }
                }
              }
            },
            {
              name: "nasa_power",
              description: "Prediction of Worldwide Energy Resources - meteorological data",
              inputSchema: {
                type: "object",
                properties: {
                  parameters: {
                    type: "string",
                    description: "Comma-separated data parameters"
                  },
                  community: {
                    type: "string",
                    description: "User community (RE, SB, AG, etc.)"
                  },
                  longitude: {
                    type: "number",
                    description: "Longitude coordinate"
                  },
                  latitude: {
                    type: "number",
                    description: "Latitude coordinate"
                  },
                  start: {
                    type: "string",
                    description: "Start date (YYYYMMDD)"
                  },
                  end: {
                    type: "string",
                    description: "End date (YYYYMMDD)"
                  },
                  format: {
                    type: "string",
                    description: "Response format (json, csv, etc.)"
                  }
                },
                required: ["parameters", "community", "longitude", "latitude", "start", "end"]
              }
            },
            {
              name: "jpl_sbdb",
              description: "Small-Body Database (SBDB) - asteroid and comet data",
              inputSchema: {
                type: "object",
                properties: {
                  sstr: {
                    type: "string",
                    description: "Search string (e.g., asteroid name, number, or designation)"
                  },
                  cad: {
                    type: "boolean",
                    description: "Include close approach data"
                  }
                },
                required: ["sstr"]
              }
            },
            {
              name: "jpl_fireball",
              description: "Fireball data - atmospheric impact events",
              inputSchema: {
                type: "object",
                properties: {
                  limit: {
                    type: "number",
                    description: "Maximum number of results to return"
                  },
                  "date_min": {
                    type: "string", 
                    description: "Start date (YYYY-MM-DD)"
                  },
                  "date_max": {
                    type: "string",
                    description: "End date (YYYY-MM-DD)"
                  }
                }
              }
            },
            {
              name: "jpl_jd_cal",
              description: "Julian Day number to/from calendar date/time converter",
              inputSchema: {
                type: "object",
                properties: {
                  jd: {
                    type: "string",
                    description: "Julian date to convert to calendar date"
                  },
                  cd: {
                    type: "string",
                    description: "Calendar date to convert to Julian date (YYYY-MM-DD or YYYY-MM-DDThh:mm:ss format)"
                  }
                }
              }
            },
            {
              name: "jpl_nhats",
              description: "Human-accessible NEOs (Near-Earth Objects) data",
              inputSchema: {
                type: "object",
                properties: {
                  dv: {
                    type: "number",
                    description: "Minimum total delta-V (km/s). Values: 4-12, default: 12"
                  },
                  dur: {
                    type: "number",
                    description: "Minimum total mission duration (days). Values: 60-450, default: 450"
                  },
                  stay: {
                    type: "number",
                    description: "Minimum stay time (days). Values: 8, 16, 24, 32, default: 8"
                  },
                  launch: {
                    type: "string",
                    description: "Launch window (year range). Values: 2020-2025, 2025-2030, 2030-2035, 2035-2040, 2040-2045, 2020-2045, default: 2020-2045"
                  },
                  h: {
                    type: "number",
                    description: "Object's maximum absolute magnitude (mag). Values: 16-30"
                  },
                  occ: {
                    type: "number",
                    description: "Object's maximum orbit condition code. Values: 0-8"
                  },
                  des: {
                    type: "string",
                    description: "Object designation (e.g., '2000 SG344' or '433')"
                  },
                  spk: {
                    type: "string",
                    description: "Object SPK-ID (e.g., '2000433')"
                  },
                  plot: {
                    type: "boolean",
                    description: "Include base-64 encoded plot image"
                  }
                }
              }
            },
            {
              name: "jpl_cad",
              description: "Asteroid and comet close approaches to the planets in the past and future",
              inputSchema: {
                type: "object",
                properties: {
                  "dist_max": {
                    type: "string",
                    description: "Maximum approach distance (e.g., 0.05, 10LD). Default: 0.05 au"
                  },
                  "dist_min": {
                    type: "string",
                    description: "Minimum approach distance. Default: none"
                  },
                  "date_min": {
                    type: "string",
                    description: "Start date for search (YYYY-MM-DD). Default: now"
                  },
                  "date_max": {
                    type: "string",
                    description: "End date for search (YYYY-MM-DD). Default: +60 days"
                  },
                  "body": {
                    type: "string",
                    description: "Body to find close approaches to (e.g., Earth, Mars, ALL). Default: Earth"
                  },
                  "sort": {
                    type: "string",
                    description: "Sort field: date, dist, dist-min, v-inf, v-rel, h, object. Default: date"
                  },
                  "des": {
                    type: "string",
                    description: "Object designation (e.g., '2000 SG344' or '433')"
                  },
                  "spk": {
                    type: "string",
                    description: "Object SPK-ID (e.g., '2000433')"
                  },
                  "neo": {
                    type: "boolean",
                    description: "Limit to NEOs. Default: true"
                  },
                  "fullname": {
                    type: "boolean",
                    description: "Include full object name in result. Default: false"
                  }
                }
              }
            },
            {
              name: "jpl_sentry",
              description: "JPL Sentry - NEO Earth impact risk assessment data",
              inputSchema: {
                type: "object",
                properties: {
                  limit: {
                    type: "number",
                    description: "Maximum number of results to return"
                  },
                  "date_min": {
                    type: "string",
                    description: "Start date (YYYY-MM-DD)"
                  },
                  "date_max": {
                    type: "string",
                    description: "End date (YYYY-MM-DD)"
                  },
                  "des": {
                    type: "string",
                    description: "Object designation (e.g., '2011 AG5' or '29075')"
                  },
                  "spk": {
                    type: "string",
                    description: "Object SPK-ID"
                  },
                  "h_max": {
                    type: "number",
                    description: "Maximum absolute magnitude (size filter)"
                  },
                  "ps_min": {
                    type: "string",
                    description: "Minimum Palermo Scale value"
                  },
                  "ip_min": {
                    type: "string",
                    description: "Minimum impact probability"
                  },
                  "removed": {
                    type: "boolean",
                    description: "Get objects removed from Sentry monitoring"
                  },
                  "all": {
                    type: "boolean",
                    description: "Get all virtual impactors data"
                  }
                }
              }
            },
            {
              name: "jpl_horizons",
              description: "JPL Horizons - Solar system objects ephemeris data",
              inputSchema: {
                type: "object",
                properties: {
                  format: {
                    type: "string",
                    description: "Response format (json, text)",
                    enum: ["json", "text"]
                  },
                  COMMAND: {
                    type: "string",
                    description: "Target object identifier (e.g., '499' for Mars, '1' for Ceres, 'C/2020 F3' for Comet NEOWISE)"
                  },
                  OBJ_DATA: {
                    type: "string",
                    description: "Include object data",
                    enum: ["YES", "NO"]
                  },
                  MAKE_EPHEM: {
                    type: "string",
                    description: "Generate ephemeris",
                    enum: ["YES", "NO"]
                  },
                  EPHEM_TYPE: {
                    type: "string",
                    description: "Type of ephemeris (OBSERVER, VECTORS, ELEMENTS)",
                    enum: ["OBSERVER", "VECTORS", "ELEMENTS"]
                  },
                  CENTER: {
                    type: "string",
                    description: "Coordinate center (e.g., '500@399' for Earth)"
                  },
                  START_TIME: {
                    type: "string",
                    description: "Start time for ephemeris (e.g., '2023-01-01')"
                  },
                  STOP_TIME: {
                    type: "string",
                    description: "Stop time for ephemeris (e.g., '2023-01-02')"
                  },
                  STEP_SIZE: {
                    type: "string",
                    description: "Step size for ephemeris points (e.g., '1d' for daily, '1h' for hourly)"
                  },
                  QUANTITIES: {
                    type: "string",
                    description: "Observable quantities to include (e.g., 'A' for all, or '1,2,20,23' for specific ones)"
                  },
                  OUT_UNITS: {
                    type: "string",
                    description: "Output units for vector tables",
                    enum: ["KM-S", "AU-D", "KM-D"]
                  }
                },
                required: ["COMMAND"]
              }
            },
            {
              name: "jpl_horizons_file",
              description: "JPL Horizons - Solar system objects ephemeris data (File Input)",
              inputSchema: {
                type: "object",
                properties: {
                  format: {
                    type: "string",
                    description: "Response format (json, text)",
                    enum: ["json", "text"]
                  },
                  COMMAND: {
                    type: "string",
                    description: "Target object identifier (e.g., '499' for Mars, '1' for Ceres, 'C/2020 F3' for Comet NEOWISE)"
                  },
                  OBJ_DATA: {
                    type: "string",
                    description: "Include object data",
                    enum: ["YES", "NO"]
                  },
                  MAKE_EPHEM: {
                    type: "string",
                    description: "Generate ephemeris",
                    enum: ["YES", "NO"]
                  },
                  EPHEM_TYPE: {
                    type: "string",
                    description: "Type of ephemeris (OBSERVER, VECTORS, ELEMENTS)",
                    enum: ["OBSERVER", "VECTORS", "ELEMENTS"]
                  },
                  CENTER: {
                    type: "string",
                    description: "Coordinate center (e.g., '500@399' for Earth)"
                  },
                  START_TIME: {
                    type: "string",
                    description: "Start time for ephemeris (e.g., '2023-01-01')"
                  },
                  STOP_TIME: {
                    type: "string",
                    description: "Stop time for ephemeris (e.g., '2023-01-02')"
                  },
                  STEP_SIZE: {
                    type: "string",
                    description: "Step size for ephemeris points (e.g., '1d' for daily, '1h' for hourly)"
                  },
                  QUANTITIES: {
                    type: "string",
                    description: "Observable quantities to include (e.g., 'A' for all, or '1,2,20,23' for specific ones)"
                  },
                  OUT_UNITS: {
                    type: "string",
                    description: "Output units for vector tables",
                    enum: ["KM-S", "AU-D", "KM-D"]
                  }
                },
                required: ["COMMAND"]
              }
            },
            {
              name: "jpl_periodic_orbits",
              description: "JPL Three-Body Periodic Orbits Database",
              inputSchema: {
                type: "object",
                properties: {
                  sys: {
                    type: "string",
                    description: "Three-body system (e.g., earth-moon, sun-earth)"
                  },
                  family: {
                    type: "string",
                    description: "Orbit family name (e.g., halo, dro, lyapunov)"
                  },
                  libr: {
                    type: "integer",
                    description: "Libration point (1-5, required for some families)"
                  },
                  branch: {
                    type: "string",
                    description: "Branch within family (N/S, E/W, etc., required for some families)"
                  },
                  periodmin: { type: "number", description: "Minimum period" },
                  periodmax: { type: "number", description: "Maximum period" },
                  periodunits: { type: "string", description: "Units for period (s, h, d, TU)", enum: ["s", "h", "d", "TU"] },
                  jacobimin: { type: "number", description: "Minimum Jacobi constant" },
                  jacobimax: { type: "number", description: "Maximum Jacobi constant" },
                  stabmin: { type: "number", description: "Minimum stability index" },
                  stabmax: { type: "number", description: "Maximum stability index" }
                },
                required: ["sys", "family"]
              }
            },
            {
              name: "nasa_osdr_files",
              description: "NASA OSDR - Get data files for an OSD study",
              inputSchema: {
                type: "object",
                properties: {
                  accession_number: {
                    type: "string",
                    description: "OSD study accession number (e.g., '87')"
                  }
                },
                required: ["accession_number"]
              }
            },
            {
              name: "jpl_scout",
              description: "Scout - NEOCP orbits, ephemerides, and impact risk data",
              inputSchema: {
                type: "object",
                properties: {
                  tdes: {
                    type: "string",
                    description: "Object temporary designation (e.g., P21Eolo)"
                  },
                  orbit_id: {
                    type: "string",
                    description: "Scout internal orbit ID"
                  },
                  limit: {
                    type: "number",
                    description: "Limit number of results"
                  },
                  file: {
                    type: "string",
                    description: "Type of data file to return (summary, ephem, obs, crit, all)",
                    enum: ["summary", "ephem", "obs", "crit", "all"]
                  },
                  plot: {
                    type: "boolean",
                    description: "Include plots in the response"
                  },
                  summary: {
                    type: "boolean",
                    description: "Include summary data in the response"
                  }
                },
                // No required fields explicitly listed, as API might default to list
              }
            },
            // {
            //   name: "nasa_earth",
            //   description: "Earth - Landsat satellite imagery",
            //   inputSchema: {
            //     type: "object",
            //     properties: {
            //       lon: {
            //         type: "number",
            //         description: "Longitude of the imagery location"
            //       },
            //       lat: {
            //         type: "number",
            //         description: "Latitude of the imagery location"
            //       },
            //       date: {
            //         type: "string",
            //         description: "Date of imagery (YYYY-MM-DD format). If not specified, most recent imagery is used"
            //       },
            //       dim: {
            //         type: "number",
            //         description: "Width and height of image in degrees (0.025 to 0.5)"
            //       },
            //       cloud_score: {
            //         type: "boolean",
            //         description: "Calculate the percentage of the image covered by clouds"
            //       }
            //     },
            //     required: ["lon", "lat"]
            //   }
            // }
          ]
        };
      }
    );
    
    // Add prompts/list endpoint 
    server.setRequestHandler(
      z.object({
        method: z.literal("prompts/list"),
        params: z.object({}).optional()
      }),
      async () => {
        return {
          prompts: allPrompts
        };
      }
    );
    
    // Add direct handlers for each NASA API
    // APOD Handler
    server.setRequestHandler(
      z.object({ 
        method: z.literal("nasa/apod"),
        params: z.object({
          date: z.string().optional(),
          start_date: z.string().optional(),
          end_date: z.string().optional(),
          count: z.number().optional(),
          thumbs: z.boolean().optional()
        }).optional()
      }),
      async (request) => {
        return await handleToolCall("nasa/apod", request.params || {});
      }
    );
    
    // NEO Handler
    server.setRequestHandler(
      z.object({ 
        method: z.literal("nasa/neo"),
        params: z.object({
          start_date: z.string().optional(),
          end_date: z.string().optional(),
          asteroid_id: z.string().optional()
        }).optional()
      }),
      async (request) => {
        return await handleToolCall("nasa/neo", request.params || {});
      }
    );
    
    // EPIC Handler
    server.setRequestHandler(
      z.object({ 
        method: z.literal("nasa/epic"),
        params: z.object({
          collection: z.string().optional(),
          date: z.string().optional()
        }).optional()
      }),
      async (request) => {
        return await handleToolCall("nasa/epic", request.params || {});
      }
    );
    
    // Mars Rover Handler
    server.setRequestHandler(
      z.object({ 
        method: z.literal("nasa/mars-rover"),
        params: z.object({
          rover: z.enum(['curiosity', 'opportunity', 'perseverance', 'spirit']),
          sol: z.number().int().nonnegative().optional(),
          earth_date: z.string().optional(),
          camera: z.string().optional(),
          page: z.number().int().positive().optional()
        }).optional()
      }),
      async (request) => {
        return await handleToolCall("nasa/mars-rover", request.params || {});
      }
    );
    
    // GIBS Handler
    server.setRequestHandler(
      z.object({ 
        method: z.literal("nasa/gibs"),
        params: z.object({
          layer: z.string(),
          date: z.string(),
          format: z.enum(['png', 'jpg', 'jpeg']).optional(),
          resolution: z.number().optional()
        }).optional()
      }),
      async (request) => {
        return await handleToolCall("nasa/gibs", request.params || {});
      }
    );
    
    // CMR Handler
    server.setRequestHandler(
      z.object({ 
        method: z.literal("nasa/cmr"),
        params: z.object({
          keyword: z.string().optional(),
          search_type: z.enum(['collections', 'granules']).optional(),
          format: z.enum(['json', 'umm_json', 'atom', 'echo10', 'iso19115', 'iso_smap', 'kml']).optional(),
          limit: z.number().optional(),
          page: z.number().optional(),
          sort_key: z.string().optional()
        }).passthrough().optional()
      }),
      async (request) => {
        return await handleToolCall("nasa/cmr", request.params || {});
      }
    );
    
    // FIRMS Handler
    server.setRequestHandler(
      z.object({ 
        method: z.literal("nasa/firms"),
        params: z.object({
          days: z.number().optional(),
          latitude: z.number().optional(),
          longitude: z.number().optional()
        }).optional()
      }),
      async (request) => {
        return await handleToolCall("nasa/firms", request.params || {});
      }
    );
    
    // Images Handler
    server.setRequestHandler(
      z.object({ 
        method: z.literal("nasa/images"),
        params: z.object({
          q: z.string(),
          page: z.number().optional(),
          media_type: z.string().optional(),
          year_start: z.string().optional(),
          year_end: z.string().optional()
        }).optional()
      }),
      async (request) => {
        return await handleToolCall("nasa/images", request.params || {});
      }
    );
    
    // Exoplanet Handler
    server.setRequestHandler(
      z.object({ 
        method: z.literal("nasa/exoplanet"),
        params: z.object({
          table: z.string().optional(),
          select: z.string().optional(),
          where: z.string().optional(),
          order: z.string().optional(),
          limit: z.number().optional()
        }).optional()
      }),
      async (request) => {
        return await handleToolCall("nasa/exoplanet", request.params || {});
      }
    );
    
    // DONKI Handler
    server.setRequestHandler(
      z.object({ 
        method: z.literal("nasa/donki"),
        params: z.object({
          type: z.string(),
          startDate: z.string().optional(),
          endDate: z.string().optional()
        }).optional()
      }),
      async (request) => {
        return await handleToolCall("nasa/donki", request.params || {});
      }
    );
    
    // EONET Handler
    server.setRequestHandler(
      z.object({ 
        method: z.literal("nasa/eonet"),
        params: z.object({
          category: z.string().optional(),
          days: z.number().optional(),
          source: z.string().optional(),
          status: z.string().optional(),
          limit: z.number().optional()
        }).optional()
      }),
      async (request) => {
        return await handleToolCall("nasa/eonet", request.params || {});
      }
    );
    
    // POWER Handler
    server.setRequestHandler(
      z.object({ 
        method: z.literal("nasa/power"),
        params: z.object({
          community: z.string(),
          parameters: z.union([z.string(), z.array(z.string())]),
          latitude: z.number(),
          longitude: z.number(),
          start: z.string(),
          end: z.string(),
          format: z.string().optional()
        }).optional()
      }),
      async (request) => {
        return await handleToolCall("nasa/power", request.params || {});
      }
    );
    
    // Earth Handler - COMMENTED OUT: NASA Earth API is archived and replaced with GIBS
    // server.setRequestHandler(
    //   z.object({ 
    //     method: z.literal("nasa/earth"),
    //     params: z.object({
    //       lon: z.number().or(z.string().regex(/^-?\d+(\.\d+)?$/).transform(Number)),
    //       lat: z.number().or(z.string().regex(/^-?\d+(\.\d+)?$/).transform(Number)),
    //       date: z.string().optional(),
    //       dim: z.number().optional(),
    //       cloud_score: z.boolean().optional()
    //     }).optional()
    //   }),
    //   async (request) => {
    //     return await handleToolCall("nasa/earth", request.params || {});
    //   }
    // );
    
    // Scout Handler
    server.setRequestHandler(
      z.object({ 
        method: z.literal("jpl/scout"),
        params: z.object({
          tdes: z.string().optional(),
          orbit_id: z.string().optional(),
          limit: z.number().int().positive().optional(),
          file: z.enum(['summary', 'ephem', 'obs', 'crit', 'all']).optional(),
          plot: z.boolean().optional(),
          summary: z.boolean().optional()
        }).optional()
      }),
      async (request) => {
        return await handleToolCall("jpl/scout", request.params || {});
      }
    );
    
    // Add CallToolRequestSchema handler (required for MCP compliance)
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const toolName = request.params.name;
      const args = request.params.arguments ?? {};
      
      // Call the tool handler function
      return await handleToolCall(toolName, args);
    });
    
    // Add handlers for prompts
    server.setRequestHandler(
      z.object({
        method: z.literal("prompts/execute"),
        params: z.object({
          name: z.string(),
          arguments: z.record(z.string(), z.any()).optional()
        })
      }),
      async (request) => {
        return await handlePrompt(request.params.name, request.params.arguments || {});
      }
    );
    
    // Set up all handlers from the handler setup module
    setupHandlers(server);
    
    // Register the resource templates list handler
    server.setRequestHandler(
      z.object({ 
        method: z.literal("resources/templates/list"),
        params: z.object({}).optional()
      }),
      async () => {
        return {
          resourceTemplates: resourceTemplates
        };
      }
    );
    
    // Add a new MCP-compatible prompt for Astronomy Picture of the Day
    server.setRequestHandler(
      z.object({
        method: z.literal("prompts/get"),
        params: z.object({
          name: z.literal("apod-daily"),
          arguments: apodParamsSchema.partial().optional()
        })
      }),
      async (request) => {
        const params = request.params.arguments || {};
        return {
          messages: [{
            role: "user",
            content: {
              type: "text",
              text: `Show me the NASA Astronomy Picture of the Day${params.date ? ` for ${params.date}` : ''}${params.count ? ` (${params.count} random images)` : ''}${params.start_date && params.end_date ? ` from ${params.start_date} to ${params.end_date}` : ''}.`
            }
          }]
        };
      }
    );
    
    // Use stdio transport for this main server
    const stdioTransport = new StdioServerTransport();
    await server.connect(stdioTransport);
    
    serverInstance?.sendLoggingMessage({
      level: "info",
      data: "Server started with stdio transport",
    });
  } catch (error) {
    console.error("Error starting server:", error);
    process.exit(1);
  }
}

// Add a function to handle prompts
async function handlePrompt(promptName: string, args: Record<string, any>) {
  try {
    serverInstance?.sendLoggingMessage({
      level: "info",
      data: `Handling prompt: ${promptName} with args: ${JSON.stringify(args)}`,
    });
    
    // Map the prompt name to the appropriate tool call
    const promptToToolMap: Record<string, string> = {
      "nasa/get-astronomy-picture": "nasa/apod",
      "nasa/browse-near-earth-objects": "nasa/neo",
      "nasa/view-epic-imagery": "nasa/epic",
      "jpl/query-small-body-database": "jpl/sbdb",
      "jpl/find-close-approaches": "jpl/cad",
      "jpl/get-fireball-data": "jpl/fireball"
    };
    
    const toolName = promptToToolMap[promptName];
    
    if (!toolName) {
      throw new Error(`Unknown prompt: ${promptName}`);
    }
    
    // Validate the arguments based on the prompt definition
    const prompt = allPrompts.find(p => p.name === promptName);
    
    if (!prompt) {
      throw new Error(`Prompt definition not found: ${promptName}`);
    }
    
    // Check required arguments
    const missingArgs = prompt.arguments
      ?.filter(arg => arg.required && !args[arg.name])
      .map(arg => arg.name);
    
    if (missingArgs && missingArgs.length > 0) {
      throw new Error(`Missing required arguments: ${missingArgs.join(', ')}`);
    }
    
    // Execute the corresponding tool
    return await handleToolCall(toolName, args);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{
        type: "text",
        text: `Error executing prompt '${promptName}': ${errorMessage}`
      }],
      isError: true
    };
  }
}

// Add a function to handle tool calls
async function handleToolCall(toolName: string, args: Record<string, any>) {
  try {
    // Convert toolName format (e.g., nasa_neo -> nasa/neo)
    const internalToolId = toolName.replace('_', '/');

    serverInstance?.sendLoggingMessage({
      level: "info",
      data: `Handling tool call for: ${toolName} (Internal ID: ${internalToolId}) with args: ${JSON.stringify(args)}`,
    });

    // Use internalToolId for routing logic
    if (internalToolId.startsWith("nasa/")) {
      // Extract the NASA API endpoint name
      const endpoint = internalToolId.split("/")[1];
      const normalizedEndpoint = endpoint.replace(/-/g, '_'); // Normalize dashes for handler lookup if needed

      // Log endpoint for debugging
      serverInstance?.sendLoggingMessage({
        level: "info",
        data: `NASA Endpoint: ${endpoint} (Normalized: ${normalizedEndpoint})`,
      });

      try {
        // Dynamic import for NASA handlers using the original slash format path
        const handlerModule = await import(`./handlers/nasa/${endpoint}.js`);
        serverInstance?.sendLoggingMessage({
          level: "info",
          data: `Successfully imported handler module for: ./handlers/nasa/${endpoint}.js`,
        });

        // Try different potential handler function names
        const handlerFunctionName = `nasa${endpoint.charAt(0).toUpperCase() + endpoint.slice(1).replace(/-/g, '_')}Handler`; // e.g. nasaMars_roverHandler
        const simpleHandlerName = `${endpoint.replace(/-/g, '_')}Handler`; // e.g. mars_roverHandler

        const handlerFunction = handlerModule.default || 
                               handlerModule[handlerFunctionName] || 
                               handlerModule[simpleHandlerName];

        if (typeof handlerFunction === 'function') {
          serverInstance?.sendLoggingMessage({
            level: "info",
            data: `Executing handler function for ${endpoint}`,
          });
          return await handlerFunction(args);
        } else {
          serverInstance?.sendLoggingMessage({
            level: "info",
            data: `No handler function found in module: ${JSON.stringify(Object.keys(handlerModule))}`,
          });
          throw new Error(`No handler function found for NASA endpoint: ${normalizedEndpoint}`);
        }
      } catch (importError) {
        throw new Error(`Failed to import handler for NASA endpoint: ${normalizedEndpoint}. Error: ${importError instanceof Error ? importError.message : String(importError)}`);
      }
    } else if (internalToolId.startsWith("jpl/")) {
      // Extract the JPL API endpoint name
      const endpoint = internalToolId.split("/")[1];
      serverInstance?.sendLoggingMessage({
        level: "info",
        data: `JPL Endpoint: ${endpoint}`,
      });
      
      try {
        // Dynamic import for JPL handlers using the original slash format path
        serverInstance?.sendLoggingMessage({
          level: "info",
          data: `Importing handler module: ./handlers/jpl/${endpoint}.js`,
        });
        const handlerModule = await import(`./handlers/jpl/${endpoint}.js`);
        
        // Try to find the handler function in various export formats
        const handlerFunction = handlerModule.default || 
                               handlerModule[`jpl${endpoint.charAt(0).toUpperCase() + endpoint.slice(1)}Handler`] ||
                               handlerModule[`${endpoint}Handler`];
        
        if (typeof handlerFunction === 'function') {
          return await handlerFunction(args);
        } else {
          throw new Error(`Handler for ${endpoint} not found in module`);
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [{
            type: "text",
            text: `Error executing JPL tool '${toolName}': ${errorMessage}`
          }],
          isError: true
        };
      }
    }
    
    return {
      content: [{
        type: "text",
        text: `Unknown tool: ${toolName}`
      }],
      isError: true
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{
        type: "text",
        text: `Error executing tool '${toolName}': ${errorMessage}`
      }],
      isError: true
    };
  }
}

// Utility function to add a resource (can be used by handlers to store results)
export function addResource(uri: string, resource: Resource) {
  addResourceCore(uri, resource);
  
  // Send notification about resource change if server is initialized
  if (serverInstance) {
    serverInstance.notification({
      method: "notifications/resources/list_changed"
    });
  }
}

// Start the server
startServer().catch(error => {
  console.error("Error starting NASA MCP Server:", error);
  process.exit(1);
});

// Handle stdin close for graceful shutdown
process.stdin.on("close", () => {
  serverInstance?.sendLoggingMessage({
    level: "info",
    data: "NASA MCP Server shutting down...",
  });
  if (serverInstance) {
    serverInstance.close();
  }
  setTimeout(() => {
    process.exit(0);
  }, 100);
});

// Helper function to register MCP tools
export function registerMcpTools() {
  try {
    // Define a type for MCP tool handler functions
    type McpToolHandler = (args: Record<string, any>) => Promise<any>;

    // Define a typesafe way to assign to global
    function registerGlobalTool(name: string, handler: McpToolHandler): void {
      (global as any)[name] = handler;
    }
    
    // Register each NASA API as an MCP tool
    registerGlobalTool('mcp__nasaapod', async (args: Record<string, any>) => {
      serverInstance?.sendLoggingMessage({
        level: "info",
        data: `MCP NASA APOD called with args: ${JSON.stringify(args)}`,
      });
      return await handleToolCall('nasa/apod', args);
    });

    registerGlobalTool('mcp__nasaneo', async (args: Record<string, any>) => {
      serverInstance?.sendLoggingMessage({
        level: "info",
        data: `MCP NASA NEO called with args: ${JSON.stringify(args)}`,
      });
      return await handleToolCall('nasa/neo', args);
    });

    registerGlobalTool('mcp__nasaepic', async (args: Record<string, any>) => {
      serverInstance?.sendLoggingMessage({
        level: "info",
        data: `MCP NASA EPIC called with args: ${JSON.stringify(args)}`,
      });
      return await handleToolCall('nasa/epic', args);
    });

    registerGlobalTool('mcp__nasagibs', async (args: Record<string, any>) => {
      serverInstance?.sendLoggingMessage({
        level: "info",
        data: `MCP NASA GIBS called with args: ${JSON.stringify(args)}`,
      });
      return await handleToolCall('nasa/gibs', args);
    });

    registerGlobalTool('mcp__nasacmr', async (args: Record<string, any>) => {
      serverInstance?.sendLoggingMessage({
        level: "info",
        data: `MCP NASA CMR called with args: ${JSON.stringify(args)}`,
      });
      return await handleToolCall('nasa/cmr', args);
    });

    registerGlobalTool('mcp__nasafirms', async (args: Record<string, any>) => {
      serverInstance?.sendLoggingMessage({
        level: "info",
        data: `MCP NASA FIRMS called with args: ${JSON.stringify(args)}`,
      });
      return await handleToolCall('nasa/firms', args);
    });

    registerGlobalTool('mcp__nasaimages', async (args: Record<string, any>) => {
      serverInstance?.sendLoggingMessage({
        level: "info",
        data: `MCP NASA Images called with args: ${JSON.stringify(args)}`,
      });
      return await handleToolCall('nasa/images', args);
    });

    registerGlobalTool('mcp__nasaexoplanet', async (args: Record<string, any>) => {
      serverInstance?.sendLoggingMessage({
        level: "info",
        data: `MCP NASA Exoplanet called with args: ${JSON.stringify(args)}`,
      });
      return await handleToolCall('nasa/exoplanet', args);
    });

    registerGlobalTool('mcp__nasadonki', async (args: Record<string, any>) => {
      serverInstance?.sendLoggingMessage({
        level: "info",
        data: `MCP NASA DONKI called with args: ${JSON.stringify(args)}`,
      });
      return await handleToolCall('nasa/donki', args);
    });

    registerGlobalTool('mcp__nasamars_rover', async (args: Record<string, any>) => {
      serverInstance?.sendLoggingMessage({
        level: "info",
        data: `MCP NASA Mars Rover called with args: ${JSON.stringify(args)}`,
      });
      return await handleToolCall('nasa/mars-rover', args);
    });

    registerGlobalTool('mcp__nasaeonet', async (args: Record<string, any>) => {
      serverInstance?.sendLoggingMessage({
        level: "info",
        data: `MCP NASA EONET called with args: ${JSON.stringify(args)}`,
      });
      return await handleToolCall('nasa/eonet', args);
    });

    registerGlobalTool('mcp__nasapower', async (args: Record<string, any>) => {
      serverInstance?.sendLoggingMessage({
        level: "info",
        data: `MCP NASA POWER called with args: ${JSON.stringify(args)}`,
      });
      return await handleToolCall('nasa/power', args);
    });

    // Register JPL tools
    registerGlobalTool('mcp__jplsbdb', async (args: Record<string, any>) => {
      serverInstance?.sendLoggingMessage({
        level: "info",
        data: `MCP JPL SBDB called with args: ${JSON.stringify(args)}`,
      });
      return await handleToolCall('jpl/sbdb', args);
    });

    registerGlobalTool('mcp__jplfireball', async (args: Record<string, any>) => {
      serverInstance?.sendLoggingMessage({
        level: "info",
        data: `MCP JPL Fireball called with args: ${JSON.stringify(args)}`,
      });
      return await handleToolCall('jpl/fireball', args);
    });

    registerGlobalTool('mcp__jpljd_cal', async (args: Record<string, any>) => {
      serverInstance?.sendLoggingMessage({
        level: "info",
        data: `MCP JPL JD Calendar called with args: ${JSON.stringify(args)}`,
      });
      return await handleToolCall('jpl/jd_cal', args);
    });

    registerGlobalTool('mcp__jplnhats', async (args: Record<string, any>) => {
      serverInstance?.sendLoggingMessage({
        level: "info",
        data: `MCP JPL NHATS called with args: ${JSON.stringify(args)}`,
      });
      return await handleToolCall('jpl/nhats', args);
    });

    registerGlobalTool('mcp__jplcad', async (args: Record<string, any>) => {
      serverInstance?.sendLoggingMessage({
        level: "info",
        data: `MCP JPL CAD called with args: ${JSON.stringify(args)}`,
      });
      return await handleToolCall('jpl/cad', args);
    });

    registerGlobalTool('mcp__jplsentry', async (args: Record<string, any>) => {
      serverInstance?.sendLoggingMessage({
        level: "info",
        data: `MCP JPL Sentry called with args: ${JSON.stringify(args)}`,
      });
      return await handleToolCall('jpl/sentry', args);
    });

    registerGlobalTool('mcp__jplhorizons', async (args: Record<string, any>) => {
      serverInstance?.sendLoggingMessage({
        level: "info",
        data: `MCP JPL Horizons called with args: ${JSON.stringify(args)}`,
      });
      return await handleToolCall('jpl/horizons', args);
    });

    // Register Horizons File Tool
    registerGlobalTool('mcp__jplhorizons_file', async (args: Record<string, any>) => {
      serverInstance?.sendLoggingMessage({
        level: "info",
        data: `MCP JPL Horizons File called with args: ${JSON.stringify(args)}`,
      });
      return await handleToolCall('jpl/horizons_file', args);
    });

    // Register Periodic Orbits Tool
    registerGlobalTool('mcp__jplperiodic_orbits', async (args: Record<string, any>) => {
      serverInstance?.sendLoggingMessage({
        level: "info",
        data: `MCP JPL Periodic Orbits called with args: ${JSON.stringify(args)}`,
      });
      return await handleToolCall('jpl/periodic_orbits', args);
    });

    // Register Earth tool - COMMENTED OUT: NASA Earth API is archived and replaced with GIBS
    // registerGlobalTool('mcp__nasaearth', async (args: Record<string, any>) => {
    //   serverInstance?.sendLoggingMessage({
    //     level: "info",
    //     data: `MCP NASA Earth called with args: ${JSON.stringify(args)}`,
    //   });
    //   return await handleToolCall('nasa/earth', args);
    // });

    // Register Scout tool
    registerGlobalTool('mcp__jplscout', async (args: Record<string, any>) => {
      serverInstance?.sendLoggingMessage({
        level: "info",
        data: `MCP JPL Scout called with args: ${JSON.stringify(args)}`,
      });
      return await handleToolCall('jpl/scout', args);
    });

    serverInstance?.sendLoggingMessage({
      level: "info",
      data: "All NASA MCP tools registered",
    });
  } catch (error) {
    console.error('Error registering MCP tools:', error);
  }
}

// Call the registration function
registerMcpTools(); 