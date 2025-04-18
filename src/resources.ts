export interface Resource {
  name: string;
  mimeType: string;
  text?: string;
  blob?: Uint8Array;
}

// Central registry of resources
export const resources = new Map<string, Resource>();

// Add or replace a resource in the registry
export function addResource(uri: string, resource: Resource) {
  resources.set(uri, resource);
} 