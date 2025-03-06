import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "./utils/sse-transport.js";
import * as express from "express";
import * as cors from "cors";
import * as bodyParser from "body-parser";
import * as dotenv from "dotenv";
import { setupHandlers } from "./handlers/setup.js";
import { z } from "zod";
import * as path from "path";
import { CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// Load environment variables
dotenv.config();

// Create Express app
const app = express.default();

// Add middleware
app.use(cors.default());
app.use(bodyParser.default.json());

// Initialize MCP server
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
        list: []
      }
    }
  }
);

// Map to track active transports
const transports = new Map<string, SSEServerTransport>();

// Define route handlers first
const sseHandler = (req: express.Request, res: express.Response) => {
  try {
    console.log("SSE connection request received with query:", req.query);
    
    // Check if this is an MCP Inspector request
    // Accept both transport and transportType parameters for better compatibility
    const transportType = (req.query.transportType || req.query.transport) as string;
    if (!transportType) {
      throw new Error("Missing transport type parameter");
    }
    
    if (transportType === 'sse') {
      console.log("MCP Inspector connection detected");
      
      // Validate URL parameter which is required by the Inspector
      const url = req.query.url as string;
      if (!url) {
        throw new Error("Missing URL parameter");
      }
      
      try {
        // Validate URL format
        new URL(url);
      } catch (error) {
        throw new Error("Invalid URL parameter format");
      }
    }
    
    // Generate a unique ID for this connection
    const connectionId = Date.now().toString();
    console.log(`New SSE connection established: ${connectionId}`);
    
    // Set necessary SSE headers to prevent timeout and compression issues
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no' // For NGINX proxies
    });
    
    // Send initial connection message as a comment to avoid parsing issues
    res.write(`: ${JSON.stringify({ type: 'connection', id: connectionId })}\n\n`);
    
    // Create a new transport for this connection
    const transport = new SSEServerTransport("/messages", res);
    
    // Store the transport
    transports.set(connectionId, transport);
    
    // Connect the server to this transport
    server.connect(transport);
    
    // Set up a keepalive ping every 30 seconds to prevent timeout
    const pingInterval = setInterval(() => {
      if (transports.has(connectionId)) {
        // Send a ping as an SSE comment to prevent JSON parsing issues
        res.write(`: ping ${new Date().toISOString()}\n\n`);
      } else {
        clearInterval(pingInterval);
      }
    }, 30000);
    
    // When the connection closes, remove it from our map and clear the interval
    res.on('close', () => {
      console.log(`SSE connection closed: ${connectionId}`);
      transports.delete(connectionId);
      clearInterval(pingInterval);
    });
  } catch (error) {
    console.error("Error in /sse route:", error);
    
    // Return a more detailed error response
    if (!res.headersSent) {
      // Convert error to string with stack trace for debugging
      const errorMessage = error instanceof Error 
        ? `${error.message}\n${error.stack}` 
        : String(error);
      
      res.status(500).json({ 
        error: "Internal Server Error", 
        details: errorMessage,
        query: req.query 
      });
    } else {
      // If headers already sent, close the connection
      res.end();
    }
  }
};

const messageHandler = (req: express.Request, res: express.Response) => {
  try {
    console.log("Received message:", req.body);
    
    // Handle both raw messages and messages in the format { message: "..." }
    let messageContent = req.body;
    if (req.body && req.body.message) {
      messageContent = req.body.message;
    }
    
    // If message is a string, parse it
    if (typeof messageContent === 'string') {
      try {
        messageContent = JSON.parse(messageContent);
      } catch (err) {
        return res.status(400).json({
          jsonrpc: "2.0",
          error: {
            code: -32700,
            message: "Parse error",
            data: { details: "Invalid JSON" }
          },
          id: null
        });
      }
    }
    
    // Find an active transport to handle the message
    if (transports.size === 0) {
      return res.status(503).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "No active connections",
          data: { details: "No SSE connections available to handle the request" }
        },
        id: messageContent.id || null
      });
    }
    
    // For simplicity, use the first transport in the map
    const connectionId = Array.from(transports.keys())[0];
    const transport = transports.get(connectionId);
    
    if (transport) {
      // Log the incoming message
      console.log("Processing message:", JSON.stringify(messageContent));
      
      // Process the message as JSON-RPC
      if (transport.onmessage) {
        // Validate message is proper JSON-RPC
        if (!messageContent.jsonrpc || messageContent.jsonrpc !== "2.0") {
          messageContent.jsonrpc = "2.0";
        }
        
        // Make sure it has an ID
        if (!messageContent.id) {
          messageContent.id = Date.now();
        }
        
        // Make sure it has a method
        if (!messageContent.method) {
          return res.status(400).json({
            jsonrpc: "2.0",
            error: {
              code: -32600,
              message: "Invalid Request",
              data: { details: "Method is required" }
            },
            id: messageContent.id
          });
        }
        
        // Make sure params is an object if present
        if (messageContent.params && typeof messageContent.params !== 'object') {
          messageContent.params = {};
        }
        
        // Handle the message
        transport.onmessage(messageContent);
        
        // Return success response
        return res.status(200).json({
          jsonrpc: "2.0",
          result: { success: true },
          id: messageContent.id
        });
      } else {
        return res.status(503).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal error",
            data: { details: "Message handler not initialized" }
          },
          id: messageContent.id || null
        });
      }
    } else {
      return res.status(503).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "No active connections",
          data: { details: "No SSE connections available to handle the request" }
        },
        id: messageContent.id || null
      });
    }
  } catch (error) {
    console.error("Error in message handler:", error);
    return res.status(500).json({
      jsonrpc: "2.0",
      error: {
        code: -32603,
        message: "Internal error",
        data: { details: error instanceof Error ? error.message : String(error) }
      },
      id: null
    });
  }
};

// Now register the routes
(app as any).get("/sse", sseHandler);
(app as any).post("/messages", messageHandler);

// Serve the client HTML file
const CLIENT_HTML_PATH = path.join(process.cwd(), 'dist', 'utils', 'sse-client.html');
(app as any).get('/', (req: express.Request, res: express.Response) => {
  res.sendFile(CLIENT_HTML_PATH);
});

// Setup NASA API handlers
setupHandlers(server);

// Register standard MCP methods
// ... (Add your existing handlers here)

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SSE MCP Server running on http://localhost:${PORT}`);
  console.log(`- SSE endpoint: http://localhost:${PORT}/sse`);
  console.log(`- Message endpoint: http://localhost:${PORT}/messages`);
  console.log(`- Client UI: http://localhost:${PORT}/`);
}); 