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
exports.apodParamsSchema = void 0;
exports.nasaApodHandler = nasaApodHandler;
var zod_1 = require("zod");
var api_client_1 = require("../../utils/api-client");
var index_js_1 = require("../../index.js");
// Schema for validating APOD request parameters
exports.apodParamsSchema = zod_1.z.object({
    date: zod_1.z.string().optional(),
    hd: zod_1.z.boolean().optional(),
    count: zod_1.z.number().int().positive().optional(),
    start_date: zod_1.z.string().optional(),
    end_date: zod_1.z.string().optional(),
    thumbs: zod_1.z.boolean().optional()
});
/**
 * Handle requests for NASA's Astronomy Picture of the Day (APOD) API
 */
function nasaApodHandler(params) {
    return __awaiter(this, void 0, void 0, function () {
        var result, processedResult, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, (0, api_client_1.nasaApiRequest)('/planetary/apod', params)];
                case 1:
                    result = _a.sent();
                    processedResult = processApodResult(result);
                    return [2 /*return*/, {
                            content: __spreadArray([
                                {
                                    type: "text",
                                    text: processedResult.summary
                                }
                            ], processedResult.images.map(function (img) { return ({
                                type: "image",
                                data: img.data,
                                mimeType: "image/jpeg"
                            }); }), true),
                            isError: false
                        }];
                case 2:
                    error_1 = _a.sent();
                    console.error('Error in APOD handler:', error_1);
                    return [2 /*return*/, {
                            content: [
                                {
                                    type: "text",
                                    text: "Error retrieving APOD data: ".concat(error_1.message)
                                }
                            ],
                            isError: true
                        }];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Process APOD API results, storing images as resources and preparing a summary
 */
function processApodResult(result) {
    // Handle both single image and collection of images
    var items = Array.isArray(result) ? result : [result];
    var summary = '';
    var images = [];
    items.forEach(function (item, index) {
        // Add to summary text
        summary += "\n\n".concat(index > 0 ? '---\n\n' : '');
        summary += "# ".concat(item.title, " (").concat(item.date, ")\n\n");
        summary += "".concat(item.explanation, "\n\n");
        if (item.copyright) {
            summary += "Copyright: ".concat(item.copyright, "\n\n");
        }
        // Store image URL for display
        if (item.url) {
            summary += "[View Image](".concat(item.url, ")\n");
            // For actual images (not videos), we could fetch and convert to base64
            // But for simplicity, we'll just reference the URL
            if (!item.media_type || item.media_type === 'image') {
                var imageId = "apod-".concat(item.date);
                // Note: In a real implementation, you'd fetch the image
                // and convert to base64 for direct embedding
                // Placeholder for image processing
                // images.push({
                //   id: imageId,
                //   data: fetchedImageData
                // });
                // For now, just store the URL as a resource
                (0, index_js_1.addResource)("nasa://apod/".concat(imageId), {
                    name: "APOD: ".concat(item.title, " (").concat(item.date, ")"),
                    mimeType: 'text/plain',
                    text: item.url
                });
            }
        }
    });
    return {
        summary: summary,
        images: images
    };
}
// Default export for dynamic import in the tool handler
exports.default = nasaApodHandler;
