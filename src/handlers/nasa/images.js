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
exports.imagesParamsSchema = void 0;
exports.nasaImagesHandler = nasaImagesHandler;
var zod_1 = require("zod");
var axios_1 = require("axios");
// Schema for validating NASA Images API request parameters
exports.imagesParamsSchema = zod_1.z.object({
    q: zod_1.z.string().min(1),
    media_type: zod_1.z.enum(['image', 'audio', 'video']).optional(),
    year_start: zod_1.z.string().optional(),
    year_end: zod_1.z.string().optional(),
    page: zod_1.z.number().int().positive().optional().default(1),
    page_size: zod_1.z.number().int().min(1).max(100).optional().default(10)
});
/**
 * Handle requests to NASA's Image and Video Library API
 */
function nasaImagesHandler(params) {
    return __awaiter(this, void 0, void 0, function () {
        var q, media_type, year_start, year_end, page, page_size, url, queryParams, response, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    q = params.q, media_type = params.media_type, year_start = params.year_start, year_end = params.year_end, page = params.page, page_size = params.page_size;
                    url = 'https://images-api.nasa.gov/search';
                    queryParams = {
                        q: q,
                        page: page,
                        page_size: page_size
                    };
                    if (media_type)
                        queryParams.media_type = media_type;
                    if (year_start)
                        queryParams.year_start = year_start;
                    if (year_end)
                        queryParams.year_end = year_end;
                    return [4 /*yield*/, axios_1.default.get(url, { params: queryParams })];
                case 1:
                    response = _a.sent();
                    return [2 /*return*/, response.data];
                case 2:
                    error_1 = _a.sent();
                    console.error('Error in NASA Images handler:', error_1);
                    if (error_1.name === 'ZodError') {
                        throw new Error("Invalid request parameters: ".concat(error_1.message));
                    }
                    throw new Error("API error: ".concat(error_1.message));
                case 3: return [2 /*return*/];
            }
        });
    });
}
