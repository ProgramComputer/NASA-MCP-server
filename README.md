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

## Example prompts

Ask your MCP client things like:

* "Show me today's Astronomy Picture of the Day and explain what it shows."
* "Were there any solar storms in September 2026: strong flares, Earth-directed CMEs or geomagnetic storms?"
* "Which asteroids fly past Earth today, and which one comes closest?"
* "Will any asteroid pass closer to Earth than the Moon in the next 90 days?"
* "What are the odds that Bennu hits Earth, according to JPL Sentry?"
* "Find NASA photos of the Apollo 11 lunar module taken in 1969."
* "Which tropical storms and hurricanes are active right now?"
* "Show me a detailed satellite view of the Nile Delta and the Sinai on 2025-07-15."
* "Find cloud-hosted sea ice concentration datasets in NASA Earthdata."
* "What were the daily highs, lows and solar energy in Denver during the first week of July 2025?"
* "List the nearest roughly Earth-sized, temperate exoplanets discovered since 2020."
* "Where was the ISS over the Earth between 00:00 and 00:10 UTC on 2026-09-29?"
* "Get the latest two-line orbital elements for the ISS."
* "Show me a Mars Trek map tile of Olympus Mons."
* "What was the weather like at NASA's InSight lander during its last reported week on Mars?"
* "Which near-Earth asteroids need the least delta-v for a mission launched in 2030?"
* "Which NASA technology projects have worked on solar sails?"
* "Find NASA patents about solar panels that companies can license."

## Disclaimer

**This project is not affiliated with, endorsed by, or related to NASA (National Aeronautics and Space Administration) or any of its subsidiaries or its affiliates.** It is an independent implementation that accesses NASA's publicly available APIs. All NASA data used is publicly available and subject to NASA's data usage policies.

## Installation

