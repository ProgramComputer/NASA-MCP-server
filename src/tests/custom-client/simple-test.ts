import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { z } from "zod";

async function testMcpServer() {
  console.log('Starting NASA MCP Server test...');
  
  // Create a transport to communicate with the server
  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"]
  });
  
  // Create an MCP client
  const client = new Client(
    {
      name: "mcp-test-client",
      version: "1.0.0"
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );
  
  try {
    // Connect to the server
    await client.connect(transport);
    console.log('Client connected successfully');
    
    // Get tools manifest
    const toolsManifestSchema = z.object({
      apis: z.array(z.object({
        name: z.string(),
        id: z.string(),
        description: z.string().optional()
      }))
    });
    
    const toolsRequest = await client.request(
      { method: "tools/manifest", params: {} },
      toolsManifestSchema
    );
    console.log('Tools manifest received:', JSON.stringify(toolsRequest, null, 2));
    
    // Test APOD API
    console.log('Testing NASA APOD API...');
    const apodResultSchema = z.any();
    
    const apodResult = await client.request(
      { 
        method: "nasa/apod", 
        params: { date: "2023-01-01" } 
      },
      apodResultSchema
    );
    console.log('APOD API test successful:', JSON.stringify(apodResult, null, 2));
    
    console.log('All tests completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testMcpServer().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
}); 