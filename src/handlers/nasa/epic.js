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
exports.epicParamsSchema = void 0;
exports.nasaEpicHandler = nasaEpicHandler;
var zod_1 = require("zod");
var axios_1 = require("axios");
// Define the EPIC API base URL
var EPIC_API_BASE_URL = 'https://epic.gsfc.nasa.gov/api';
// Schema for validating EPIC request parameters
exports.epicParamsSchema = zod_1.z.object({
    collection: zod_1.z.enum(['natural', 'enhanced']).optional().default('natural'),
    date: zod_1.z.string().optional(),
});
/**
 * Handle requests for NASA's Earth Polychromatic Imaging Camera (EPIC) API
 */
function nasaEpicHandler(params) {
    return __awaiter(this, void 0, void 0, function () {
        var collection, date, availableDatesResponse, availableDates, response_1, error_1, endpoint, response, fallbackResponse, error_2, collection, fallbackResponse, fallbackError_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 10, , 15]);
                    collection = params.collection, date = params.date;
                    if (!date) return [3 /*break*/, 6];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 5, , 6]);
                    return [4 /*yield*/, axios_1.default.get("".concat(EPIC_API_BASE_URL, "/").concat(collection, "/available"), {
                            timeout: 5000 // 5 second timeout for checking dates
                        })];
                case 2:
                    availableDatesResponse = _a.sent();
                    availableDates = availableDatesResponse.data;
                    if (!(Array.isArray(availableDates) && !availableDates.includes(date))) return [3 /*break*/, 4];
                    console.log("Date ".concat(date, " not available for EPIC ").concat(collection, " imagery, using most recent data instead"));
                    return [4 /*yield*/, axios_1.default.get("".concat(EPIC_API_BASE_URL, "/").concat(collection), {
                            timeout: 10000 // 10 second timeout
                        })];
                case 3:
                    response_1 = _a.sent();
                    return [2 /*return*/, response_1.data];
                case 4: return [3 /*break*/, 6];
                case 5:
                    error_1 = _a.sent();
                    console.warn('Error checking EPIC available dates, proceeding with requested date anyway:', error_1);
                    return [3 /*break*/, 6];
                case 6:
                    endpoint = "/".concat(collection);
                    if (date) {
                        endpoint += "/date/".concat(date);
                    }
                    return [4 /*yield*/, axios_1.default.get("".concat(EPIC_API_BASE_URL).concat(endpoint), {
                        // Removed timeout to prevent timeouts with specific dates
                        })];
                case 7:
                    response = _a.sent();
                    if (!(Array.isArray(response.data) && response.data.length === 0)) return [3 /*break*/, 9];
                    console.log('No data available for the specified parameters, using most recent data instead');
                    return [4 /*yield*/, axios_1.default.get("".concat(EPIC_API_BASE_URL, "/").concat(collection), {
                            timeout: 10000
                        })];
                case 8:
                    fallbackResponse = _a.sent();
                    return [2 /*return*/, fallbackResponse.data];
                case 9: 
                // Return the result
                return [2 /*return*/, response.data];
                case 10:
                    error_2 = _a.sent();
                    console.error('Error in EPIC handler:', error_2);
                    if (error_2.name === 'ZodError') {
                        throw new Error("Invalid request parameters: ".concat(error_2.message));
                    }
                    if (!(error_2.code === 'ECONNABORTED' || error_2.message.includes('timeout'))) return [3 /*break*/, 14];
                    _a.label = 11;
                case 11:
                    _a.trys.push([11, 13, , 14]);
                    console.log('Timeout occurred, trying fallback to most recent data');
                    collection = params.collection;
                    return [4 /*yield*/, axios_1.default.get("".concat(EPIC_API_BASE_URL, "/").concat(collection), {
                            timeout: 10000
                        })];
                case 12:
                    fallbackResponse = _a.sent();
                    return [2 /*return*/, fallbackResponse.data];
                case 13:
                    fallbackError_1 = _a.sent();
                    console.error('Even fallback request failed:', fallbackError_1);
                    throw new Error("API error (with fallback): ".concat(error_2.message));
                case 14: throw new Error("API error: ".concat(error_2.message));
                case 15: return [2 /*return*/];
            }
        });
    });
}
