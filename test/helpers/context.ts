import { DEFAULT_CMR_BASE_URL, type ServerConfig } from '../../src/config';
import type { ToolContext } from '../../src/tools/types';
import type { FetchLike } from '../../src/util/http';
import { clearRegisteredSecrets, registerSecret } from '../../src/util/redact';

export const TEST_NASA_KEY = 'TESTNASAKEY0000000000000000000000000000AA';
export const TEST_FIRMS_KEY = 'abcdef0123456789abcdef0123456789';
export const FIXED_NOW = new Date('2026-09-29T12:00:00.000Z');

export function testConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  const config: ServerConfig = {
    nasaApiKey: TEST_NASA_KEY,
    firmsMapKey: TEST_FIRMS_KEY,
    cmrBaseUrl: DEFAULT_CMR_BASE_URL,
    ...overrides
  };
  clearRegisteredSecrets();
  registerSecret(config.nasaApiKey);
  registerSecret(config.firmsMapKey);
  return config;
}

export function testContext(fetch: FetchLike, overrides: Partial<ServerConfig> = {}): ToolContext {
  return { config: testConfig(overrides), fetch, now: () => FIXED_NOW };
}

export function textOf(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content
    .filter((item) => item.type === 'text')
    .map((item) => item.text)
    .join('\n');
}
