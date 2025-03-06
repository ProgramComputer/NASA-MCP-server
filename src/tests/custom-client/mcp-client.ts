import { spawn } from 'child_process';
import { rpcClient } from 'typed-rpc';

// Define the MCP service types based on NASA MCP API
interface NasaApiService {
  // Common API methods
  initialize(params: { capabilities: Record<string, any> }): Promise<{ capabilities: Record<string, any> }>;
  
  // Tool manifest method - to get available tools
  'tools/manifest': () => Promise<{
    apis: Array<{
      name: string;
      id: string;
      description: string;
    }>;
  }>;
  
  // NASA API methods
  'nasa/apod': (params: {
    date?: string;
    start_date?: string;
    end_date?: string;
    count?: number;
    thumbs?: boolean;
  }) => Promise<any>;
  
  'nasa/epic': (params: {
    collection?: 'natural' | 'enhanced';
    date?: string;
  }) => Promise<any>;
  
  'nasa/neo': (params: {
    start_date: string;
    end_date: string;
  }) => Promise<any>;
  
  // Add more NASA API methods as needed
}

export class McpTestClient {
  private serverProcess: any;
  private client: any;
  private serverPath: string;

  constructor(serverPath: string = 'dist/index.js') {
    this.serverPath = serverPath;
  }

  async connect(timeoutMs: number = 10000): Promise<void> {
    console.log(`Starting MCP server: ${this.serverPath}`);
    
    // Spawn the MCP server process
    this.serverProcess = spawn('node', [this.serverPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Create a custom transport that uses the child process stdio
    const self = this;
    const stdioTransport = {
      async transport(request: any): Promise<any> {
        return new Promise((resolve, reject) => {
          try {
            // Convert request to string and write to stdin
            const requestStr = JSON.stringify(request) + '\n';
            console.log(`Sending request: ${requestStr.trim()}`);
            self.serverProcess.stdin.write(requestStr);
            
            // Set up a timeout for the response
            const responseTimeout = setTimeout(() => {
              console.error(`Timeout waiting for response to request ID: ${request.id}`);
              self.serverProcess.stdout.removeListener('data', onData);
              reject(new Error(`Timeout waiting for response to request ID: ${request.id}`));
            }, 5000); // 5 second timeout
            
            // Set up one-time listener for response
            const onData = (data: Buffer) => {
              try {
                const responseStr = data.toString();
                console.log(`Raw response: ${responseStr.trim()}`);
                
                let response;
                try {
                  response = JSON.parse(responseStr);
                } catch (parseError) {
                  console.error('Failed to parse response JSON:', parseError);
                  console.error('Raw response was:', responseStr);
                  return; // Wait for more data or another response
                }
                
                // Check if this is the response for our request
                if (response.id === request.id) {
                  clearTimeout(responseTimeout);
                  self.serverProcess.stdout.removeListener('data', onData);
                  
                  // Check for JSON-RPC errors
                  if (response.error) {
                    console.error('RPC Error:', response.error);
                    reject(new Error(`RPC Error: ${JSON.stringify(response.error)}`));
                  } else {
                    resolve(response);
                  }
                } else {
                  console.log(`Received response for different request ID: ${response.id}, waiting for ${request.id}`);
                }
              } catch (e) {
                console.error('Error handling response:', e);
              }
            };
            
            self.serverProcess.stdout.on('data', onData);
          } catch (error) {
            console.error('Error in transport:', error);
            reject(error);
          }
        });
      }
    };

    // Create the RPC client with our custom transport
    this.client = rpcClient<NasaApiService>({
      transport: stdioTransport.transport
    });

    // Wait for server to be ready (without timeout)
    return new Promise((resolve, reject) => {
      // Track if we've received the ready message
      let isReady = false;

      // Check for ready message on stdout
      this.serverProcess.stdout.on('data', (data: Buffer) => {
        const output = data.toString();
        console.log('Server stdout:', output);
        if (!isReady && output.includes('ready on the stdio transport')) {
          isReady = true;
          console.log('MCP Server ready for testing');
          resolve();
        }
      });

      // Also check stderr for errors or alternate ready message
      this.serverProcess.stderr.on('data', (data: Buffer) => {
        const output = data.toString();
        console.log('Server stderr:', output);
        if (!isReady && output.includes('ready on the stdio transport')) {
          isReady = true;
          console.log('MCP Server ready for testing');
          resolve();
        }
      });

      // Also handle errors
      this.serverProcess.on('error', (error: Error) => {
        console.error('Error starting MCP server:', error);
        reject(error);
      });

      this.serverProcess.on('exit', (code: number) => {
        if (code !== 0 && !isReady) {
          console.error(`MCP server exited with code ${code}`);
          reject(new Error(`MCP server exited with code ${code}`));
        }
      });
    });
  }

  async initialize(): Promise<void> {
    const result = await this.client.initialize({
      capabilities: {
        resources: {},
        tools: {}
      }
    });
    console.log('Initialization complete:', result);
  }

  async getToolManifest(): Promise<any> {
    return await this.client['tools/manifest']();
  }

  async callNasaApod(params: { date?: string }): Promise<any> {
    return await this.client['nasa/apod'](params);
  }

  async callNasaEpic(params: { collection?: 'natural' | 'enhanced', date?: string }): Promise<any> {
    return await this.client['nasa/epic'](params);
  }

  async callNasaNeo(params: { start_date: string, end_date: string }): Promise<any> {
    return await this.client['nasa/neo'](params);
  }

  // Add more methods for other NASA APIs as needed

  async disconnect(): Promise<void> {
    if (this.serverProcess) {
      this.serverProcess.kill();
      console.log('Disconnected from MCP server');
    }
  }
}