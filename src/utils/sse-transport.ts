import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { Request, Response } from "express";

/**
 * Server-Sent Events (SSE) transport for MCP server
 * This implementation handles a single SSE connection
 */
export class SSEServerTransport implements Transport {
  private res: Response;
  private postMessagePath: string;
  private closed = false;
  
  // Transport interface properties
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  
  /**
   * Create a new SSE transport
   * @param postMessagePath The path where POST messages will be sent
   * @param res The Express response object for the SSE connection
   */
  constructor(postMessagePath: string, res: Response) {
    this.postMessagePath = postMessagePath;
    this.res = res;
    
    // Set up SSE headers - Note: These are now also set in the sseHandler
    this.res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no' // For NGINX proxies
    });
    
    // Send initial connection message as a comment to avoid parsing issues
    this.res.write(`: ${JSON.stringify({ type: 'connection', id: Date.now() })}\n\n`);
    
    // Handle client disconnect
    this.res.on('close', () => {
      this.closed = true;
      if (this.onclose) {
        this.onclose();
      }
    });
  }
  
  /**
   * Handle a POST message from the client
   */
  handlePostMessage(req: Request, res: Response): void {
    try {
      const message = req.body.message;
      
      if (!message || typeof message !== 'string') {
        res.status(400).json({ error: 'Invalid message format' });
        return;
      }
      
      try {
        // Parse the incoming message
        const parsedMessage = JSON.parse(message);
        
        // Strict validation for JSON-RPC 2.0
        if (parsedMessage.jsonrpc !== "2.0") {
          throw new Error("Message must have jsonrpc field set to '2.0'");
        }
        
        let jsonRpcMessage: JSONRPCMessage;
        
        // Check if it's a request or notification
        if (parsedMessage.method !== undefined) {
          if (typeof parsedMessage.method !== 'string') {
            throw new Error("Method must be a string");
          }
          
          // Create a request message (id is required in JSONRPCRequest)
          const requestMessage = {
            jsonrpc: "2.0" as const,
            id: typeof parsedMessage.id !== 'undefined' ? parsedMessage.id : Math.floor(Math.random() * 10000),
            method: parsedMessage.method,
            // Ensure params is an object if present
            params: typeof parsedMessage.params === 'object' ? parsedMessage.params : {}
          };
          
          jsonRpcMessage = requestMessage;
        }
        // Check if it's a response (has result or error)
        else if (parsedMessage.id !== undefined) {
          if (parsedMessage.result !== undefined) {
            // Success response
            const successResponse = {
              jsonrpc: "2.0" as const,
              id: parsedMessage.id,
              result: parsedMessage.result
            };
            jsonRpcMessage = successResponse;
          } else if (parsedMessage.error !== undefined) {
            if (typeof parsedMessage.error !== 'object') {
              throw new Error("Error must be an object");
            }
            
            // Error response
            const errorResponse = {
              jsonrpc: "2.0" as const,
              id: parsedMessage.id,
              error: {
                code: typeof parsedMessage.error.code === 'number' ? parsedMessage.error.code : -32603,
                message: typeof parsedMessage.error.message === 'string' ? parsedMessage.error.message : "Internal error",
                data: parsedMessage.error.data
              }
            };
            
            jsonRpcMessage = errorResponse;
          } else {
            throw new Error("Response must have either result or error");
          }
        } else {
          throw new Error("Invalid JSON-RPC message: must contain either method for requests or result/error for responses");
        }
        
        // Call the onmessage handler if available
        if (this.onmessage) {
          this.onmessage(jsonRpcMessage);
          res.status(200).json({ success: true });
        } else {
          res.status(503).json({ error: 'Message handler not initialized' });
        }
      } catch (error) {
        console.error('Error parsing or validating message:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        res.status(400).json({ 
          error: 'Invalid JSON-RPC format',
          details: errorMessage
        });
      }
    } catch (error) {
      console.error('Error handling message:', error);
      if (this.onerror) {
        this.onerror(new Error(`Error handling message: ${error}`));
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  }
  
  // Implement the Transport interface
  async start(): Promise<void> {
    // Connection is already established in the constructor
    return Promise.resolve();
  }
  
  async close(): Promise<void> {
    this.closed = true;
    try {
      this.res.end();
      if (this.onclose) {
        this.onclose();
      }
    } catch (error) {
      console.error('Error closing SSE connection:', error);
      if (this.onerror) {
        this.onerror(new Error(`Error closing SSE connection: ${error}`));
      }
    }
    return Promise.resolve();
  }
  
  async send(message: JSONRPCMessage): Promise<void> {
    if (this.closed) {
      if (this.onerror) {
        this.onerror(new Error('Cannot send message on closed connection'));
      }
      return;
    }
    
    try {
      // Strict validation for outgoing messages
      if (!message || typeof message !== 'object') {
        throw new Error('Invalid message format');
      }
      
      // Clone to avoid modifying the original
      const outgoingMessage = { ...message };
      
      // Always ensure jsonrpc is "2.0"
      outgoingMessage.jsonrpc = "2.0";
      
      // Convert message to string
      const messageStr = JSON.stringify(outgoingMessage);
      
      // Check if message has method property to determine event type
      // Cast to any to avoid TypeScript errors
      const msgAny = outgoingMessage as any;
      
      // Send the message as an SSE event with explicit event type
      // This helps clients to properly handle different types of messages
      if (msgAny.method && typeof msgAny.method === 'string' && msgAny.method.startsWith('tools/')) {
        this.res.write(`event: tools\ndata: ${messageStr}\n\n`);
      } else if (msgAny.method && typeof msgAny.method === 'string' && msgAny.method.startsWith('resources/')) {
        this.res.write(`event: resources\ndata: ${messageStr}\n\n`);
      } else {
        // Default data event
        this.res.write(`data: ${messageStr}\n\n`);
      }
    } catch (error) {
      console.error('Error sending SSE message:', error);
      if (this.onerror) {
        this.onerror(new Error(`Error sending SSE message: ${error}`));
      }
      
      // Mark as closed if we can't send
      this.closed = true;
    }
  }
} 