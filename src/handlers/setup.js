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
exports.scoutParamsSchema = exports.eonetParamsSchema = exports.marsRoverParamsSchema = exports.donkiParamsSchema = void 0;
exports.setupHandlers = setupHandlers;
var zod_1 = require("zod");
// Define schemas for all NASA API endpoints
var ApodSchema = zod_1.z.object({
    date: zod_1.z.string().optional(),
    start_date: zod_1.z.string().optional(),
    end_date: zod_1.z.string().optional(),
    count: zod_1.z.number().optional(),
    thumbs: zod_1.z.boolean().optional()
});
var EpicSchema = zod_1.z.object({
    collection: zod_1.z.enum(['natural', 'enhanced']).optional(),
    date: zod_1.z.string().optional()
});
var NeoSchema = zod_1.z.object({
    start_date: zod_1.z.string(),
    end_date: zod_1.z.string()
});
var GibsSchema = zod_1.z.object({
    layer: zod_1.z.string(),
    date: zod_1.z.string(),
    format: zod_1.z.enum(['png', 'jpg', 'jpeg']).optional(),
    resolution: zod_1.z.number().optional()
});
var CmrSchema = zod_1.z.object({
    keyword: zod_1.z.string(),
    limit: zod_1.z.number().optional(),
    page: zod_1.z.number().optional(),
    sort_key: zod_1.z.string().optional()
});
var FirmsSchema = zod_1.z.object({
    latitude: zod_1.z.number(),
    longitude: zod_1.z.number(),
    days: zod_1.z.number().optional()
});
var ImagesSchema = zod_1.z.object({
    q: zod_1.z.string(),
    media_type: zod_1.z.enum(['image', 'video', 'audio']).optional(),
    year_start: zod_1.z.string().optional(),
    year_end: zod_1.z.string().optional(),
    page: zod_1.z.number().optional()
});
var ExoplanetSchema = zod_1.z.object({
    table: zod_1.z.string(),
    select: zod_1.z.string().optional(),
    where: zod_1.z.string().optional(),
    order: zod_1.z.string().optional(),
    limit: zod_1.z.number().optional()
});
var SbdbSchema = zod_1.z.object({
    search: zod_1.z.string()
});
var FireballSchema = zod_1.z.object({
    date_min: zod_1.z.string().optional(),
    date_max: zod_1.z.string().optional(),
    energy_min: zod_1.z.number().optional()
});
var ScoutSchema = zod_1.z.object({
    orbit_id: zod_1.z.string().optional(),
    tdes: zod_1.z.string().optional()
});
// Define schemas for added APIs
var DonkiSchema = zod_1.z.object({
    type: zod_1.z.enum(['cme', 'cmea', 'gst', 'ips', 'flr', 'sep', 'mpc', 'rbe', 'hss', 'wsa', 'notifications']),
    startDate: zod_1.z.string().optional(),
    endDate: zod_1.z.string().optional()
});
var MarsRoverSchema = zod_1.z.object({
    rover: zod_1.z.enum(['curiosity', 'opportunity', 'perseverance', 'spirit']),
    sol: zod_1.z.number().int().nonnegative().optional(),
    earth_date: zod_1.z.string().optional(),
    camera: zod_1.z.string().optional(),
    page: zod_1.z.number().int().positive().optional()
});
var EonetSchema = zod_1.z.object({
    category: zod_1.z.string().optional(),
    days: zod_1.z.number().int().positive().optional(),
    source: zod_1.z.string().optional(),
    status: zod_1.z.enum(['open', 'closed', 'all']).optional(),
    limit: zod_1.z.number().int().positive().optional()
});
// Convert the Express handlers to MCP handlers
exports.donkiParamsSchema = DonkiSchema;
exports.marsRoverParamsSchema = MarsRoverSchema;
exports.eonetParamsSchema = EonetSchema;
exports.scoutParamsSchema = ScoutSchema;
/**
 * Setup MCP handlers for NASA APIs
 * Note: With our new architecture, the actual CallToolRequestSchema handler is now
 * in the main index.ts file. This function simply registers the handlers for
 * validating parameters, but doesn't need to handle the actual tool execution.
 */
function setupHandlers(context) {
    // Our new architecture already handles the tool calls
    // This function is now mostly a placeholder, but could be used 
    // for additional server setup if needed
    var _this = this;
    // Register notifications handler if needed
    context.setRequestHandler(zod_1.z.object({ method: zod_1.z.literal("nasa/subscribe") }), function (request) { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            console.log("Subscription request received", request);
            return [2 /*return*/, { success: true }];
        });
    }); });
}