You don't start an MCP server yourself. Your AI app (Claude, Cursor, VS Code, Codex and others) launches it in the background, so installing it means adding an entry to that app's MCP configuration. The only prerequisite is [Node.js](https://nodejs.org/) 22 or newer; `npx` downloads the server the first time the app starts it.

Most tools need no API key. `NASA_API_KEY` (free at <https://api.nasa.gov/>; `DEMO_KEY` works for light use) is only used by `nasa_neo`, `nasa_insight_weather` and `nasa_mars_rover`, and `FIRMS_MAP_KEY` only by `nasa_firms`. Leave out the `env` block if you don't need them.

**Using an AI coding agent (Claude Code, Codex, Cursor, VS Code agent mode)?** Paste this into it:

```text
Install the NASA MCP server from https://github.com/ProgramComputer/NASA-MCP-server
for the app you're running in. Follow that app's section under Installation in the
README, add it for all projects, and don't add an API key. Tell me exactly what you
changed and whether I need to restart.
```

### Standard config

Most clients use this JSON shape:

```json
{
  "mcpServers": {
    "nasa": {
      "command": "npx",
      "args": ["-y", "@programcomputer/nasa-mcp-server@latest"],
      "env": {
        "NASA_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

If the file already has an `mcpServers` object, add the `"nasa"` entry inside it instead of pasting a second `mcpServers`.

<details>
<summary>Claude Desktop</summary>

Open **Settings → Developer → Edit Config**. This opens `claude_desktop_config.json`:

* macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
* Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Paste the standard config, save, then fully quit and reopen Claude Desktop.

</details>

<details>
<summary>Claude Code</summary>

```bash
claude mcp add --env NASA_API_KEY=YOUR_API_KEY --scope user nasa -- npx -y @programcomputer/nasa-mcp-server@latest
```

`--scope user` makes the server available in every project; leave it out to add it to the current project only. On native Windows, replace `npx` with `cmd /c npx`.

</details>

<details>
<summary>Cursor</summary>

[<img src="https://cursor.com/deeplink/mcp-install-dark.svg" alt="Install in Cursor">](https://cursor.com/install-mcp?name=nasa&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBwcm9ncmFtY29tcHV0ZXIvbmFzYS1tY3Atc2VydmVyQGxhdGVzdCJdfQ%3D%3D)

The button installs the server without an API key. To install by hand, or to add a key, paste the standard config into `~/.cursor/mcp.json` (all projects) or `.cursor/mcp.json` (one project).

</details>

<details>
<summary>VS Code (GitHub Copilot)</summary>

[<img src="https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square" alt="Install in VS Code">](https://insiders.vscode.dev/redirect?url=vscode%3Amcp%2Finstall%3F%257B%2522name%2522%253A%2522nasa%2522%252C%2522command%2522%253A%2522npx%2522%252C%2522args%2522%253A%255B%2522-y%2522%252C%2522%2540programcomputer%252Fnasa-mcp-server%2540latest%2522%255D%257D) [<img src="https://img.shields.io/badge/VS_Code_Insiders-Install_Server-24bfa5?style=flat-square" alt="Install in VS Code Insiders">](https://insiders.vscode.dev/redirect?url=vscode-insiders%3Amcp%2Finstall%3F%257B%2522name%2522%253A%2522nasa%2522%252C%2522command%2522%253A%2522npx%2522%252C%2522args%2522%253A%255B%2522-y%2522%252C%2522%2540programcomputer%252Fnasa-mcp-server%2540latest%2522%255D%257D)

The buttons install the server without an API key. VS Code uses a top-level `servers` key instead of `mcpServers`. To install by hand, add this to `.vscode/mcp.json` in your workspace, or run **MCP: Open User Configuration** from the Command Palette for all workspaces. VS Code asks for the key the first time the server starts and stores it securely; leave it blank to skip it.

```json
{
  "inputs": [
    {
      "type": "promptString",
      "id": "nasa-api-key",
      "description": "NASA API key (optional)",
      "password": true
    }
  ],
  "servers": {
    "nasa": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@programcomputer/nasa-mcp-server@latest"],
      "env": {
        "NASA_API_KEY": "${input:nasa-api-key}"
      }
    }
  }
}
```

</details>

<details>
<summary>Codex</summary>

```bash
codex mcp add nasa --env NASA_API_KEY=YOUR_API_KEY -- npx -y @programcomputer/nasa-mcp-server@latest
```

This writes the following to `~/.codex/config.toml`, which the Codex CLI, IDE extension and desktop app share. You can also add it by hand:

```toml
[mcp_servers.nasa]
command = "npx"
args = ["-y", "@programcomputer/nasa-mcp-server@latest"]

[mcp_servers.nasa.env]
NASA_API_KEY = "YOUR_API_KEY"
```

</details>

<details>
<summary>Gemini CLI</summary>

Paste the standard config into `~/.gemini/settings.json` (all projects) or `.gemini/settings.json` (one project).

</details>

<details>
<summary>Other clients</summary>

Most other MCP clients accept the standard config. If a client asks for the command and arguments separately, the command is `npx` and the arguments are `-y @programcomputer/nasa-mcp-server@latest`.

To run a local clone instead of the npm package (see [Manual Installation](#manual-installation)), use `"command": "node"` with `"args": ["/absolute/path/to/NASA-MCP-server/dist/index.js"]`.

</details>

### Checking that it works

Restart or reload your client and check that a server named `nasa` appears in its MCP or tools list. Then ask something like "What's today's Astronomy Picture of the Day?"

If the server doesn't appear:

* Run `node --version` and make sure it prints v22 or newer.
* Check the config file for JSON mistakes such as a trailing comma or a second `mcpServers` object.
* Run the server from a terminal (below) to see any errors. If it prints nothing and waits, it is working; press Ctrl+C to stop it.
* On Windows, if the client reports that `npx` can't be found, use `"command": "cmd"` with `"args": ["/c", "npx", "-y", "@programcomputer/nasa-mcp-server@latest"]`.

### Running from a terminal

You only need this for testing; your MCP client starts the server for you.

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

# Build
npm run build

# Run with your API key
NASA_API_KEY=YOUR_API_KEY npm start
```
Replace YOUR_API_KEY with your NASA API key from <https://api.nasa.gov/>. Requires Node.js 22 or newer.

## Environment Variables

The server can be configured with the following environment variables:

| Variable | Description |
|----------|-------------|
| `NASA_API_KEY` | Your NASA API key (get at api.nasa.gov); used by NEO and InSight weather |
| `FIRMS_MAP_KEY` | Your FIRMS MAP_KEY for fire data (get at firms.modaps.eosdis.nasa.gov/api/map_key); separate from `NASA_API_KEY` |
| `NASA_MCP_CMR_URL` | Optional CMR search URL (default: `https://cmr.earthdata.nasa.gov/search`) |
| `MCP_TRANSPORT` | Transport mode: `stdio` (default) or `http` for Streamable HTTP |
| `MCP_HTTP_HOST` | Host for Streamable HTTP mode (default: `127.0.0.1`) |
| `MCP_HTTP_PORT` | Port for Streamable HTTP mode (default: `3000`) |
| `MCP_HTTP_PATH` | MCP endpoint path for Streamable HTTP mode (default: `/mcp`) |

## Transport Modes

By default, the server runs over stdio for local MCP clients such as Cursor.

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

1. **NASA Open API** (api.nasa.gov, needs `NASA_API_KEY`):
   - NEO (Near Earth Object Web Service)
   - InSight Mars Weather Service (historical: the feed stopped updating in October 2020)

2. **Other NASA APIs** (no key needed):
   - APOD (Astronomy Picture of the Day), from the NASA Science APOD API (science.nasa.gov)
   - DONKI (Space Weather Database Of Notifications, Knowledge, Information), from NASA CCMC (ccmc.gsfc.nasa.gov)
   - EONET (Earth Observatory Natural Event Tracker)
   - TLE (Two-Line Element sets from CelesTrak, via tle.ivanstanojevic.me)
   - Satellite Situation Center (spacecraft locations)
   - TechPort (NASA technology projects)
   - Technology Transfer (patents, software and spinoffs)
   - Mars, Moon and Vesta Trek (WMTS map layers and tiles)
   - NASA Image and Video Library
   - Exoplanet Archive
   - Open Science Data Repository (OSDR) files
   - POWER (Prediction Of Worldwide Energy Resources)

3. **JPL Solar System Dynamics API** (ssd-api.jpl.nasa.gov):
   - SBDB (Small-Body DataBase)
   - SBDB Close-Approach Data
   - Fireball Data
   - Sentry (impact risk)
   - Scout (NEO Confirmation Page orbits)
   - NHATS (human-accessible NEOs)
   - Small-Body Mission Design
   - Horizons ephemerides
   - Periodic Orbits
   - Julian date converter

4. **Earth Data APIs**:
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
    "date": "2023-01-01", // Optional: YYYY-MM-DD (1995-06-16 or later); defaults to the latest picture
    "max_images": 1 // Optional: how many pictures to embed (0-5)
  }
}
```

For a range, send `start_date` and `end_date` (up to 100 days) instead of `date`. APOD now comes from the NASA Science APOD API, which needs no key and has no random `count` or `thumbs` option.

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

### CMR (Common Metadata Repository)

```json
{
  "method": "nasa/cmr",
  "params": {
    "keyword": "sea surface temperature", // Optional: Collections only
    "search_type": "collections", // Optional: "collections" (default) or "granules"
    "bounding_box": "-100,10,-60,40", // Optional: west,south,east,north ("bbox" also works)
    "temporal": "2024-06-01T00:00:00Z,2024-09-30T23:59:59Z", // Optional: start,end
    "limit": 5 // Optional: 1-100, default 10
  }
}
```

Results come back in a compact format by default (`"response_mode": "raw"` returns CMR's own metadata, and `fields` picks which fields to return). To get the next page, send back only the `next_cursor` from the response:

```json
{
  "method": "nasa/cmr",
  "params": {
    "cursor": "cmr1..." // Required: next_cursor from the previous response
  }
}
```

### FIRMS (Fire Information for Resource Management System)

```json
{
  "method": "nasa/firms",
  "params": {
    "bbox": "-125,32,-114,42", // Required: west,south,east,north (or latitude, longitude and radius_km)
    "days": 1, // Optional: 1-5
    "source": "VIIRS_SNPP_NRT" // Optional: FIRMS data source
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

# Start the server
npm start

# Run tests
npm test
```

## Testing with MCP Inspector

To test the tools interactively, build the project and start the official [MCP Inspector](https://github.com/modelcontextprotocol/inspector) with the server:

```bash
npm run build
npx @modelcontextprotocol/inspector node dist/index.js
```

The server reads `NASA_API_KEY` and `FIRMS_MAP_KEY` from a `.env` file in the working directory (see Development above). The Inspector prints a local URL; open it to list and call the tools.

### Example Test Requests

The repository includes example test requests for each API that you can copy and paste into the MCP Inspector:

```bash
# View the example test requests
cat docs/inspector-test-examples.md
```

For detailed examples, see the [Inspector Test Examples](docs/inspector-test-examples.md) document.

## MCP Client Usage

This server follows the official Model Context Protocol. For local clients, use the stdio configuration in [Installation](#installation). For Streamable HTTP mode, start the server with `MCP_TRANSPORT=http`, then connect with the MCP SDK:

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
