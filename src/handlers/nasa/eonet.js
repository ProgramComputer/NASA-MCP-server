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
Object.defineProperty(exports, "__esModule", { value: true });
exports.nasaEonetHandler = nasaEonetHandler;
var axios_1 = require("axios");
// Define the EONET API base URL
var EONET_API_BASE_URL = 'https://eonet.gsfc.nasa.gov/api';
/**
 * Handle requests for NASA's Earth Observatory Natural Event Tracker (EONET) API
 */
function nasaEonetHandler(params) {
    return __awaiter(this, void 0, void 0, function () {
        var category, days, source, status_1, limit, endpointPath, apiParams, response, broadParams, broadResponse, error_1;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 4, , 5]);
                    category = params.category, days = params.days, source = params.source, status_1 = params.status, limit = params.limit;
                    endpointPath = '/v3/events';
                    apiParams = {};
                    // Add query parameters - using more default values to ensure we get results
                    if (days)
                        apiParams.days = days;
                    if (source)
                        apiParams.source = source;
                    if (status_1)
                        apiParams.status = status_1;
                    if (limit)
                        apiParams.limit = limit;
                    // If no status is provided, default to "all" to ensure we get some events
                    if (!status_1)
                        apiParams.status = "all";
                    // If no days parameter, default to 60 days to ensure we get more events 
                    if (!days)
                        apiParams.days = 60;
                    // If a category is specified, use the category-specific endpoint
                    if (category) {
                        endpointPath = "/v3/categories/".concat(category);
                    }
                    return [4 /*yield*/, axios_1.default.get("".concat(EONET_API_BASE_URL).concat(endpointPath), {
                            params: apiParams,
                            timeout: 10000 // 10 second timeout
                        })];
                case 1:
                    response = _b.sent();
                    if (!(!response.data.events || response.data.events.length === 0)) return [3 /*break*/, 3];
                    console.log('No EONET events found with current parameters, trying with broader criteria');
                    // Reset to the main events endpoint for maximum results
                    endpointPath = '/v3/events';
                    broadParams = {
                        status: 'all', // Get both open and closed events
                        days: 90, // Look back further
                        limit: limit || 50 // Increase the limit
                    };
                    return [4 /*yield*/, axios_1.default.get("".concat(EONET_API_BASE_URL).concat(endpointPath), {
                            params: broadParams,
                            timeout: 10000
                        })];
                case 2:
                    broadResponse = _b.sent();
                    return [2 /*return*/, {
                            result: broadResponse.data,
                            note: 'Used broader search criteria due to no events found with original parameters'
                        }];
                case 3: 
                // Return the original result
                return [2 /*return*/, { result: response.data }];
                case 4:
                    error_1 = _b.sent();
                    console.error('Error in EONET handler:', error_1);
                    if (error_1.name === 'ZodError') {
                        throw {
                            error: {
                                type: 'invalid_request',
                                message: 'Invalid request parameters',
                                details: error_1.errors
                            }
                        };
                    }
                    throw {
                        error: {
                            type: 'server_error',
                            message: error_1.message || 'An unexpected error occurred',
                            details: ((_a = error_1.response) === null || _a === void 0 ? void 0 : _a.data) || null
                        }
                    };
                case 5: return [2 /*return*/];
            }
        });
    });
}
