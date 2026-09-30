import { z } from 'zod';
import { defineTool, READ_ONLY_REMOTE } from '../../tools/types';
import { boundedText, json, nasaApiGet, sourceInfo, text } from '../common';

const SERVICE = 'NASA InSight Mars Weather API';

export const insightInputSchema = z.strictObject({});

interface SensorSummary {
  av?: number;
  mn?: number;
  mx?: number;
  ct?: number;
}

interface SolWeather {
  AT?: SensorSummary;
  HWS?: SensorSummary;
  PRE?: SensorSummary;
  WD?: { most_common?: { compass_point?: string; compass_degrees?: number } | null };
  First_UTC?: string;
  Last_UTC?: string;
  Season?: string;
  Northern_season?: string;
  Southern_season?: string;
}

function summarize(sensor: SensorSummary | undefined, unit: string, digits: number): string {
  if (!sensor || typeof sensor.av !== 'number') return 'no valid data';
  const fmt = (value: number | undefined) => (typeof value === 'number' ? value.toFixed(digits) : '?');
  return `avg ${fmt(sensor.av)} ${unit} (min ${fmt(sensor.mn)}, max ${fmt(sensor.mx)})`;
}

function describeSol(sol: string, weather: SolWeather): string {
  const period = [weather.First_UTC?.slice(0, 10), weather.Last_UTC?.slice(0, 10)].filter(Boolean).join(' to ');
  const seasons = [weather.Northern_season && `northern ${weather.Northern_season}`, weather.Southern_season && `southern ${weather.Southern_season}`].filter(Boolean).join(', ');
  const wind = weather.WD?.most_common;
  return [
    `## Sol ${sol}${period ? ` (${period} UTC)` : ''}`,
    ...(seasons ? [`Season: ${seasons}`] : []),
    `Air temperature: ${summarize(weather.AT, '°C', 1)}`,
    `Pressure: ${summarize(weather.PRE, 'Pa', 1)}`,
    `Horizontal wind speed: ${summarize(weather.HWS, 'm/s', 1)}`,
    `Most common wind direction: ${wind?.compass_point ? `from ${wind.compass_point} (${wind.compass_degrees}°)` : 'no valid data'}`
  ].join('\n');
}

export const insightTool = defineTool({
  name: 'nasa_insight_weather',
  title: 'NASA InSight Mars weather (historical)',
  description:
    "HISTORICAL DATA ONLY: per-sol Mars surface weather (air temperature, pressure, wind) from NASA's InSight lander at Elysium Planitia. " +
    'The feed is frozen at the last seven sols it reported (sols 675-681, October 2020) and is no longer updated. Requires NASA_API_KEY.',
  inputSchema: insightInputSchema,
  annotations: READ_ONLY_REMOTE,
  async handler({ ctx }) {
    const response = await nasaApiGet(ctx, SERVICE, '/insight_weather/', { feedtype: 'json', ver: '1.0' });
    const data = response.json<Record<string, unknown> & { sol_keys?: string[] }>();
    const source = sourceInfo(ctx, SERVICE, response.url);
    const sols = Array.isArray(data.sol_keys) ? data.sol_keys.filter((sol) => data[sol] && typeof data[sol] === 'object') : [];
    const last = sols.at(-1);
    const lastDate = last ? (data[last] as SolWeather).Last_UTC?.slice(0, 10) : undefined;
    const notice =
      'HISTORICAL DATA: the InSight weather feed is no longer updated (the api.nasa.gov catalog lists it as last updated 2021-03-30). ' +
      (last ? `Its latest sol is ${last}${lastDate ? `, ending ${lastDate}` : ''}.` : 'It returned no sols.') +
      ' Temperatures are °C, pressure Pa, wind speed m/s.';
    const body = sols.map((sol) => describeSol(sol, data[sol] as SolWeather)).join('\n\n');
    return {
      content: [text(notice), ...(body ? [boundedText(body, SERVICE, '')] : [])],
      resource: { name: 'InSight Mars weather (historical)', mimeType: 'application/json', text: json({ source, data }), source }
    };
  }
});
