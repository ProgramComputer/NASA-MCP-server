"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addResource = addResource;
var index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
var stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
var dotenv_1 = require("dotenv");
var setup_js_1 = require("./handlers/setup.js");
var zod_1 = require("zod");
var types_js_1 = require("@modelcontextprotocol/sdk/types.js");
// Load environment variables
dotenv_1.default.config();
// Global state for resources
var resources = new Map();
// Keep a reference to the server for notifications
var serverInstance = null;
// Define resource templates for dynamic resource discovery
var resourceTemplates = [
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
var nasaPrompts = [
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
var jplPrompts = [
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
var allPrompts = __spreadArray(__spreadArray([], nasaPrompts, true), jplPrompts, true);
function startServer() {
    return __awaiter(this, void 0, void 0, function () {
        var server, stdioTransport, error_1;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    // Initialize resources
                    initializeResources();
                    server = new index_js_1.Server({
                        name: "NASA MCP Server",
                        description: "Model Context Protocol server for NASA APIs",
                        version: "1.0.0"
                    }, {
                        capabilities: {
                            resources: {}, // Support resources properly
                            tools: {}, // Support tools properly
                            prompts: {} // Support prompts
                        }
                    });
                    // Store the server instance for global access
                    serverInstance = server;
                    // Register the tools/manifest method handler (important for MCP compliance)
                    server.setRequestHandler(zod_1.z.object({
                        method: zod_1.z.literal("tools/manifest"),
                        params: zod_1.z.object({}).optional()
                    }), function () { return __awaiter(_this, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            // Return all tools we support in the MCP required format
                            return [2 /*return*/, {
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
                                }];
                        });
                    }); });
                    // Register the standard MCP methods
                    // List Resources Handler
                    server.setRequestHandler(zod_1.z.object({
                        method: zod_1.z.literal("resources/list"),
                        params: zod_1.z.object({}).optional()
                    }), function () { return __awaiter(_this, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            return [2 /*return*/, {
                                    resources: Array.from(resources.entries()).map(function (_a) {
                                        var uri = _a[0], resource = _a[1];
                                        return ({
                                            uri: uri,
                                            mimeType: resource.mimeType,
                                            name: resource.name
                                        });
                                    })
                                }];
                        });
                    }); });
                    // Standard handler using the ListResourcesRequestSchema (may be an alternate way to call the same endpoint)
                    server.setRequestHandler(types_js_1.ListResourcesRequestSchema, function () { return __awaiter(_this, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            return [2 /*return*/, {
                                    resources: Array.from(resources.entries()).map(function (_a) {
                                        var uri = _a[0], resource = _a[1];
                                        return ({
                                            uri: uri,
                                            mimeType: resource.mimeType,
                                            name: resource.name
                                        });
                                    })
                                }];
                        });
                    }); });
                    // Read Resource Handler
                    server.setRequestHandler(zod_1.z.object({
                        method: zod_1.z.literal("resources/read"),
                        params: zod_1.z.object({
                            uri: zod_1.z.string()
                        })
                    }), function (request) { return __awaiter(_this, void 0, void 0, function () {
                        var uri, resource;
                        return __generator(this, function (_a) {
                            uri = request.params.uri.toString();
                            resource = resources.get(uri);
                            if (!resource) {
                                throw new Error("Resource not found: ".concat(uri));
                            }
                            return [2 /*return*/, {
                                    contents: [{
                                            uri: uri,
                                            mimeType: resource.mimeType,
                                            text: resource.text,
                                            blob: resource.blob
                                        }]
                                }];
                        });
                    }); });
                    // Standard handler using the ReadResourceRequestSchema
                    server.setRequestHandler(types_js_1.ReadResourceRequestSchema, function (request) { return __awaiter(_this, void 0, void 0, function () {
                        var uri, resource;
                        return __generator(this, function (_a) {
                            uri = request.params.uri.toString();
                            resource = resources.get(uri);
                            if (!resource) {
                                throw new Error("Resource not found: ".concat(uri));
                            }
                            return [2 /*return*/, {
                                    contents: [{
                                            uri: uri,
                                            mimeType: resource.mimeType,
                                            text: resource.text,
                                            blob: resource.blob
                                        }]
                                }];
                        });
                    }); });
                    // List Tools Handler - Fixed the method name from "list-tools" to "tools/list"
                    server.setRequestHandler(zod_1.z.object({
                        method: zod_1.z.literal("tools/list"),
                        params: zod_1.z.object({}).optional()
                    }), function () { return __awaiter(_this, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            // Return all tools we support in the MCP required format
                            return [2 /*return*/, {
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
                                }];
                        });
                    }); });
                    // Add prompts/list endpoint 
                    server.setRequestHandler(zod_1.z.object({
                        method: zod_1.z.literal("prompts/list"),
                        params: zod_1.z.object({}).optional()
                    }), function () { return __awaiter(_this, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            return [2 /*return*/, {
                                    prompts: allPrompts
                                }];
                        });
                    }); });
                    // Add direct handlers for each NASA API
                    // APOD Handler
                    server.setRequestHandler(zod_1.z.object({
                        method: zod_1.z.literal("nasa/apod"),
                        params: zod_1.z.object({
                            date: zod_1.z.string().optional(),
                            start_date: zod_1.z.string().optional(),
                            end_date: zod_1.z.string().optional(),
                            count: zod_1.z.number().optional(),
                            thumbs: zod_1.z.boolean().optional()
                        }).optional()
                    }), function (request) { return __awaiter(_this, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, handleToolCall("nasa/apod", request.params || {})];
                                case 1: return [2 /*return*/, _a.sent()];
                            }
                        });
                    }); });
                    // NEO Handler
                    server.setRequestHandler(zod_1.z.object({
                        method: zod_1.z.literal("nasa/neo"),
                        params: zod_1.z.object({
                            start_date: zod_1.z.string().optional(),
                            end_date: zod_1.z.string().optional(),
                            asteroid_id: zod_1.z.string().optional()
                        }).optional()
                    }), function (request) { return __awaiter(_this, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, handleToolCall("nasa/neo", request.params || {})];
                                case 1: return [2 /*return*/, _a.sent()];
                            }
                        });
                    }); });
                    // EPIC Handler
                    server.setRequestHandler(zod_1.z.object({
                        method: zod_1.z.literal("nasa/epic"),
                        params: zod_1.z.object({
                            collection: zod_1.z.string().optional(),
                            date: zod_1.z.string().optional()
                        }).optional()
                    }), function (request) { return __awaiter(_this, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, handleToolCall("nasa/epic", request.params || {})];
                                case 1: return [2 /*return*/, _a.sent()];
                            }
                        });
                    }); });
                    // Add CallToolRequestSchema handler (required for MCP compliance)
                    server.setRequestHandler(types_js_1.CallToolRequestSchema, function (request) { return __awaiter(_this, void 0, void 0, function () {
                        var toolName, args;
                        var _a;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    toolName = request.params.name;
                                    args = (_a = request.params.arguments) !== null && _a !== void 0 ? _a : {};
                                    return [4 /*yield*/, handleToolCall(toolName, args)];
                                case 1: 
                                // Call the tool handler function
                                return [2 /*return*/, _b.sent()];
                            }
                        });
                    }); });
                    // Add handlers for prompts
                    server.setRequestHandler(zod_1.z.object({
                        method: zod_1.z.literal("prompts/execute"),
                        params: zod_1.z.object({
                            name: zod_1.z.string(),
                            arguments: zod_1.z.record(zod_1.z.string(), zod_1.z.any()).optional()
                        })
                    }), function (request) { return __awaiter(_this, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, handlePrompt(request.params.name, request.params.arguments || {})];
                                case 1: return [2 /*return*/, _a.sent()];
                            }
                        });
                    }); });
                    // Set up all handlers from the handler setup module
                    (0, setup_js_1.setupHandlers)(server);
                    // Register the resource templates list handler
                    server.setRequestHandler(zod_1.z.object({
                        method: zod_1.z.literal("resources/templates/list"),
                        params: zod_1.z.object({}).optional()
                    }), function () { return __awaiter(_this, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            return [2 /*return*/, {
                                    resourceTemplates: resourceTemplates
                                }];
                        });
                    }); });
                    stdioTransport = new stdio_js_1.StdioServerTransport();
                    return [4 /*yield*/, server.connect(stdioTransport)];
                case 1:
                    _a.sent();
                    console.log("Server started with stdio transport");
                    return [3 /*break*/, 3];
                case 2:
                    error_1 = _a.sent();
                    console.error("Error starting server:", error_1);
                    process.exit(1);
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    });
}
// Add a function to handle prompts
function handlePrompt(promptName, args) {
    return __awaiter(this, void 0, void 0, function () {
        var promptToToolMap, toolName, prompt_1, missingArgs, error_2, errorMessage;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    console.log("Handling prompt: ".concat(promptName, " with args:"), args);
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    promptToToolMap = {
                        "nasa/get-astronomy-picture": "nasa/apod",
                        "nasa/browse-near-earth-objects": "nasa/neo",
                        "nasa/view-epic-imagery": "nasa/epic",
                        "jpl/query-small-body-database": "jpl/sbdb",
                        "jpl/find-close-approaches": "jpl/cad",
                        "jpl/get-fireball-data": "jpl/fireball"
                    };
                    toolName = promptToToolMap[promptName];
                    if (!toolName) {
                        throw new Error("Unknown prompt: ".concat(promptName));
                    }
                    prompt_1 = allPrompts.find(function (p) { return p.name === promptName; });
                    if (!prompt_1) {
                        throw new Error("Prompt definition not found: ".concat(promptName));
                    }
                    missingArgs = (_a = prompt_1.arguments) === null || _a === void 0 ? void 0 : _a.filter(function (arg) { return arg.required && !args[arg.name]; }).map(function (arg) { return arg.name; });
                    if (missingArgs && missingArgs.length > 0) {
                        throw new Error("Missing required arguments: ".concat(missingArgs.join(', ')));
                    }
                    return [4 /*yield*/, handleToolCall(toolName, args)];
                case 2: 
                // Execute the corresponding tool
                return [2 /*return*/, _b.sent()];
                case 3:
                    error_2 = _b.sent();
                    errorMessage = error_2 instanceof Error ? error_2.message : String(error_2);
                    return [2 /*return*/, {
                            content: [{
                                    type: "text",
                                    text: "Error executing prompt '".concat(promptName, "': ").concat(errorMessage)
                                }],
                            isError: true
                        }];
                case 4: return [2 /*return*/];
            }
        });
    });
}
// Add a function to handle tool calls
function handleToolCall(toolName, args) {
    return __awaiter(this, void 0, void 0, function () {
        var endpoint, simpleNeoHandler, handlerModule, error_3, errorMessage, endpoint, handlerModule, handlerFunction, error_4, errorMessage;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    // This function will delegate to the appropriate handler based on the tool name
                    console.log("Handling tool call for: ".concat(toolName, " with args:"), args);
                    if (!toolName.startsWith("nasa/")) return [3 /*break*/, 11];
                    endpoint = toolName.split("/")[1];
                    console.log("Endpoint: ".concat(endpoint));
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 9, , 10]);
                    if (!(endpoint === "neo")) return [3 /*break*/, 4];
                    console.log("Using special case for neo endpoint");
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('./handlers/nasa/simple-neo.js'); })];
                case 2:
                    simpleNeoHandler = (_a.sent()).simpleNeoHandler;
                    return [4 /*yield*/, simpleNeoHandler(args)];
                case 3: 
                // Use the imported function
                return [2 /*return*/, _a.sent()];
                case 4:
                    // Dynamic import for other handlers
                    console.log("Importing handler module: ./handlers/nasa/".concat(endpoint, ".js"));
                    return [4 /*yield*/, Promise.resolve("".concat("./handlers/nasa/".concat(endpoint, ".js"))).then(function (s) { return require(s); })];
                case 5:
                    handlerModule = _a.sent();
                    console.log("Handler module imported:", handlerModule);
                    if (!(typeof handlerModule.default === 'function')) return [3 /*break*/, 7];
                    console.log("Found default export function, calling it");
                    return [4 /*yield*/, handlerModule.default(args)];
                case 6: return [2 /*return*/, _a.sent()];
                case 7:
                    console.log("No default export function found in module:", handlerModule);
                    throw new Error("Handler for ".concat(endpoint, " does not export a default function"));
                case 8: return [3 /*break*/, 10];
                case 9:
                    error_3 = _a.sent();
                    errorMessage = error_3 instanceof Error ? error_3.message : String(error_3);
                    return [2 /*return*/, {
                            content: [{
                                    type: "text",
                                    text: "Error executing tool '".concat(toolName, "': ").concat(errorMessage)
                                }],
                            isError: true
                        }];
                case 10: return [3 /*break*/, 18];
                case 11:
                    if (!toolName.startsWith("jpl/")) return [3 /*break*/, 18];
                    endpoint = toolName.split("/")[1];
                    console.log("JPL Endpoint: ".concat(endpoint));
                    _a.label = 12;
                case 12:
                    _a.trys.push([12, 17, , 18]);
                    // Dynamic import for JPL handlers
                    console.log("Importing handler module: ./handlers/jpl/".concat(endpoint, ".js"));
                    return [4 /*yield*/, Promise.resolve("".concat("./handlers/jpl/".concat(endpoint, ".js"))).then(function (s) { return require(s); })];
                case 13:
                    handlerModule = _a.sent();
                    handlerFunction = handlerModule.default ||
                        handlerModule["jpl".concat(endpoint.charAt(0).toUpperCase() + endpoint.slice(1), "Handler")] ||
                        handlerModule["".concat(endpoint, "Handler")];
                    if (!(typeof handlerFunction === 'function')) return [3 /*break*/, 15];
                    return [4 /*yield*/, handlerFunction(args)];
                case 14: return [2 /*return*/, _a.sent()];
                case 15: throw new Error("Handler for ".concat(endpoint, " not found in module"));
                case 16: return [3 /*break*/, 18];
                case 17:
                    error_4 = _a.sent();
                    errorMessage = error_4 instanceof Error ? error_4.message : String(error_4);
                    return [2 /*return*/, {
                            content: [{
                                    type: "text",
                                    text: "Error executing JPL tool '".concat(toolName, "': ").concat(errorMessage)
                                }],
                            isError: true
                        }];
                case 18: return [2 /*return*/, {
                        content: [{
                                type: "text",
                                text: "Unknown tool: ".concat(toolName)
                            }],
                        isError: true
                    }];
            }
        });
    });
}
// Utility function to add a resource (can be used by handlers to store results)
function addResource(uri, resource) {
    resources.set(uri, resource);
    // Send notification about resource change if server is initialized
    if (serverInstance) {
        serverInstance.notification({
            method: "notifications/resources/list_changed"
        });
    }
}
// Start the server
startServer().catch(function (error) {
    console.error("Error starting NASA MCP Server:", error);
    process.exit(1);
});
// Handle stdin close for graceful shutdown
process.stdin.on("close", function () {
    console.log("NASA MCP Server shutting down...");
    if (serverInstance) {
        serverInstance.close();
    }
    setTimeout(function () {
        process.exit(0);
    }, 100);
});
