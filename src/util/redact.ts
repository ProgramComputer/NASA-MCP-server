const REDACTED = '[REDACTED]';

const registeredSecrets = new Set<string>();

/**
 * Registers a credential value so it is scrubbed from every string passed
 * through {@link redact}. Values shorter than 6 characters are ignored to avoid
 * mangling ordinary text.
 */
export function registerSecret(value: string | undefined): void {
  if (value && value.length >= 6) {
    registeredSecrets.add(value);
  }
}

/** Test hook: forget registered secrets. */
export function clearRegisteredSecrets(): void {
  registeredSecrets.clear();
}

const PATTERNS: Array<[RegExp, string]> = [
  // api.nasa.gov style query parameter
  [/([?&]api_key=)[^&#\s"']+/gi, `$1${REDACTED}`],
  // FIRMS puts the MAP_KEY in the path: /api/<kind>/<format>/<MAP_KEY>/...
  [/(\/api\/(?:area|country|data_availability|kml_fire_footprints)\/(?:csv|kml)?\/?)[A-Za-z0-9]{16,64}(?=\/|$)/g, `$1${REDACTED}`],
  [/(MAP_KEY=)[^&#\s"']+/gi, `$1${REDACTED}`],
  [/(NASA_API_KEY=)[^&#\s"']+/gi, `$1${REDACTED}`],
  [/(FIRMS_MAP_KEY=)[^&#\s"']+/gi, `$1${REDACTED}`]
];

/** Removes credentials from arbitrary text (URLs, error messages, logs). */
export function redact(text: string): string {
  let out = text;
  for (const secret of registeredSecrets) {
    out = out.split(secret).join(REDACTED);
  }
  for (const [pattern, replacement] of PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

/** Recursively redacts every string inside a JSON-compatible value. */
export function redactDeep<T>(value: T): T {
  if (typeof value === 'string') {
    return redact(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactDeep(item)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = redactDeep(item);
    }
    return out as T;
  }
  return value;
}
