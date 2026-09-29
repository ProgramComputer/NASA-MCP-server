import { z } from 'zod';
import type { ResourceStore } from '../resources';
import { ConfigurationError, ToolInputError, UpstreamError } from '../util/errors';
import { redact, redactDeep } from '../util/redact';
import type { ToolContent, ToolContext, ToolDefinition } from './types';

export interface CallToolResult {
  [key: string]: unknown;
  content: ToolContent[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

function errorResult(message: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: redact(message) }] };
}

function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length ? issue.path.join('.') : '(arguments)';
    if (issue.code === 'unrecognized_keys') return `unknown parameter(s): ${issue.keys.join(', ')}`;
    return `${path}: ${issue.message}`;
  });
}

export interface ExecuteOptions {
  resources?: ResourceStore;
  logError?: (message: string) => void;
}

/**
 * The one execution path for every entry point (tools/call, legacy methods,
 * prompts, resource templates): validate and apply defaults, run the handler,
 * map failures to MCP tool-execution errors, redact, and retain resources.
 */
export async function executeTool(
  definition: ToolDefinition,
  rawArgs: unknown,
  ctx: ToolContext,
  options: ExecuteOptions = {}
): Promise<CallToolResult> {
  const args = rawArgs ?? {};
  if (typeof args !== 'object' || Array.isArray(args)) {
    return errorResult(`Invalid arguments for ${definition.name}: arguments must be a JSON object.`);
  }
  const provided = new Set(Object.keys(args).filter((key) => (args as Record<string, unknown>)[key] !== undefined));

  const retired = Object.entries(definition.retiredParameters ?? {}).filter(([key]) => provided.has(key));
  if (retired.length) {
    return errorResult(`Invalid arguments for ${definition.name}: ${retired.map(([key, message]) => `${key}: ${message}`).join(' ')}`);
  }

  const parsed = definition.inputSchema.safeParse(args);
  if (!parsed.success) {
    return errorResult(`Invalid arguments for ${definition.name}: ${formatIssues(parsed.error).join('; ')}`);
  }

  try {
    const output = await definition.handler({ args: parsed.data, provided, ctx });
    const result: CallToolResult = { content: redactDeep(output.content) };
    if (output.structuredContent) result.structuredContent = redactDeep(output.structuredContent);
    if (output.isError) result.isError = true;
    if (output.resource && options.resources && !output.isError) {
      options.resources.putToolResult(definition.name, parsed.data, redactDeep(output.resource));
    }
    return result;
  } catch (error) {
    if (error instanceof ToolInputError) {
      return errorResult(`Invalid arguments for ${definition.name}: ${error.message}`);
    }
    if (error instanceof ConfigurationError) {
      return errorResult(`Configuration error: ${error.message}`);
    }
    if (error instanceof UpstreamError) {
      return errorResult(error.message);
    }
    const detail = error instanceof Error ? error.message : String(error);
    options.logError?.(`Unexpected error in ${definition.name}: ${redact(detail)}`);
    return errorResult(`Unexpected error in ${definition.name}: ${detail}`);
  }
}
