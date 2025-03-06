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
exports.soundsParamsSchema = void 0;
exports.nasaSoundsHandler = nasaSoundsHandler;
var zod_1 = require("zod");
var api_client_1 = require("../../utils/api-client");
// Schema for validating Sounds request parameters
exports.soundsParamsSchema = zod_1.z.object({
    q: zod_1.z.string().optional(),
    limit: zod_1.z.number().int().positive().optional(),
    page: zod_1.z.number().int().positive().optional()
});
/**
 * Handle requests for NASA's Sounds API (beta)
 * Provides access to space sounds via SoundCloud with abstracted API
 */
function nasaSoundsHandler(params) {
    return __awaiter(this, void 0, void 0, function () {
        var endpoint, result, error_1;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    endpoint = '/planetary/sounds';
                    return [4 /*yield*/, (0, api_client_1.nasaApiRequest)(endpoint, params)];
                case 1:
                    result = _b.sent();
                    // Return the result
                    return [2 /*return*/, { result: result }];
                case 2:
                    error_1 = _b.sent();
                    console.error('Error in Sounds handler:', error_1);
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
                case 3: return [2 /*return*/];
            }
        });
    });
}
