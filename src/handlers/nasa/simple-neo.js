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
exports.neoParamsSchema = void 0;
exports.simpleNeoHandler = simpleNeoHandler;
var zod_1 = require("zod");
var api_client_1 = require("../../utils/api-client");
var index_js_1 = require("../../index.js");
// Schema for validating NEO request parameters
exports.neoParamsSchema = zod_1.z.object({
    start_date: zod_1.z.string().optional(),
    end_date: zod_1.z.string().optional(),
    asteroid_id: zod_1.z.string().optional()
});
/**
 * Simplified NEO handler to avoid TypeScript issues
 */
function simpleNeoHandler(params) {
    return __awaiter(this, void 0, void 0, function () {
        var endpoint, result_1, startDate, endDate, today, result, resourceId, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 4, , 5]);
                    if (!params.asteroid_id) return [3 /*break*/, 2];
                    endpoint = "/neo/rest/v1/neo/".concat(params.asteroid_id);
                    return [4 /*yield*/, (0, api_client_1.nasaApiRequest)(endpoint, {})];
                case 1:
                    result_1 = _a.sent();
                    // Store the result as a resource
                    (0, index_js_1.addResource)("nasa://neo/".concat(params.asteroid_id), {
                        name: "Asteroid: ".concat(result_1.name),
                        mimeType: 'application/json',
                        text: JSON.stringify(result_1, null, 2)
                    });
                    // Return formatted result
                    return [2 /*return*/, {
                            content: [
                                {
                                    type: "text",
                                    text: formatSingleAsteroidText(result_1)
                                }
                            ],
                            isError: false
                        }];
                case 2:
                    startDate = params.start_date;
                    endDate = params.end_date;
                    if (!startDate) {
                        today = new Date();
                        startDate = today.toISOString().split('T')[0];
                    }
                    // If no end_date, use start_date (same day)
                    if (!endDate) {
                        endDate = startDate;
                    }
                    return [4 /*yield*/, (0, api_client_1.nasaApiRequest)('/neo/rest/v1/feed', {
                            start_date: startDate,
                            end_date: endDate
                        })];
                case 3:
                    result = _a.sent();
                    resourceId = "neo-feed-".concat(startDate, "-").concat(endDate);
                    (0, index_js_1.addResource)("nasa://neo/feed/".concat(resourceId), {
                        name: "NEO Feed: ".concat(startDate, " to ").concat(endDate),
                        mimeType: 'application/json',
                        text: JSON.stringify(result, null, 2)
                    });
                    // Return formatted result
                    return [2 /*return*/, {
                            content: [
                                {
                                    type: "text",
                                    text: formatNeoFeedText(result, startDate, endDate)
                                }
                            ],
                            isError: false
                        }];
                case 4:
                    error_1 = _a.sent();
                    console.error('Error in NEO handler:', error_1);
                    return [2 /*return*/, {
                            content: [
                                {
                                    type: "text",
                                    text: "Error retrieving NEO data: ".concat(error_1 instanceof Error ? error_1.message : String(error_1))
                                }
                            ],
                            isError: true
                        }];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * Format text for a single asteroid
 */
function formatSingleAsteroidText(asteroid) {
    // Create a summary with the most important information
    var text = "# Asteroid: ".concat(asteroid.name, "\n\n");
    text += "**NEO Reference ID:** ".concat(asteroid.id, "\n");
    text += "**Potentially Hazardous:** ".concat(asteroid.is_potentially_hazardous_asteroid ? '⚠️ YES' : 'No', "\n");
    // Add diameter info if available
    if (asteroid.estimated_diameter && asteroid.estimated_diameter.kilometers) {
        var min = asteroid.estimated_diameter.kilometers.estimated_diameter_min.toFixed(3);
        var max = asteroid.estimated_diameter.kilometers.estimated_diameter_max.toFixed(3);
        text += "**Estimated Diameter:** ".concat(min, " - ").concat(max, " km\n");
    }
    // Add close approach data if available
    if (asteroid.close_approach_data && asteroid.close_approach_data.length > 0) {
        text += "\n## Close Approaches\n\n";
        // Only show the first 5 approaches
        var approachesToShow = asteroid.close_approach_data.slice(0, 5);
        for (var _i = 0, approachesToShow_1 = approachesToShow; _i < approachesToShow_1.length; _i++) {
            var approach = approachesToShow_1[_i];
            text += "- **Date:** ".concat(approach.close_approach_date, "\n");
            // Add distance if available
            if (approach.miss_distance) {
                var kmDistance = parseFloat(approach.miss_distance.kilometers).toLocaleString();
                var lunarDistance = parseFloat(approach.miss_distance.lunar).toFixed(2);
                text += "  **Distance:** ".concat(kmDistance, " km (").concat(lunarDistance, " lunar distances)\n");
            }
            // Add velocity if available
            if (approach.relative_velocity) {
                var kps = parseFloat(approach.relative_velocity.kilometers_per_second).toFixed(2);
                text += "  **Relative Velocity:** ".concat(kps, " km/s\n");
            }
            text += "\n";
        }
        // Indicate if there are more approaches not shown
        if (asteroid.close_approach_data.length > 5) {
            text += "\n*...and ".concat(asteroid.close_approach_data.length - 5, " more close approaches*\n");
        }
    }
    return text;
}
/**
 * Format text for NEO feed data
 */
function formatNeoFeedText(data, startDate, endDate) {
    // Create a summary for the response
    var text = "# Near Earth Objects (".concat(startDate, " to ").concat(endDate, ")\n\n");
    text += "**Total Objects Found:** ".concat(data.element_count, "\n\n");
    // Process all days in the feed to gather stats
    var hazardousCount = 0;
    var closestApproachInfo = null;
    var closestApproachDistance = Number.MAX_VALUE;
    var largestObjectInfo = null;
    var largestObjectDiameter = 0;
    // Process all days in the feed
    for (var _i = 0, _a = Object.keys(data.near_earth_objects); _i < _a.length; _i++) {
        var date = _a[_i];
        var asteroids = data.near_earth_objects[date];
        for (var _b = 0, asteroids_1 = asteroids; _b < asteroids_1.length; _b++) {
            var asteroid = asteroids_1[_b];
            // Count hazardous
            if (asteroid.is_potentially_hazardous_asteroid) {
                hazardousCount++;
            }
            // Track closest approach
            if (asteroid.close_approach_data && asteroid.close_approach_data.length > 0) {
                var approach = asteroid.close_approach_data[0];
                var distance = parseFloat(approach.miss_distance.kilometers);
                if (distance < closestApproachDistance) {
                    closestApproachDistance = distance;
                    closestApproachInfo = {
                        name: asteroid.name,
                        id: asteroid.id,
                        date: approach.close_approach_date,
                        distance: distance
                    };
                }
            }
            // Track largest object
            if (asteroid.estimated_diameter && asteroid.estimated_diameter.kilometers) {
                var maxDiameter = asteroid.estimated_diameter.kilometers.estimated_diameter_max;
                if (maxDiameter > largestObjectDiameter) {
                    largestObjectDiameter = maxDiameter;
                    largestObjectInfo = {
                        name: asteroid.name,
                        id: asteroid.id,
                        diameter: maxDiameter
                    };
                }
            }
        }
    }
    // Add summary stats
    text += "**Potentially Hazardous:** ".concat(hazardousCount, " asteroids\n\n");
    if (closestApproachInfo) {
        text += "**Closest Approach:** ".concat(closestApproachInfo.name, " (ID: ").concat(closestApproachInfo.id, ")\n");
        text += "  - Date: ".concat(closestApproachInfo.date, "\n");
        text += "  - Distance: ".concat(closestApproachInfo.distance.toLocaleString(), " km\n\n");
    }
    if (largestObjectInfo) {
        text += "**Largest Object:** ".concat(largestObjectInfo.name, " (ID: ").concat(largestObjectInfo.id, ")\n");
        text += "  - Estimated Max Diameter: ".concat(largestObjectInfo.diameter.toLocaleString(), " km\n\n");
    }
    // Add details for each day
    text += "## Daily Breakdown\n\n";
    // Sort dates chronologically
    var sortedDates = Object.keys(data.near_earth_objects).sort();
    for (var _c = 0, sortedDates_1 = sortedDates; _c < sortedDates_1.length; _c++) {
        var date = sortedDates_1[_c];
        var asteroids = data.near_earth_objects[date];
        text += "### ".concat(date, " - ").concat(asteroids.length, " objects\n\n");
        // Show hazardous asteroids first
        var hazardous = asteroids.filter(function (a) { return a.is_potentially_hazardous_asteroid; });
        if (hazardous.length > 0) {
            text += "**\u26A0\uFE0F Potentially Hazardous:**\n\n";
            for (var _d = 0, hazardous_1 = hazardous; _d < hazardous_1.length; _d++) {
                var asteroid = hazardous_1[_d];
                text += "- **".concat(asteroid.name, "** (ID: ").concat(asteroid.id, ")\n");
                // Add diameter info
                if (asteroid.estimated_diameter && asteroid.estimated_diameter.kilometers) {
                    var min = asteroid.estimated_diameter.kilometers.estimated_diameter_min.toFixed(3);
                    var max = asteroid.estimated_diameter.kilometers.estimated_diameter_max.toFixed(3);
                    text += "  - Diameter: ".concat(min, " - ").concat(max, " km\n");
                }
                // Add close approach info
                if (asteroid.close_approach_data && asteroid.close_approach_data.length > 0) {
                    var approach = asteroid.close_approach_data[0];
                    // Add distance
                    if (approach.miss_distance) {
                        var km = parseFloat(approach.miss_distance.kilometers).toLocaleString();
                        var lunar = parseFloat(approach.miss_distance.lunar).toFixed(2);
                        text += "  - Distance: ".concat(km, " km (").concat(lunar, " lunar distances)\n");
                    }
                    // Add velocity
                    if (approach.relative_velocity) {
                        var kps = parseFloat(approach.relative_velocity.kilometers_per_second).toFixed(2);
                        text += "  - Velocity: ".concat(kps, " km/s\n");
                    }
                }
                text += "\n";
            }
        }
        // Show non-hazardous asteroids (limit to 10 for brevity)
        var safe = asteroids.filter(function (a) { return !a.is_potentially_hazardous_asteroid; });
        if (safe.length > 0) {
            text += "**Other Objects:**\n\n";
            // Only show the first 10 non-hazardous objects
            var safeToShow = safe.slice(0, 10);
            for (var _e = 0, safeToShow_1 = safeToShow; _e < safeToShow_1.length; _e++) {
                var asteroid = safeToShow_1[_e];
                text += "- **".concat(asteroid.name, "** (ID: ").concat(asteroid.id, ")\n");
                // Add approach info if available
                if (asteroid.close_approach_data && asteroid.close_approach_data.length > 0) {
                    var approach = asteroid.close_approach_data[0];
                    if (approach.miss_distance) {
                        var km = parseFloat(approach.miss_distance.kilometers).toLocaleString();
                        text += "  - Distance: ".concat(km, " km\n");
                    }
                }
            }
            // Indicate if there are more objects not shown
            if (safe.length > 10) {
                text += "\n*...and ".concat(safe.length - 10, " more non-hazardous objects*\n");
            }
        }
        text += "\n";
    }
    return text;
}
