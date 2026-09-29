import type { z } from 'zod';
import type { ServerConfig } from '../config';
import type { FetchLike } from '../util/http';

export interface ToolContext {
  config: ServerConfig;
  fetch: FetchLike;
  now: () => Date;
}

export interface TextContent {
  type: 'text';
  text: string;
}

export interface ImageContent {
  type: 'image';
  data: string;
  mimeType: string;
}

export type ToolContent = TextContent | ImageContent;

/** Where a result came from; never contains credentials. */
export interface SourceInfo {
  service: string;
  url: string;
  retrieved_at: string;
}

export interface ToolOutput {
  content: ToolContent[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  /** Upstream data to retain as an MCP resource (subject to store limits). */
  resource?: {
    name: string;
    mimeType: string;
    text: string;
    source: SourceInfo;
  };
}

export interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface HandlerInput<T> {
  args: T;
  /** Top-level argument names the caller supplied explicitly. */
  provided: ReadonlySet<string>;
  ctx: ToolContext;
}

export interface ToolDefinition<S extends z.ZodType = z.ZodType> {
  /** Canonical name advertised in tools/list. */
  name: string;
  title: string;
  description: string;
  /** Extra accepted names beyond the generated slash/hyphen aliases. */
  aliases?: readonly string[];
  inputSchema: S;
  outputSchema?: z.ZodType;
  /**
   * Parameters that used to be advertised but never worked upstream; callers
   * get this migration message instead of a generic "unrecognized key".
   */
  retiredParameters?: Readonly<Record<string, string>>;
  annotations?: ToolAnnotations;
  handler: (input: HandlerInput<z.output<S>>) => Promise<ToolOutput>;
}

/** Every tool in this server only reads public data from remote services. */
export const READ_ONLY_REMOTE: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true
};

export function defineTool<S extends z.ZodType>(definition: ToolDefinition<S>): ToolDefinition<S> {
  return definition;
}
