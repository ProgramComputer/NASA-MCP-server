import { createHash } from 'node:crypto';
import type { SourceInfo } from './tools/types';
import { canonicalJson } from './util/validation';

export interface StoredResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  text: string;
  size: number;
  source: SourceInfo;
}

export interface ResourceStoreLimits {
  maxEntries: number;
  maxEntryBytes: number;
  maxTotalBytes: number;
}

export const DEFAULT_RESOURCE_LIMITS: ResourceStoreLimits = {
  maxEntries: 50,
  maxEntryBytes: 1024 * 1024,
  maxTotalBytes: 16 * 1024 * 1024
};

/**
 * URI for a tool result: the tool name plus a hash of the full canonical
 * arguments (query, format and pagination state), so different searches never
 * collide and repeating the same search replaces its own entry.
 */
export function resultResourceUri(tool: string, args: unknown): string {
  const digest = createHash('sha256').update(canonicalJson(args)).digest('hex').slice(0, 32);
  return `nasa-mcp://results/${tool}/${digest}`;
}

/**
 * Bounded, least-recently-written store of upstream results for one server
 * instance. Scope: a stdio session keeps one store for its lifetime; the
 * stateless HTTP transport creates a fresh store per request, so nothing is
 * shared between HTTP clients.
 */
export class ResourceStore {
  private readonly entries = new Map<string, StoredResource>();
  private totalBytes = 0;

  constructor(
    private readonly limits: ResourceStoreLimits = DEFAULT_RESOURCE_LIMITS,
    private readonly onChange?: () => void
  ) {}

  putToolResult(tool: string, args: unknown, resource: { name: string; mimeType: string; text: string; source: SourceInfo }): string | null {
    const uri = resultResourceUri(tool, args);
    const stored = this.put({
      uri,
      name: resource.name,
      description: `${tool} result from ${resource.source.service}, retrieved ${resource.source.retrieved_at}. Arguments: ${canonicalJson(args).slice(0, 500)}`,
      mimeType: resource.mimeType,
      text: resource.text,
      source: resource.source
    });
    return stored ? uri : null;
  }

  /** Returns false (and stores nothing) when the entry exceeds the per-entry limit. */
  put(resource: Omit<StoredResource, 'size'>): boolean {
    const size = Buffer.byteLength(resource.text, 'utf8');
    if (size > this.limits.maxEntryBytes) return false;
    this.remove(resource.uri);
    this.entries.set(resource.uri, { ...resource, size });
    this.totalBytes += size;
    while (this.entries.size > this.limits.maxEntries || this.totalBytes > this.limits.maxTotalBytes) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.remove(oldest);
    }
    this.onChange?.();
    return true;
  }

  get(uri: string): StoredResource | undefined {
    return this.entries.get(uri);
  }

  list(): StoredResource[] {
    return [...this.entries.values()];
  }

  get size(): number {
    return this.entries.size;
  }

  get bytes(): number {
    return this.totalBytes;
  }

  private remove(uri: string): void {
    const existing = this.entries.get(uri);
    if (existing) {
      this.entries.delete(uri);
      this.totalBytes -= existing.size;
    }
  }
}
