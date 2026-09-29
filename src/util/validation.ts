import { z } from 'zod';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar date written as YYYY-MM-DD. */
export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export const isoDate = (description: string) =>
  z.string().refine(isIsoDate, { message: 'must be a valid calendar date in YYYY-MM-DD format' }).describe(description);

/** Whole days between two YYYY-MM-DD dates (end - start). */
export function daysBetween(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
}

export function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Formats a coordinate for a query string without rounding it; avoids the
 * exponent notation that String() produces for very small magnitudes.
 */
export function formatNumber(value: number): string {
  const text = String(value);
  if (!/e/i.test(text)) return text;
  return value.toFixed(20).replace(/0+$/, '').replace(/\.$/, '');
}

export type BoundingBox = readonly [west: number, south: number, east: number, north: number];

function parseNumberList(value: string): number[] | null {
  const parts = value.split(',').map((part) => part.trim());
  if (parts.some((part) => part === '' || !/^[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/.test(part))) return null;
  return parts.map(Number);
}

/**
 * Bounding box as "west,south,east,north" (or a 4-number array) in decimal
 * degrees. West may exceed east to express an antimeridian crossing; callers
 * decide whether their upstream supports that.
 */
export const boundingBoxSchema = z
  .union([z.string(), z.array(z.number()).length(4)])
  .transform((value, ctx): BoundingBox => {
    const numbers = typeof value === 'string' ? parseNumberList(value) : value;
    if (!numbers || numbers.length !== 4 || numbers.some((n) => !Number.isFinite(n))) {
      ctx.addIssue({ code: 'custom', message: 'must be four numbers: west,south,east,north' });
      return z.NEVER;
    }
    const [west, south, east, north] = numbers;
    const problems: string[] = [];
    if (west < -180 || west > 180) problems.push('west must be within [-180, 180]');
    if (east < -180 || east > 180) problems.push('east must be within [-180, 180]');
    if (south < -90 || south > 90) problems.push('south must be within [-90, 90]');
    if (north < -90 || north > 90) problems.push('north must be within [-90, 90]');
    if (south > north) problems.push('south must not be greater than north (coordinate order is west,south,east,north)');
    if (problems.length) {
      ctx.addIssue({ code: 'custom', message: problems.join('; ') });
      return z.NEVER;
    }
    return [west, south, east, north] as const;
  });

export function formatBoundingBox(box: BoundingBox): string {
  return box.map(formatNumber).join(',');
}

/** Parses a comma-separated coordinate list into lon/lat pairs, or null. */
export function parseCoordinatePairs(value: string): Array<[number, number]> | null {
  const numbers = parseNumberList(value);
  if (!numbers || numbers.length % 2 !== 0) return null;
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < numbers.length; i += 2) pairs.push([numbers[i], numbers[i + 1]]);
  return pairs;
}

export function isValidLonLat([lon, lat]: [number, number]): boolean {
  return Number.isFinite(lon) && Number.isFinite(lat) && lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90;
}

/** Stable JSON serialization with sorted object keys (for hashing/comparison). */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
