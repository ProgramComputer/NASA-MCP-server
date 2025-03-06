"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SSEServerTransport = void 0;
/**
 * Server-Sent Events (SSE) transport for MCP server
 * This implementation handles a single SSE connection
 */
var SSEServerTransport = /** @class */ (function () {
    /**
     * Create a new SSE transport
     * @param postMessagePath The path where POST messages will be sent
     * @param res The Express response object for the SSE connection
     */
    function SSEServerTransport(postMessagePath, res) {
        var _this = this;
        this.closed = false;
        this.postMessagePath = postMessagePath;
        this.res = res;
        // Set up SSE headers
        this.res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });
        // Send initial connection message
        this.res.write("data: ".concat(JSON.stringify({ type: 'connection', id: Date.now() }), "\n\n"));
        // Handle client disconnect
        this.res.on('close', function () {
            _this.closed = true;
            if (_this.onclose) {
                _this.onclose();
            }
        });
    }
    /**
     * Handle a POST message from the client
     */
    SSEServerTransport.prototype.handlePostMessage = function (req, res) {
        try {
            var message = req.body.message;
            if (!message || typeof message !== 'string') {
                res.status(400).json({ error: 'Invalid message format' });
                return;
            }
            try {
                // Parse the incoming message
                var rawMessage = JSON.parse(message);
                // Convert to proper JSON-RPC 2.0 format if needed
                var jsonRpcMessage = void 0;
                // Check if it's already in JSON-RPC format
                if (rawMessage.jsonrpc === "2.0" && (rawMessage.method || rawMessage.id)) {
                    jsonRpcMessage = rawMessage;
                }
                else {
                    // If it has a method field, convert it to proper JSON-RPC format
                    if (rawMessage.method && typeof rawMessage.method === "string") {
                        jsonRpcMessage = {
                            jsonrpc: "2.0",
                            method: rawMessage.method,
                            params: rawMessage.params || {},
                            id: rawMessage.id || Math.floor(Math.random() * 10000)
                        };
                    }
                    else {
                        throw new Error("Message must contain a 'method' field of type string");
                    }
                }
                // Call the onmessage handler if available
                if (this.onmessage) {
                    this.onmessage(jsonRpcMessage);
                    res.status(200).json({ success: true });
                }
                else {
                    res.status(503).json({ error: 'Message handler not initialized' });
                }
            }
            catch (error) {
                console.error('Error parsing or validating message:', error);
                var errorMessage = error instanceof Error ? error.message : String(error);
                res.status(400).json({
                    error: 'Invalid JSON-RPC format',
                    details: errorMessage
                });
            }
        }
        catch (error) {
            console.error('Error handling message:', error);
            if (this.onerror) {
                this.onerror(new Error("Error handling message: ".concat(error)));
            }
            res.status(500).json({ error: 'Internal server error' });
        }
    };
    // Implement the Transport interface
    SSEServerTransport.prototype.start = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                // Connection is already established in the constructor
                return [2 /*return*/, Promise.resolve()];
            });
        });
    };
    SSEServerTransport.prototype.close = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.closed = true;
                try {
                    this.res.end();
                    if (this.onclose) {
                        this.onclose();
                    }
                }
                catch (error) {
                    console.error('Error closing SSE connection:', error);
                    if (this.onerror) {
                        this.onerror(new Error("Error closing SSE connection: ".concat(error)));
                    }
                }
                return [2 /*return*/, Promise.resolve()];
            });
        });
    };
    SSEServerTransport.prototype.send = function (message) {
        return __awaiter(this, void 0, void 0, function () {
            var outgoingMessage, messageStr;
            return __generator(this, function (_a) {
                if (this.closed) {
                    if (this.onerror) {
                        this.onerror(new Error('Cannot send message on closed connection'));
                    }
                    return [2 /*return*/];
                }
                try {
                    outgoingMessage = message;
                    if (typeof message !== 'string') {
                        // Make sure it has the required JSON-RPC fields
                        if (!outgoingMessage.jsonrpc) {
                            outgoingMessage = __assign(__assign({}, outgoingMessage), { jsonrpc: "2.0" });
                        }
                    }
                    messageStr = typeof outgoingMessage === 'string'
                        ? outgoingMessage
                        : JSON.stringify(outgoingMessage);
                    // Send the message as an SSE event
                    this.res.write("data: ".concat(messageStr, "\n\n"));
                }
                catch (error) {
                    console.error('Error sending SSE message:', error);
                    if (this.onerror) {
                        this.onerror(new Error("Error sending SSE message: ".concat(error)));
                    }
                    // Mark as closed if we can't send
                    this.closed = true;
                }
                return [2 /*return*/];
            });
        });
    };
    return SSEServerTransport;
}());
exports.SSEServerTransport = SSEServerTransport;
