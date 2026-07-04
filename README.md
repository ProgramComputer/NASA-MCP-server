[![NPM Version](https://img.shields.io/npm/v/%40programcomputer%2Fnasa-mcp-server?link=https%3A%2F%2Fwww.npmjs.com%2Fpackage%2F%40programcomputer%2Fnasa-mcp-server)](https://www.npmjs.com/package/@programcomputer/nasa-mcp-server)

# NASA MCP Server

A Model Context Protocol (MCP) server for NASA APIs, providing a standardized interface for AI models to interact with NASA's vast array of data sources. This server implements the official Model Context Protocol specification.

Big thanks to the MCP community for their support and guidance!

## Features

* Access to 20+ NASA data sources through a single, consistent interface
* Standardized data formats optimized for AI consumption
* Automatic parameter validation and error handling
* Rate limit management for NASA API keys
* Comprehensive documentation and examples
* Support for various NASA imagery formats
* Data conversion and formatting for LLM compatibility
* Cross-platform support (Windows, macOS, Linux)

## Disclaimer

**This project is not affiliated with, endorsed by, or related to NASA (National Aeronautics and Space Administration) or any of its subsidiaries or its affiliates.** It is an independent implementation that accesses NASA's publicly available APIs. All NASA data used is publicly available and subject to NASA's data usage policies.

## Installation

### Running with npx

```bash
env NASA_API_KEY=YOUR_API_KEY npx -y @programcomputer/nasa-mcp-server@latest
```

You can also pass the API key as a command line argument:

```bash
npx -y @programcomputer/nasa-mcp-server@latest --nasa-api-key=YOUR_API_KEY
```

### Manual Installation

```bash
# Clone the repository
git clone https://github.com/ProgramComputer/NASA-MCP-server.git

# Install dependencies
cd NASA-MCP-server
npm install

# Run with your API key
NASA_API_KEY=YOUR_API_KEY npm start
```

### Running on Cursor

Configuring Cursor 🖥️ Note: Requires Cursor version 0.45.6+

To configure NASA MCP Server in Cursor:

Create or edit an `mcp.json` file in your Cursor configuration directory with the following content:

```json
{
  "mcpServers": {
    "nasa-mcp": {
      "command": "npx",
      "args": ["-y", "@programcomputer/nasa-mcp-server@latest"],
      "env": {
        "NASA_API_KEY": "your-api-key"
      }
    }
  }
}
```

Replace `your-api-key` with your NASA API key from https://api.nasa.gov/.

After adding the configuration, restart Cursor to see the new NASA tools. The Composer Agent will automatically use NASA MCP when appropriate for space-related queries.

## Environment Variables

The server can be configured with the following environment variables:

| Variable | Description |
|----------|-------------|
| `NASA_API_KEY` | Your NASA API key (get at api.nasa.gov) |
| `MCP_TRANSPORT` | Transport mode: `stdio` (default) or `http` for Streamable HTTP |
| `MCP_HTTP_HOST` | Host for Streamable HTTP mode (default: `127.0.0.1`) |
| `MCP_HTTP_PORT` | Port for Streamable HTTP mode (default: `3000`) |
| `MCP_HTTP_PATH` | MCP endpoint path for Streamable HTTP mode (default: `/mcp`) |

## Transport Modes

By default, the server runs over stdio for local MCP clients such as Cursor and Claude Desktop.

To run the optional Streamable HTTP transport:

```bash
MCP_TRANSPORT=http MCP_HTTP_PORT=3000 NASA_API_KEY=YOUR_API_KEY npm start
```

The Streamable HTTP endpoint will be available at:

```text
http://127.0.0.1:3000/mcp
```

## Included NASA APIs

This MCP server integrates the following NASA APIs:

1. **NASA Open API** (api.nasa.gov):
   - APOD (Astronomy Picture of the Day)
   - EPIC (Earth Polychromatic Imaging Camera)
   - DONKI (Space Weather Database Of Notifications, Knowledge, Information)
   - Insight (Mars Weather Service)
   - Mars Rover Photos
   - NEO (Near Earth Object Web Service)
   - EONET (Earth Observatory Natural Event Tracker)
   - TLE (Two-Line Element)
   - NASA Image and Video Library
   - Exoplanet Archive
   - NASA Sounds API (Beta)
   - POWER (Prediction Of Worldwide Energy Resources)

2. **JPL Solar System Dynamics API** (ssd-api.jpl.nasa.gov):
   - SBDB (Small-Body DataBase)
   - SBDB Close-Approach Data
   - Fireball Data
   - Scout API

3. **Earth Data APIs**:
   - GIBS (Global Imagery Browse Services)
   - CMR (Common Metadata Repository) - Enhanced with advanced search capabilities
   - EPIC (Earth Polychromatic Imaging Camera)
   - FIRMS (Fire Information for Resource Management System)

## API Methods

Each NASA API is exposed through standardized MCP methods:

### APOD (Astronomy Picture of the Day)

```json
{
  "method": "nasa/apod",
  "params": {
    "date": "2023-01-01", // Optional: YYYY-MM-DD format
    "count": 5, // Optional: Return a specified number of random images
    "thumbs": true // Optional: Return URL of video thumbnail
  }
}
```

### Mars Rover Photos

```json
{
  "method": "nasa/mars-rover",
  "params": {
    "rover": "curiosity", // Required: "curiosity", "opportunity", or "spirit"
    "sol": 1000, // Either sol or earth_date is required
    "earth_date": "2023-01-01", // YYYY-MM-DD format
    "camera": "FHAZ" // Optional: Filter by camera type
  }
}
```

### Near Earth Objects

```json
{
  "method": "nasa/neo",
  "params": {
    "start_date": "2023-01-01", // Required: YYYY-MM-DD format
    "end_date": "2023-01-07" // Required: YYYY-MM-DD format (max 7 days from start)
  }
}
```

### GIBS (Global Imagery Browse Services)

```json
{
  "method": "nasa/gibs",
  "params": {
    "layer": "MODIS_Terra_CorrectedReflectance_TrueColor", // Required: Layer ID
    "date": "2023-01-01", // Required: YYYY-MM-DD format
    "format": "png" // Optional: "png" or "jpg"
  }
}
```

### POWER (Prediction Of Worldwide Energy Resources)

```json
{
  "method": "nasa/power",
  "params": {
    "parameters": "T2M,PRECTOTCORR,WS10M", // Required: Comma-separated list
    "community": "re", // Required: Community identifier
    "latitude": 40.7128, // Required: Latitude
    "longitude": -74.0060, // Required: Longitude
    "start": "20220101", // Required: Start date (YYYYMMDD)
    "end": "20220107" // Required: End date (YYYYMMDD)
  }
}
```

For complete documentation of all available methods and parameters, see the API reference in the `/docs` directory.

## Logging System

The server includes comprehensive logging:

* Operation status and progress
* Performance metrics
* Rate limit tracking
* Error conditions
* Request validation

Example log messages:

```
[INFO] NASA MCP Server initialized successfully
[INFO] Processing APOD request for date: 2023-01-01
[INFO] Fetching Mars Rover data for Curiosity, sol 1000
[WARNING] Rate limit threshold reached (80%)
[ERROR] Invalid parameter: 'date' must be in YYYY-MM-DD format
```

## Security Considerations

This MCP server implements security best practices following the Model Context Protocol specifications:

* Input validation and sanitization using Zod schemas
* No execution of arbitrary code
* Protection against command injection
* Proper error handling to prevent information leakage
* Rate limiting and timeout controls for API requests
* No persistent state that could be exploited across sessions

## Development

```bash
# Clone the repository
git clone https://github.com/ProgramComputer/NASA-MCP-server.git

# Install dependencies
npm install

# Copy the example environment file and update with your API keys
cp .env.example .env

# Build the TypeScript code
npm run build

# Start the development server
npm run dev

# Run tests
npm test
```

## Testing with MCP Inspector

The NASA MCP Server includes a script to help you test the APIs using the MCP Inspector:

```bash
# Run the provided test script
./scripts/test-with-inspector.sh
```

This will:
1. Build the project to ensure the latest changes are included
2. Start the MCP Inspector with the NASA MCP server running
3. Allow you to interactively test all the NASA APIs

### Example Test Requests

The repository includes example test requests for each API that you can copy and paste into the MCP Inspector:

```bash
# View the example test requests
cat docs/inspector-test-examples.md
```

For detailed examples, see the [Inspector Test Examples](docs/inspector-test-examples.md) document.

## MCP Client Usage

This server follows the official Model Context Protocol. For local clients, use the default stdio configuration shown above. For Streamable HTTP mode, start the server with `MCP_TRANSPORT=http`, then connect with the MCP SDK:

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

const transport = new StreamableHTTPClientTransport(
  new URL("http://127.0.0.1:3000/mcp")
);

const client = new Client({
  name: "mcp-client",
  version: "1.0.0",
});

await client.connect(transport);

// Example: Get today's Astronomy Picture of the Day
const apodResult = await client.request({
  method: "tools/call",
  params: {
    name: "nasa/apod",
    arguments: {}
  }
}, CallToolResultSchema);

// Example: Get Mars Rover photos
const marsRoverResult = await client.request({
  method: "tools/call",
  params: {
    name: "nasa/mars-rover",
    arguments: { rover: "curiosity", sol: 1000 }
  }
}, CallToolResultSchema);

// Example: Search for Near Earth Objects
const neoResults = await client.request({
  method: "tools/call",
  params: {
    name: "nasa/neo",
    arguments: {
      start_date: "2023-01-01",
      end_date: "2023-01-07"
    }
  }
}, CallToolResultSchema);

// Example: Get satellite imagery from GIBS
const satelliteImage = await client.request({
  method: "tools/call",
  params: {
    name: "nasa/gibs",
    arguments: {
      layer: "MODIS_Terra_CorrectedReflectance_TrueColor",
      date: "2023-01-01"
    }
  }
}, CallToolResultSchema);

// Example: Use the new POWER API
const powerData = await client.request({
  method: "tools/call",
  params: {
    name: "nasa/power",
    arguments: {
      parameters: "T2M,PRECTOTCORR,WS10M",
      community: "re",
      latitude: 40.7128,
      longitude: -74.0060,
      start: "20220101",
      end: "20220107"
    }
  }
}, CallToolResultSchema);
```

## Contributing

1. Fork the repository
2. Create your feature branch
3. Run tests: `npm test`
4. Submit a pull request

## License

ISC License - see LICENSE file for details 
