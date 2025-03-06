import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { z } from "zod";

async function testNasaApis() {
  console.log('Starting NASA MCP API tests...');
  
  // Track successful tests
  const successfulTests: string[] = [];
  
  // Create a transport to communicate with the server
  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"]
  });
  
  // Create an MCP client
  const client = new Client(
    {
      name: "nasa-mcp-test-client",
      version: "1.0.0"
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );
  
  // Define schemas for validation
  const toolsManifestSchema = z.object({
    apis: z.array(z.object({
      name: z.string(),
      id: z.string(),
      description: z.string().optional()
    }))
  });
  
  const anySchema = z.any();
  
  try {
    // Connect to the server
    await client.connect(transport);
    console.log('Client connected successfully');
    
    // Get tools manifest
    const toolsRequest = await client.request(
      { method: "tools/manifest", params: {} },
      toolsManifestSchema
    );
    console.log('Tools manifest received:', JSON.stringify(toolsRequest, null, 2));
    
    // Test APOD API
    try {
      console.log('\nTesting NASA APOD API...');
      const apodResult = await client.request(
        { method: "nasa/apod", params: { date: "2023-01-01" } },
        anySchema
      );
      successfulTests.push('APOD');
      console.log(`APOD Result: ${(apodResult as any).title}`);
    } catch (error) {
      console.error('APOD test failed:', error);
    }
    
    // Test EPIC API
    try {
      console.log('\nTesting NASA EPIC API...');
      // Use a date we know has data from the documentation examples
      const epicResult = await client.request(
        { method: "nasa/epic", params: { collection: "natural", date: "2015-10-31" } },
        anySchema
      );
      successfulTests.push('EPIC');
      console.log(`EPIC Result: Retrieved ${(epicResult as any).length} images`);
    } catch (error) {
      console.error('EPIC test failed:', error);
    }
    
    // Test NEO API
    try {
      console.log('\nTesting NASA NEO API...');
      const neoResult = await client.request(
        { 
          method: "nasa/neo", 
          params: { 
            start_date: "2023-01-01", 
            end_date: "2023-01-07" 
          } 
        },
        anySchema
      );
      successfulTests.push('NEO');
      console.log(`NEO Result: Found ${(neoResult as any).element_count} near-Earth objects`);
    } catch (error) {
      console.error('NEO test failed:', error);
    }
    
    // Test Mars Rover Photos API
    try {
      console.log('\nTesting NASA Mars Rover Photos API...');
      const marsRoverResult = await client.request(
        { 
          method: "nasa/mars-rover", 
          params: { 
            rover: "curiosity", 
            sol: 1000 
          } 
        },
        anySchema
      );
      successfulTests.push('Mars Rover');
      console.log(`Mars Rover Result: Retrieved ${(marsRoverResult as any).photos?.length || 0} photos`);
    } catch (error) {
      console.error('Mars Rover test failed:', error);
    }
    
    // Test Exoplanet API
    try {
      console.log('\nTesting NASA Exoplanet API...');
      const exoplanetResult = await client.request(
        { 
          method: "nasa/exoplanet", 
          params: { 
            table: "ps", 
            // Simplified query with just table and limit
            limit: 10
          } 
        },
        anySchema
      );
      successfulTests.push('Exoplanet');
      console.log(`Exoplanet Result: Retrieved ${(exoplanetResult as any).results?.length || 0} exoplanets`);
    } catch (error) {
      console.error('Exoplanet test failed:', error);
    }
    
    // Test FIRMS API
    try {
      console.log('\nTesting NASA FIRMS API...');
      const firmsResult = await client.request(
        { 
          method: "nasa/firms", 
          params: { 
            latitude: 37.7749, // San Francisco
            longitude: -122.4194,
            radius: 5.0,
            days: 1
          } 
        },
        anySchema
      );
      successfulTests.push('FIRMS');
      console.log(`FIRMS Result: Retrieved ${(firmsResult as any).results?.length || 0} fire data points`);
    } catch (error) {
      console.error('FIRMS test failed:', error);
    }
    
    // Test Images Library API
    try {
      console.log('\nTesting NASA Images Library API...');
      const imagesResult = await client.request(
        { method: "nasa/images", params: { q: "moon landing" } },
        anySchema
      );
      successfulTests.push('Images');
      console.log(`Images Result: Retrieved ${(imagesResult as any).collection?.items?.length || 0} images`);
    } catch (error) {
      console.error('Images test failed:', error);
    }
    
    // Test EONET API
    try {
      console.log('\nTesting NASA EONET API...');
      const eonetResult = await client.request(
        { method: "nasa/eonet", params: { status: "all", limit: 10, days: 60 } },
        anySchema
      );
      successfulTests.push('EONET');
      console.log(`EONET Result: Retrieved ${(eonetResult as any).events?.length || 0} events`);
    } catch (error) {
      console.error('EONET test failed:', error);
    }
    
    // Summary of test results
    console.log('\n======= TEST SUMMARY =======');
    console.log(`Total APIs tested: ${successfulTests.length}`);
    console.log(`Successful tests: ${successfulTests.join(', ')}`);
    console.log('============================\n');
    
    console.log('All tests completed!');
    process.exit(0);
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testNasaApis().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
}); 