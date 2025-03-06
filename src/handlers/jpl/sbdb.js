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
exports.sbdbParamsSchema = void 0;
exports.jplSbdbHandler = jplSbdbHandler;
var zod_1 = require("zod");
var axios_1 = require("axios");
// Schema for validating JPL Small-Body Database request parameters
exports.sbdbParamsSchema = zod_1.z.object({
    sstr: zod_1.z.string().min(1),
    full_precision: zod_1.z.boolean().optional().default(false),
    solution_epoch: zod_1.z.string().optional(),
    orbit_class: zod_1.z.boolean().optional().default(false),
    body_type: zod_1.z.enum(['ast', 'com', 'all']).optional().default('all'),
    phys_par: zod_1.z.boolean().optional().default(false),
    close_approach: zod_1.z.boolean().optional().default(false),
    ca_time: zod_1.z.enum(['all', 'now', 'fut', 'past']).optional().default('all'),
    ca_dist: zod_1.z.enum(['au', 'ld', 'lu']).optional().default('au'),
    ca_tbl: zod_1.z.enum(['elem', 'approach']).optional().default('approach'),
    format: zod_1.z.enum(['json', 'xml']).optional().default('json')
});
/**
 * Handle requests for JPL's Small-Body Database
 */
function jplSbdbHandler(params) {
    return __awaiter(this, void 0, void 0, function () {
        var sstr, full_precision, solution_epoch, orbit_class, body_type, phys_par, close_approach, ca_time, ca_dist, ca_tbl, format, url, queryParams, response, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    sstr = params.sstr, full_precision = params.full_precision, solution_epoch = params.solution_epoch, orbit_class = params.orbit_class, body_type = params.body_type, phys_par = params.phys_par, close_approach = params.close_approach, ca_time = params.ca_time, ca_dist = params.ca_dist, ca_tbl = params.ca_tbl, format = params.format;
                    url = 'https://ssd-api.jpl.nasa.gov/sbdb.api';
                    queryParams = {
                        sstr: sstr
                    };
                    // Add optional parameters
                    if (full_precision)
                        queryParams.full_precision = full_precision ? 'yes' : 'no';
                    if (solution_epoch)
                        queryParams.solution_epoch = solution_epoch;
                    if (orbit_class)
                        queryParams.orbit_class = orbit_class ? 'yes' : 'no';
                    if (body_type !== 'all')
                        queryParams.body_type = body_type;
                    if (phys_par)
                        queryParams.phys_par = phys_par ? 'yes' : 'no';
                    if (close_approach)
                        queryParams.close_approach = close_approach ? 'yes' : 'no';
                    if (ca_time !== 'all')
                        queryParams.ca_time = ca_time;
                    if (ca_dist !== 'au')
                        queryParams.ca_dist = ca_dist;
                    if (ca_tbl !== 'approach')
                        queryParams.ca_tbl = ca_tbl;
                    if (format !== 'json')
                        queryParams.format = format;
                    return [4 /*yield*/, axios_1.default.get(url, { params: queryParams })];
                case 1:
                    response = _a.sent();
                    return [2 /*return*/, response.data];
                case 2:
                    error_1 = _a.sent();
                    console.error('Error in JPL SBDB handler:', error_1);
                    if (error_1.name === 'ZodError') {
                        throw new Error("Invalid request parameters: ".concat(error_1.message));
                    }
                    throw new Error("API error: ".concat(error_1.message));
                case 3: return [2 /*return*/];
            }
        });
    });
}
