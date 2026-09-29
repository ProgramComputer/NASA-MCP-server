import { z } from 'zod';
import { defineTool, READ_ONLY_REMOTE } from '../../tools/types';
import { daysBetween, isoDate, todayUtc } from '../../util/validation';
import { boundedText, json, nasaApiGet, sourceInfo } from '../common';

const SERVICE = 'NASA NeoWs API';
const MAX_FEED_DAYS = 7;

export const neoInputSchema = z
  .strictObject({
    start_date: isoDate('Start date for the close-approach feed (YYYY-MM-DD). Defaults to today (UTC).').optional(),
    end_date: isoDate('End date (YYYY-MM-DD), at most 7 days after start_date. Defaults to start_date.').optional(),
    asteroid_id: z
      .string()
      .regex(/^\d+$/, 'must be a numeric NeoWs asteroid ID')
      .describe('Look up one asteroid by its NeoWs ID instead of the date feed.')
      .optional()
  })
  .superRefine((args, ctx) => {
    if (args.asteroid_id && (args.start_date || args.end_date)) {
      ctx.addIssue({ code: 'custom', message: 'asteroid_id cannot be combined with start_date/end_date' });
    }
    if (args.end_date && !args.start_date) {
      ctx.addIssue({ code: 'custom', path: ['end_date'], message: 'end_date requires start_date' });
    }
    if (args.start_date && args.end_date) {
      const span = daysBetween(args.start_date, args.end_date);
      if (span < 0) ctx.addIssue({ code: 'custom', path: ['end_date'], message: 'end_date must not be before start_date' });
      if (span > MAX_FEED_DAYS) {
        ctx.addIssue({ code: 'custom', path: ['end_date'], message: `the NeoWs feed is limited to ${MAX_FEED_DAYS} days` });
      }
    }
  });

/* eslint-disable @typescript-eslint/no-explicit-any -- NeoWs payloads are loosely typed upstream JSON */
function formatAsteroid(asteroid: any): string {
  const km = asteroid.estimated_diameter?.kilometers;
  const diameter =
    km && typeof km.estimated_diameter_min === 'number'
      ? `${km.estimated_diameter_min.toFixed(3)} - ${km.estimated_diameter_max.toFixed(3)} km`
      : 'unknown';
  let out = `# Asteroid: ${asteroid.name}\n\n`;
  out += `**NEO Reference ID:** ${asteroid.id}\n`;
  out += `**Potentially Hazardous:** ${asteroid.is_potentially_hazardous_asteroid ? 'YES' : 'NO'}\n`;
  out += `**Estimated Diameter:** ${diameter}\n`;
  const approaches: any[] = asteroid.close_approach_data ?? [];
  if (approaches.length) {
    out += `\n## Close Approaches (first ${Math.min(5, approaches.length)} of ${approaches.length})\n\n`;
    for (const ca of approaches.slice(0, 5)) {
      out += `- ${ca.close_approach_date}: ${Number(ca.miss_distance?.kilometers).toFixed(0)} km ` +
        `(${Number(ca.miss_distance?.lunar).toFixed(2)} LD), ${Number(ca.relative_velocity?.kilometers_per_second).toFixed(2)} km/s, orbiting ${ca.orbiting_body}\n`;
    }
  }
  return out;
}

function formatFeed(feed: any, start: string, end: string): string {
  const count = typeof feed.element_count === 'number' ? feed.element_count : 0;
  let out = `# Near Earth Objects (${start === end ? start : `${start} to ${end}`})\n\n**Found ${count} near-Earth objects**\n\n`;
  const byDate: Record<string, any[]> = feed.near_earth_objects ?? {};
  for (const date of Object.keys(byDate).sort()) {
    const objects = [...byDate[date]].sort((a, b) =>
      String(a.close_approach_data?.[0]?.close_approach_date_full ?? '').localeCompare(String(b.close_approach_data?.[0]?.close_approach_date_full ?? ''))
    );
    out += `## ${date} (${objects.length} objects)\n\n`;
    for (const neo of objects) {
      const km = neo.estimated_diameter?.kilometers;
      const ca = neo.close_approach_data?.[0] ?? {};
      out += `### ${neo.name} (ID: ${neo.id})\n`;
      out += `- Potentially Hazardous: ${neo.is_potentially_hazardous_asteroid ? 'YES' : 'NO'}\n`;
      if (km) out += `- Estimated Diameter: ${km.estimated_diameter_min?.toFixed(3)} - ${km.estimated_diameter_max?.toFixed(3)} km\n`;
      if (ca.close_approach_date_full) out += `- Closest Approach: ${ca.close_approach_date_full}\n`;
      if (ca.miss_distance) out += `- Miss Distance: ${Number(ca.miss_distance.kilometers).toFixed(0)} km (${Number(ca.miss_distance.lunar).toFixed(2)} LD)\n`;
      if (ca.relative_velocity) out += `- Relative Velocity: ${Number(ca.relative_velocity.kilometers_per_second).toFixed(2)} km/s\n`;
      out += '\n';
    }
  }
  return out;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const neoTool = defineTool({
  name: 'nasa_neo',
  title: 'NASA Near Earth Object Web Service',
  description:
    'Near-Earth asteroid close approaches from NASA NeoWs: a feed for up to 7 days (defaults to today, UTC) or a single asteroid by ID. Requires NASA_API_KEY.',
  inputSchema: neoInputSchema,
  annotations: READ_ONLY_REMOTE,
  async handler({ args, ctx }) {
    if (args.asteroid_id) {
      const response = await nasaApiGet(ctx, SERVICE, `/neo/rest/v1/neo/${encodeURIComponent(args.asteroid_id)}`, {});
      const data = response.json<Record<string, unknown>>();
      const source = sourceInfo(ctx, SERVICE, response.url);
      return {
        content: [boundedText(formatAsteroid(data), SERVICE, '')],
        resource: { name: `NEO ${args.asteroid_id}`, mimeType: 'application/json', text: json({ source, data }), source }
      };
    }
    const start = args.start_date ?? todayUtc(ctx.now());
    const end = args.end_date ?? start;
    const response = await nasaApiGet(ctx, SERVICE, '/neo/rest/v1/feed', { start_date: start, end_date: end });
    const data = response.json<Record<string, unknown>>();
    const source = sourceInfo(ctx, SERVICE, response.url);
    return {
      content: [boundedText(formatFeed(data, start, end), SERVICE, 'Request fewer days.')],
      resource: { name: `NEO feed ${start} to ${end}`, mimeType: 'application/json', text: json({ source, data }), source }
    };
  }
});
