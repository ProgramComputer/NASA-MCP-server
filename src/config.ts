import { registerSecret } from './util/redact';

export const DEFAULT_CMR_BASE_URL = 'https://cmr.earthdata.nasa.gov/search';

export interface ServerConfig {
  /** api.nasa.gov key: NEO, DONKI, InSight weather, Mars Rover Photos. */
  nasaApiKey?: string;
  /** FIRMS MAP_KEY (distinct from the api.nasa.gov key). */
  firmsMapKey?: string;
  /** CMR search root, without trailing slash. */
  cmrBaseUrl: string;
}

function argValue(argv: readonly string[], flag: string): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith(`${flag}=`)) return arg.slice(flag.length + 1);
    if (arg === flag && i + 1 < argv.length) return argv[i + 1];
  }
  return undefined;
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Validates an operator-supplied CMR root (for UAT/SIT or tests). Only HTTPS
 * is accepted, except plain HTTP on loopback hosts.
 */
export function parseCmrBaseUrl(value: string | undefined): string {
  if (!value) return DEFAULT_CMR_BASE_URL;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`NASA_MCP_CMR_URL is not a valid URL`);
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error('NASA_MCP_CMR_URL must use https (plain http is allowed only for localhost)');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('NASA_MCP_CMR_URL must not contain credentials, a query string, or a fragment');
  }
  return url.toString().replace(/\/+$/, '');
}

/**
 * Builds configuration from environment variables and CLI flags. Loading a
 * .env file is the caller's job (the CLI does it); this function has no side
 * effects besides registering credential values for redaction.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env, argv: readonly string[] = process.argv.slice(2)): ServerConfig {
  const config: ServerConfig = {
    nasaApiKey: clean(argValue(argv, '--nasa-api-key')) ?? clean(env.NASA_API_KEY),
    firmsMapKey: clean(argValue(argv, '--firms-map-key')) ?? clean(env.FIRMS_MAP_KEY),
    cmrBaseUrl: parseCmrBaseUrl(clean(env.NASA_MCP_CMR_URL))
  };
  registerSecret(config.nasaApiKey);
  registerSecret(config.firmsMapKey);
  return config;
}
