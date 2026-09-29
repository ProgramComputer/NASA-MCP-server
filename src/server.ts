import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { loadConfig, type ServerConfig } from './config';
import { findPrompt, missingPromptArguments, PROMPTS } from './prompts';
import { matchTemplate, RESOURCE_TEMPLATES } from './resource-templates';
import { DEFAULT_RESOURCE_LIMITS, ResourceStore, type ResourceStoreLimits } from './resources';
import { executeTool, type CallToolResult } from './tools/execute';
import { listTools, resolveTool, TOOL_DEFINITIONS, legacyAliases } from './tools/registry';
import type { ToolContext } from './tools/types';
import { ConfigurationError, ToolInputError, UpstreamError } from './util/errors';
import type { FetchLike } from './util/http';
import { redact } from './util/redact';
import { SERVER_VERSION } from './version';

/** JSON-RPC error code for an unknown resource (MCP specification). */
const RESOURCE_NOT_FOUND = -32002;

export interface CreateServerOptions {
  config?: ServerConfig;
  fetch?: FetchLike;
  now?: () => Date;
  resourceLimits?: ResourceStoreLimits;
  /** Send notifications/resources/list_changed (only meaningful for stateful transports). */
  notifyResourceChanges?: boolean;
  /** Diagnostics sink. Defaults to stderr; never stdout (reserved for stdio MCP messages). */
  logError?: (message: string) => void;
}

export interface NasaMcpServer {
  server: Server;
  resources: ResourceStore;
  context: ToolContext;
  callTool(name: string, args: unknown): Promise<CallToolResult>;
}

const defaultLogError = (message: string) => {
  process.stderr.write(`${redact(message)}\n`);
};

const argsSchema = z.record(z.string(), z.unknown()).optional();
const stringArgsSchema = z.record(z.string(), z.string()).optional();

/** Builds a fully configured MCP server. Has no side effects until connected to a transport. */
export function createNasaMcpServer(options: CreateServerOptions = {}): NasaMcpServer {
  const logError = options.logError ?? defaultLogError;
  const context: ToolContext = {
    config: options.config ?? loadConfig(),
    fetch: options.fetch ?? ((input, init) => fetch(input, init)),
    now: options.now ?? (() => new Date())
  };

  const server = new Server(
    { name: 'NASA MCP Server', version: SERVER_VERSION },
    {
      capabilities: {
        tools: { listChanged: false },
        resources: { listChanged: Boolean(options.notifyResourceChanges) },
        prompts: { listChanged: false },
        logging: {}
      },
      instructions:
        'Read-only access to public NASA and JPL APIs. nasa_cmr returns a compact envelope with next_cursor; continue a search by passing only the cursor.'
    }
  );

  const resources = new ResourceStore(options.resourceLimits ?? DEFAULT_RESOURCE_LIMITS, () => {
    if (options.notifyResourceChanges) {
      server.sendResourceListChanged().catch(() => undefined);
    }
  });

  const callTool = async (name: string, args: unknown): Promise<CallToolResult> => {
    const definition = resolveTool(name);
    if (!definition) {
      throw new McpError(ErrorCode.InvalidParams, `Unknown tool: ${name.slice(0, 128)}`);
    }
    return executeTool(definition, args, context, { resources, logError });
  };

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: listTools() }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => callTool(request.params.name, request.params.arguments));

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: resources.list().map((resource) => ({
      uri: resource.uri,
      name: resource.name,
      description: resource.description,
      mimeType: resource.mimeType,
      size: resource.size
    }))
  }));

  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
    resourceTemplates: RESOURCE_TEMPLATES.map((template) => ({
      uriTemplate: template.uriTemplate,
      name: template.name,
      title: template.title,
      description: template.description,
      mimeType: template.mimeType
    }))
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;
    const stored = resources.get(uri);
    if (stored) {
      return { contents: [{ uri, mimeType: stored.mimeType, text: stored.text }] };
    }
    const match = matchTemplate(uri);
    if (!match) {
      throw new McpError(RESOURCE_NOT_FOUND, `Resource not found: ${uri.slice(0, 256)}`);
    }
    try {
      const text = await match.template.read(match.params, context);
      return { contents: [{ uri, mimeType: match.template.mimeType, text: redact(text) }] };
    } catch (error) {
      if (error instanceof ToolInputError) throw new McpError(ErrorCode.InvalidParams, `Invalid resource URI: ${error.message}`);
      if (error instanceof ConfigurationError || error instanceof UpstreamError) {
        throw new McpError(ErrorCode.InternalError, redact(error.message));
      }
      throw error;
    }
  });

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: PROMPTS.map((prompt) => ({ name: prompt.name, description: prompt.description, arguments: prompt.arguments }))
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const prompt = findPrompt(request.params.name);
    if (!prompt) throw new McpError(ErrorCode.InvalidParams, `Unknown prompt: ${request.params.name.slice(0, 128)}`);
    const args = request.params.arguments ?? {};
    const missing = missingPromptArguments(prompt, args);
    if (missing.length) throw new McpError(ErrorCode.InvalidParams, `Missing required prompt arguments: ${missing.join(', ')}`);
    return {
      description: prompt.description,
      messages: [{ role: 'user' as const, content: { type: 'text' as const, text: prompt.message(args) } }]
    };
  });

  // Legacy (non-standard) entry points kept for existing clients. All of them
  // run through executeTool, so validation and defaults are identical.
  server.setRequestHandler(
    z.object({ method: z.literal('tools/manifest'), params: z.object({}).passthrough().optional() }),
    async () => ({
      apis: TOOL_DEFINITIONS.map((definition) => ({ name: definition.name, id: legacyAliases(definition.name)[0], description: definition.description }))
    })
  );

  server.setRequestHandler(
    z.object({
      method: z.literal('prompts/execute'),
      params: z.object({ name: z.string(), arguments: stringArgsSchema })
    }),
    async (request) => {
      const prompt = findPrompt(request.params.name);
      if (!prompt) throw new McpError(ErrorCode.InvalidParams, `Unknown prompt: ${request.params.name.slice(0, 128)}`);
      const args = request.params.arguments ?? {};
      const missing = missingPromptArguments(prompt, args);
      if (missing.length) throw new McpError(ErrorCode.InvalidParams, `Missing required prompt arguments: ${missing.join(', ')}`);
      return callTool(prompt.tool, prompt.toToolArgs(args));
    }
  );

  const legacyMethods = new Set<string>();
  for (const definition of TOOL_DEFINITIONS) {
    for (const method of [...legacyAliases(definition.name), ...(definition.aliases ?? [])].filter((alias) => alias.includes('/'))) {
      if (legacyMethods.has(method)) continue;
      legacyMethods.add(method);
      server.setRequestHandler(z.object({ method: z.literal(method), params: argsSchema }), async (request) =>
        executeTool(definition, stripMeta(request.params), context, { resources, logError })
      );
    }
  }

  return { server, resources, context, callTool };
}

function stripMeta(params: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!params) return {};
  const { _meta: _ignored, ...rest } = params;
  return rest;
}
