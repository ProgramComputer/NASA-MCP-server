import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import dotenv from "dotenv";
import { setupHandlers } from "./handlers/setup.js";
import { setupEnvironment } from "./utils/env-setup.js";
import { z } from "zod";
import { 
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from "@modelcontextprotocol/sdk/types.js";

// Load environment variables with enhanced setup
setupEnvironment();
// Also load with standard dotenv for compatibility
dotenv.config();

// Global state for resources
const resources = new Map<string, any>();
// Keep a reference to the server for notifications
let serverInstance: Server | null = null;

// Define resource templates for dynamic resource discovery
const resourceTemplates = [
  {
    name: "nasa-apod-image",
    description: "NASA Astronomy Picture of the Day",
    uriTemplate: "nasa://apod/image?date={date}",
    parameters: [
      {
        name: "date",
        description: "The date of the APOD image to retrieve (YYYY-MM-DD format)",
        required: false
      }
    ]
  },
  {
    name: "nasa-epic-image",
    description: "NASA EPIC Earth observation image",
    uriTemplate: "nasa://epic/image?date={date}&collection={collection}",
    parameters: [
      {
        name: "date",
        description: "Date of the image (YYYY-MM-DD format)",
        required: false
      },
      {
        name: "collection",
        description: "Image collection (natural or enhanced)",
        required: false
      }
    ]
  },
  {
    name: "jpl-asteroid-data",
    description: "JPL Small-Body Database entry",
    uriTemplate: "jpl://sbdb?object={object}",
    parameters: [
      {
        name: "object",
        description: "Asteroid or comet name/designation",
        required: true
      }
    ]
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
        name: "hd",
        description: "Whether to return the high definition image URL",
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
    name: "jpl/query-small-body-database",
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
    name: "jpl/find-close-approaches",
    description: "Find close approaches of asteroids and comets to Earth or other planets",
    arguments: [
      {
        name: "dist-max",
        description: "Maximum approach distance in lunar distances (LD)",
        required: false
      },
      {
        name: "date-min",
        description: "Start date for search (YYYY-MM-DD)",
        required: false
      },
      {
        name: "date-max",
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
    name: "jpl/get-fireball-data",
    description: "Retrieve data about fireballs detected by US Government sensors",
    arguments: [
      {
        name: "date-min",
        description: "Start date for fireball data (YYYY-MM-DD)",
        required: false
      },
      {
        name: "date-max", 
        description: "End date for fireball data (YYYY-MM-DD)",
        required: false
      },
      {
        name: "energy-min",
        description: "Minimum energy in kilotons of TNT",
        required: false
      }
    ]
  }
];

// Combine all prompts
const allPrompts = [...nasaPrompts, ...jplPrompts];

async function startServer() {
  try {
    // Initialize resources
    initializeResources();
    
    // Initialize MCP server with proper capabilities structure
    const server = new Server(
      {
        name: "NASA MCP Server",
        description: "Model Context Protocol server for NASA APIs",
        version: "1.0.0"
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
          }
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
              name: "NASA Astronomy Picture of the Day",
              id: "nasa/apod",
              description: "Fetch NASA's Astronomy Picture of the Day"
            },
            {
              name: "NASA Near Earth Object Web Service",
              id: "nasa/neo",
              description: "Information about asteroids and near-Earth objects"
            },
            {
              name: "NASA EPIC",
              id: "nasa/epic",
              description: "Earth Polychromatic Imaging Camera views of Earth"
            },
            {
              name: "NASA GIBS",
              id: "nasa/gibs",
              description: "Global Imagery Browse Services satellite imagery"
            }
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
        return {
          resources: Array.from(resources.entries()).map(([uri, resource]) => ({
            uri: uri,
            mimeType: resource.mimeType,
            name: resource.name
          }))
        };
      }
    );
    
    // Standard handler using the ListResourcesRequestSchema (may be an alternate way to call the same endpoint)
    server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: Array.from(resources.entries()).map(([uri, resource]) => ({
          uri: uri,
          mimeType: resource.mimeType,
          name: resource.name
        }))
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
              name: "nasa/apod",
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
                }
              }
            },
            {
              name: "nasa/neo",
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
                }
              }
            }
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
    
    // Use stdio transport for this main server
    const stdioTransport = new StdioServerTransport();
    await server.connect(stdioTransport);
    
    console.log("Server started with stdio transport");
  } catch (error) {
    console.error("Error starting server:", error);
    process.exit(1);
  }
}

// Add a function to handle prompts
async function handlePrompt(promptName: string, args: Record<string, any>) {
  console.log(`Handling prompt: ${promptName} with args:`, args);
  
  try {
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
  // This function will delegate to the appropriate handler based on the tool name
  console.log(`Handling tool call for: ${toolName} with args:`, args);
  
  if (toolName.startsWith("nasa/")) {
    // Extract the NASA API endpoint name
    const endpoint = toolName.split("/")[1];
    console.log(`NASA Endpoint: ${endpoint}`);
    
    try {
      // Dynamic import for all NASA handlers
      console.log(`Importing handler module: ./handlers/nasa/${endpoint}.js`);
      const handlerModule = await import(`./handlers/nasa/${endpoint}.js`);
      console.log("Handler module imported:", handlerModule);
      
      // Try to find the handler function in various export formats
      // 1. First check for a default export
      if (typeof handlerModule.default === 'function') {
        console.log("Found default export function, calling it");
        return await handlerModule.default(args);
      } 
      // 2. Check for a function named after the endpoint (e.g., 'apodHandler')
      else if (typeof handlerModule[`${endpoint}Handler`] === 'function') {
        console.log(`Found named export ${endpoint}Handler function, calling it`);
        return await handlerModule[`${endpoint}Handler`](args);
      } 
      // 3. Check for a function named with nasa prefix (e.g., 'nasaApodHandler')
      else if (typeof handlerModule[`nasa${endpoint.charAt(0).toUpperCase() + endpoint.slice(1)}Handler`] === 'function') {
        console.log(`Found named export nasa${endpoint.charAt(0).toUpperCase() + endpoint.slice(1)}Handler function, calling it`);
        return await handlerModule[`nasa${endpoint.charAt(0).toUpperCase() + endpoint.slice(1)}Handler`](args);
      }
      // No usable export found
      else {
        console.log("No handler function found in module:", handlerModule);
        throw new Error(`Handler for ${endpoint} does not have a usable export function`);
      }
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
  } else if (toolName.startsWith("jpl/")) {
    // Extract the JPL API endpoint name
    const endpoint = toolName.split("/")[1];
    console.log(`JPL Endpoint: ${endpoint}`);
    
    try {
      // Dynamic import for JPL handlers
      console.log(`Importing handler module: ./handlers/jpl/${endpoint}.js`);
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
}

// Utility function to add a resource (can be used by handlers to store results)
export function addResource(uri: string, resource: {
  name: string;
  mimeType: string;
  text?: string;
  blob?: string;
}) {
  resources.set(uri, resource);
  
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
  console.log("NASA MCP Server shutting down...");
  if (serverInstance) {
    serverInstance.close();
  }
  setTimeout(() => {
    process.exit(0);
  }, 100);
}); 