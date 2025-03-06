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
exports.firmsParamsSchema = void 0;
exports.nasaFirmsHandler = nasaFirmsHandler;
var zod_1 = require("zod");
var axios_1 = require("axios");
var FIRMS_API_BASE_URL = 'https://firms.modaps.eosdis.nasa.gov/api/area/csv';
// Schema for validating FIRMS request parameters
exports.firmsParamsSchema = zod_1.z.object({
    latitude: zod_1.z.number(),
    longitude: zod_1.z.number(),
    radius: zod_1.z.number().optional().default(1.0),
    days: zod_1.z.number().int().min(1).max(10).optional().default(1),
    source: zod_1.z.enum(['VIIRS_SNPP_NRT', 'MODIS_NRT', 'VIIRS_NOAA20_NRT']).optional().default('VIIRS_SNPP_NRT')
});
/**
 * Handle requests for NASA's FIRMS (Fire Information for Resource Management System) API
 */
function nasaFirmsHandler(params) {
    return __awaiter(this, void 0, void 0, function () {
        var latitude, longitude, radius, days, source, apiKey, url, response, csvData, rows, headers_1, results, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    latitude = params.latitude, longitude = params.longitude, radius = params.radius, days = params.days, source = params.source;
                    apiKey = process.env.NASA_API_KEY;
                    if (!apiKey) {
                        throw new Error('NASA API key is required for FIRMS requests');
                    }
                    url = FIRMS_API_BASE_URL;
                    return [4 /*yield*/, axios_1.default.get(url, {
                            params: {
                                lat: latitude,
                                lon: longitude,
                                radius: radius,
                                days: days,
                                source: source,
                                api_key: apiKey
                            }
                        })];
                case 1:
                    response = _a.sent();
                    csvData = response.data;
                    rows = csvData.split('\n');
                    if (rows.length < 2) {
                        return [2 /*return*/, { results: [] }];
                    }
                    headers_1 = rows[0].split(',');
                    results = rows.slice(1)
                        .filter(function (row) { return row.trim() !== ''; })
                        .map(function (row) {
                        var values = row.split(',');
                        var entry = {};
                        headers_1.forEach(function (header, index) {
                            var value = values[index] ? values[index].trim() : '';
                            // Try to convert numeric values
                            var numValue = Number(value);
                            entry[header] = !isNaN(numValue) && value !== '' ? numValue : value;
                        });
                        return entry;
                    });
                    return [2 /*return*/, { results: results }];
                case 2:
                    error_1 = _a.sent();
                    console.error('Error in FIRMS handler:', error_1);
                    if (error_1.name === 'ZodError') {
                        throw new Error("Invalid request parameters: ".concat(error_1.message));
                    }
                    throw new Error("API error: ".concat(error_1.message));
                case 3: return [2 /*return*/];
            }
        });
    });
}
