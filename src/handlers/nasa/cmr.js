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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cmrParamsSchema = void 0;
exports.nasaCmrHandler = nasaCmrHandler;
var zod_1 = require("zod");
var axios_1 = require("axios");
var CMR_API_BASE_URL = 'https://cmr.earthdata.nasa.gov/search';
// Define common spatial parameter schemas
var polygonSchema = zod_1.z.string().describe('Comma-separated list of lon/lat points defining a polygon');
var bboxSchema = zod_1.z.string().describe('Bounding box in the format: west,south,east,north');
var pointSchema = zod_1.z.string().describe('Point in the format: lon,lat');
var lineSchema = zod_1.z.string().describe('Line in the format: lon1,lat1,lon2,lat2,...');
var circleSchema = zod_1.z.string().describe('Circle in the format: lon,lat,radius');
// Schema for validating CMR request parameters
exports.cmrParamsSchema = zod_1.z.object({
    // Search type - collections or granules
    search_type: zod_1.z.enum(['collections', 'granules']).default('collections'),
    // Basic search parameters
    keyword: zod_1.z.string().optional(),
    concept_id: zod_1.z.string().optional(),
    entry_title: zod_1.z.string().optional(),
    short_name: zod_1.z.string().optional(),
    provider: zod_1.z.string().optional(),
    // Temporal parameters
    temporal: zod_1.z.string().optional().describe('Temporal range in the format: start_date,end_date'),
    // Spatial parameters
    polygon: polygonSchema.optional(),
    bbox: bboxSchema.optional(),
    point: pointSchema.optional(),
    line: lineSchema.optional(),
    circle: circleSchema.optional(),
    // Platform, instrument, and project
    platform: zod_1.z.string().optional(),
    instrument: zod_1.z.string().optional(),
    project: zod_1.z.string().optional(),
    // Processing level and data format
    processing_level_id: zod_1.z.string().optional(),
    granule_data_format: zod_1.z.string().optional(),
    // Search flags
    downloadable: zod_1.z.boolean().optional(),
    browsable: zod_1.z.boolean().optional(),
    online_only: zod_1.z.boolean().optional(),
    // Facet parameters
    include_facets: zod_1.z.boolean().optional(),
    // Pagination and sorting
    limit: zod_1.z.number().optional().default(10),
    page: zod_1.z.number().optional().default(1),
    offset: zod_1.z.number().optional(),
    sort_key: zod_1.z.string().optional(),
    // Result format
    format: zod_1.z.enum(['json', 'umm_json', 'atom', 'echo10', 'iso19115', 'iso_smap', 'kml']).optional().default('json')
});
/**
 * Handle requests for NASA's Common Metadata Repository (CMR) API
 */
function nasaCmrHandler(params) {
    return __awaiter(this, void 0, void 0, function () {
        var search_type, format, limit, page, offset, sort_key, include_facets, polygon, bbox, point, line, circle, temporal, otherParams, endpoint, queryParams, _i, _a, _b, key, value, response, error_1;
        var _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    _d.trys.push([0, 2, , 3]);
                    search_type = params.search_type, format = params.format, limit = params.limit, page = params.page, offset = params.offset, sort_key = params.sort_key, include_facets = params.include_facets, polygon = params.polygon, bbox = params.bbox, point = params.point, line = params.line, circle = params.circle, temporal = params.temporal, otherParams = __rest(params, ["search_type", "format", "limit", "page", "offset", "sort_key", "include_facets", "polygon", "bbox", "point", "line", "circle", "temporal"]);
                    endpoint = "/".concat(search_type, ".").concat(format);
                    queryParams = {
                        page_size: limit,
                        page_num: page,
                        offset: offset,
                        sort_key: sort_key
                    };
                    // Add other parameters
                    for (_i = 0, _a = Object.entries(otherParams); _i < _a.length; _i++) {
                        _b = _a[_i], key = _b[0], value = _b[1];
                        if (value !== undefined) {
                            queryParams[key] = value;
                        }
                    }
                    // Add temporal parameter if provided
                    if (temporal) {
                        queryParams.temporal = temporal;
                    }
                    // Add spatial parameters if provided
                    if (polygon)
                        queryParams.polygon = polygon;
                    if (bbox)
                        queryParams.bbox = bbox;
                    if (point)
                        queryParams.point = point;
                    if (line)
                        queryParams.line = line;
                    if (circle)
                        queryParams.circle = circle;
                    // Add facet options if requested
                    if (include_facets) {
                        queryParams.include_facets = 'v2';
                    }
                    return [4 /*yield*/, (0, axios_1.default)({
                            url: "".concat(CMR_API_BASE_URL).concat(endpoint),
                            params: queryParams,
                            headers: {
                                'Client-Id': 'NASA-MCP-Server'
                            }
                        })];
                case 1:
                    response = _d.sent();
                    return [2 /*return*/, { result: response.data }];
                case 2:
                    error_1 = _d.sent();
                    console.error('Error in CMR handler:', error_1);
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
                            details: ((_c = error_1.response) === null || _c === void 0 ? void 0 : _c.data) || null
                        }
                    };
                case 3: return [2 /*return*/];
            }
        });
    });
}
