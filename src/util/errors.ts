/** Caller-correctable problem with tool arguments. */
export class ToolInputError extends Error {
  constructor(message: string, readonly issues: string[] = []) {
    super(message);
    this.name = 'ToolInputError';
  }
}

/** Required server configuration (such as an API key) is missing or invalid. */
export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export type UpstreamErrorKind =
  | 'http'
  | 'rate_limited'
  | 'timeout'
  | 'network'
  | 'too_large'
  | 'invalid_response'
  | 'unavailable';

/**
 * Failure talking to a NASA/JPL service. Messages are built from redacted
 * inputs only, so they are safe to return to MCP clients.
 */
export class UpstreamError extends Error {
  constructor(
    readonly service: string,
    readonly kind: UpstreamErrorKind,
    message: string,
    readonly status?: number,
    readonly retryAfterSeconds?: number
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}
