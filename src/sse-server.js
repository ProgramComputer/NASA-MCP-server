"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
var sse_transport_js_1 = require("./utils/sse-transport.js");
var express_1 = require("express");
var cors_1 = require("cors");
var body_parser_1 = require("body-parser");
var dotenv_1 = require("dotenv");
var setup_js_1 = require("./handlers/setup.js");
var path_1 = require("path");
// Load environment variables
dotenv_1.default.config();
// Create Express app
var app = (0, express_1.default)();
// Add middleware
app.use((0, cors_1.default)());
app.use(body_parser_1.default.json());
// Initialize MCP server
var server = new index_js_1.Server({
    name: "NASA MCP Server",
    description: "Model Context Protocol server for NASA APIs",
    version: "1.0.0"
}, {
    capabilities: {
        resources: {},
        tools: {},
        prompts: {}
    }
});
// Map to track active transports
var transports = new Map();
// Define route handlers first
var sseHandler = function (req, res) {
    // Generate a unique ID for this connection
    var connectionId = Date.now().toString();
    console.log("New SSE connection established: ".concat(connectionId));
    // Create a new transport for this connection
    var transport = new sse_transport_js_1.SSEServerTransport("/messages", res);
    // Store the transport
    transports.set(connectionId, transport);
    // Connect the server to this transport
    server.connect(transport);
    // When the connection closes, remove it from our map
    res.on('close', function () {
        console.log("SSE connection closed: ".concat(connectionId));
        transports.delete(connectionId);
    });
};
var messageHandler = function (req, res) {
    // Find an active transport to handle the message
    // In a real implementation, you might want to identify which specific
    // transport to use based on session/user info
    if (transports.size === 0) {
        return res.status(503).json({ error: 'No active connections' });
    }
    // For simplicity, use the first transport in the map
    var connectionId = Array.from(transports.keys())[0];
    var transport = transports.get(connectionId);
    if (transport) {
        transport.handlePostMessage(req, res);
    }
    else {
        res.status(503).json({ error: 'No active connections' });
    }
};
// Now register the routes
app.get("/sse", sseHandler);
app.post("/messages", messageHandler);
// Serve the client HTML file
var CLIENT_HTML_PATH = path_1.default.join(process.cwd(), 'dist', 'utils', 'sse-client.html');
app.get('/', function (req, res) {
    res.sendFile(CLIENT_HTML_PATH);
});
// Setup NASA API handlers
(0, setup_js_1.setupHandlers)(server);
// Register standard MCP methods
// ... (Add your existing handlers here)
// Start the server
var PORT = process.env.PORT || 3000;
app.listen(PORT, function () {
    console.log("SSE MCP Server running on http://localhost:".concat(PORT));
    console.log("- SSE endpoint: http://localhost:".concat(PORT, "/sse"));
    console.log("- Message endpoint: http://localhost:".concat(PORT, "/messages"));
    console.log("- Client UI: http://localhost:".concat(PORT, "/"));
});
