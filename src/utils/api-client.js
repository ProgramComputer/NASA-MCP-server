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
exports.JPL_SSD_API_BASE_URL = exports.NASA_API_BASE_URL = void 0;
exports.nasaApiRequest = nasaApiRequest;
exports.jplApiRequest = jplApiRequest;
var axios_1 = require("axios");
var dotenv_1 = require("dotenv");
dotenv_1.default.config();
// NASA API Base URLs
exports.NASA_API_BASE_URL = 'https://api.nasa.gov';
exports.JPL_SSD_API_BASE_URL = 'https://ssd-api.jpl.nasa.gov';
/**
 * Make a request to a NASA API endpoint
 */
function nasaApiRequest(endpoint_1) {
    return __awaiter(this, arguments, void 0, function (endpoint, params, options) {
        var apiKey, response, error_1;
        var _a;
        if (params === void 0) { params = {}; }
        if (options === void 0) { options = {}; }
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    apiKey = process.env.NASA_API_KEY;
                    if (!apiKey) {
                        throw new Error('NASA API key not found. Please set NASA_API_KEY in .env file');
                    }
                    return [4 /*yield*/, (0, axios_1.default)(__assign({ url: "".concat(exports.NASA_API_BASE_URL).concat(endpoint), params: __assign(__assign({}, params), { api_key: apiKey }), timeout: 10000 }, options))];
                case 1:
                    response = _b.sent();
                    return [2 /*return*/, response.data];
                case 2:
                    error_1 = _b.sent();
                    console.error("Error calling NASA API (".concat(endpoint, "):"), error_1.message);
                    if (error_1.response) {
                        // The request was made and the server responded with a status code
                        // that falls out of the range of 2xx
                        throw new Error("NASA API error (".concat(error_1.response.status, "): ").concat(((_a = error_1.response.data.error) === null || _a === void 0 ? void 0 : _a.message) || 'Unknown error'));
                    }
                    else if (error_1.request) {
                        // The request was made but no response was received
                        throw new Error("NASA API network error: No response received or request timed out");
                    }
                    else {
                        // Something happened in setting up the request that triggered an Error
                        throw new Error("NASA API request error: ".concat(error_1.message));
                    }
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Make a request to a JPL SSD API endpoint
 */
function jplApiRequest(endpoint_1) {
    return __awaiter(this, arguments, void 0, function (endpoint, params, options) {
        var apiKey, paramsWithKey, response, error_2;
        if (params === void 0) { params = {}; }
        if (options === void 0) { options = {}; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    apiKey = process.env.NASA_API_KEY;
                    if (!apiKey) {
                        throw new Error('NASA API key not found. Please set NASA_API_KEY in .env file');
                    }
                    paramsWithKey = __assign(__assign({}, params), { api_key: apiKey });
                    return [4 /*yield*/, (0, axios_1.default)(__assign({ url: "".concat(exports.JPL_SSD_API_BASE_URL).concat(endpoint), params: paramsWithKey, timeout: 10000 }, options))];
                case 1:
                    response = _a.sent();
                    return [2 /*return*/, response.data];
                case 2:
                    error_2 = _a.sent();
                    console.error("Error calling JPL API (".concat(endpoint, "):"), error_2.message);
                    if (error_2.response) {
                        throw new Error("JPL API error (".concat(error_2.response.status, "): ").concat(error_2.response.data.message || 'Unknown error'));
                    }
                    else if (error_2.request) {
                        throw new Error("JPL API network error: No response received");
                    }
                    else {
                        throw new Error("JPL API request error: ".concat(error_2.message));
                    }
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    });
}
