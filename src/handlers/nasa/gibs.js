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
exports.gibsParamsSchema = void 0;
exports.nasaGibsHandler = nasaGibsHandler;
var zod_1 = require("zod");
var axios_1 = require("axios");
// Schema for validating GIBS request parameters
exports.gibsParamsSchema = zod_1.z.object({
    date: zod_1.z.string().optional(),
    layer: zod_1.z.string(),
    resolution: zod_1.z.number().optional(),
    format: zod_1.z.enum(['png', 'jpg', 'jpeg']).optional().default('png'),
    bbox: zod_1.z.string().optional()
});
/**
 * Handle requests for NASA's Global Imagery Browse Services (GIBS) API
 */
function nasaGibsHandler(params) {
    return __awaiter(this, void 0, void 0, function () {
        var date, layer, resolution, format, bbox, bboxParam, baseUrl, requestParams, response, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    date = params.date, layer = params.layer, resolution = params.resolution, format = params.format, bbox = params.bbox;
                    bboxParam = bbox || '-180,-90,180,90';
                    baseUrl = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi';
                    requestParams = {
                        SERVICE: 'WMS',
                        VERSION: '1.3.0',
                        REQUEST: 'GetMap',
                        FORMAT: "image/".concat(format),
                        LAYERS: layer,
                        CRS: 'EPSG:4326',
                        BBOX: bboxParam,
                        WIDTH: 720,
                        HEIGHT: 360,
                        TIME: date
                    };
                    return [4 /*yield*/, (0, axios_1.default)({
                            url: baseUrl,
                            params: requestParams,
                            responseType: 'arraybuffer'
                        })];
                case 1:
                    response = _a.sent();
                    // Return metadata and image data as base64
                    return [2 /*return*/, {
                            layer: layer,
                            date: date || 'latest',
                            format: format,
                            imageData: Buffer.from(response.data).toString('base64'),
                            contentType: format
                        }];
                case 2:
                    error_1 = _a.sent();
                    console.error('Error in GIBS handler:', error_1);
                    if (error_1.name === 'ZodError') {
                        throw new Error("Invalid request parameters: ".concat(error_1.message));
                    }
                    throw new Error("API error: ".concat(error_1.message));
                case 3: return [2 /*return*/];
            }
        });
    });
}
