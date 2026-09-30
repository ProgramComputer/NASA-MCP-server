import { z } from 'zod';
import { apodTool } from '../handlers/nasa/apod';
import { cmrTool } from '../handlers/nasa/cmr';
import { donkiTool } from '../handlers/nasa/donki';
import { eonetTool } from '../handlers/nasa/eonet';
import { epicTool } from '../handlers/nasa/epic';
import { exoplanetTool } from '../handlers/nasa/exoplanet';
import { firmsTool } from '../handlers/nasa/firms';
import { gibsTool } from '../handlers/nasa/gibs';
import { imagesTool } from '../handlers/nasa/images';
import { insightTool } from '../handlers/nasa/insight';
import { marsRoverTool } from '../handlers/nasa/mars_rover';
import { neoTool } from '../handlers/nasa/neo';
import { osdrFilesTool } from '../handlers/nasa/osdr_files';
import { powerTool } from '../handlers/nasa/power';
import { sscLocationsTool, sscObservatoriesTool } from '../handlers/nasa/ssc';
import { techportTool } from '../handlers/nasa/techport';
import { techTransferTool } from '../handlers/nasa/techtransfer';
import { tleTool } from '../handlers/nasa/tle';
import { trekLayersTool, trekTileTool } from '../handlers/nasa/trek';
import { cadTool } from '../handlers/jpl/cad';
import { fireballTool } from '../handlers/jpl/fireball';
import { horizonsFileTool, horizonsTool } from '../handlers/jpl/horizons';
import { jdCalTool } from '../handlers/jpl/jd_cal';
import { missionDesignTool } from '../handlers/jpl/mission_design';
import { nhatsTool } from '../handlers/jpl/nhats';
import { periodicOrbitsTool } from '../handlers/jpl/periodic_orbits';
import { sbdbTool } from '../handlers/jpl/sbdb';
import { scoutTool } from '../handlers/jpl/scout';
import { sentryTool } from '../handlers/jpl/sentry';
import type { ToolDefinition } from './types';

/**
 * The single allowlist of tools. tools/list, validation and dispatch are all
 * derived from these definitions; nothing is resolved from caller input.
 */
export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  apodTool,
  neoTool,
  epicTool,
  gibsTool,
  cmrTool,
  firmsTool,
  imagesTool,
  exoplanetTool,
  donkiTool,
  marsRoverTool,
  eonetTool,
  powerTool,
  osdrFilesTool,
  insightTool,
  tleTool,
  sscObservatoriesTool,
  sscLocationsTool,
  techportTool,
  techTransferTool,
  trekLayersTool,
  trekTileTool,
  sbdbTool,
  fireballTool,
  jdCalTool,
  nhatsTool,
  cadTool,
  sentryTool,
  horizonsTool,
  horizonsFileTool,
  periodicOrbitsTool,
  scoutTool,
  missionDesignTool
] as ToolDefinition[];

/**
 * Legacy spellings accepted by earlier releases and documented in the README:
 * "nasa/apod" (slash) and "nasa/mars-rover" (slash + hyphen) for "nasa_apod"
 * and "nasa_mars_rover". Generated once from the canonical names.
 */
export function legacyAliases(canonical: string): string[] {
  const separator = canonical.indexOf('_');
  const namespace = canonical.slice(0, separator);
  const rest = canonical.slice(separator + 1);
  return [`${namespace}/${rest}`, `${namespace}/${rest.replace(/_/g, '-')}`];
}

function buildNameIndex(definitions: readonly ToolDefinition[]): Map<string, ToolDefinition> {
  const index = new Map<string, ToolDefinition>();
  for (const definition of definitions) {
    const names = new Set([definition.name, ...legacyAliases(definition.name), ...(definition.aliases ?? [])]);
    for (const name of names) {
      const existing = index.get(name);
      if (existing && existing !== definition) {
        throw new Error(`Tool name collision: "${name}" maps to both ${existing.name} and ${definition.name}`);
      }
      index.set(name, definition);
    }
  }
  return index;
}

const NAME_INDEX = buildNameIndex(TOOL_DEFINITIONS);

/** Resolves a canonical name or documented alias; undefined for anything else. */
export function resolveTool(name: string): ToolDefinition | undefined {
  return NAME_INDEX.get(name);
}

/** All accepted names (canonical and aliases) for documentation and tests. */
export function acceptedNames(): Map<string, string> {
  return new Map([...NAME_INDEX].map(([name, definition]) => [name, definition.name]));
}

function toJsonSchema(schema: z.ZodType, io: 'input' | 'output'): Record<string, unknown> {
  const generated = z.toJSONSchema(schema, { io, target: 'draft-2020-12', unrepresentable: 'any' }) as Record<string, unknown>;
  delete generated.$schema;
  return generated;
}

export interface ListedTool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

let listedCache: ListedTool[] | undefined;

/** tools/list payload, generated from the same schemas used for validation. */
export function listTools(): ListedTool[] {
  listedCache ??= TOOL_DEFINITIONS.map((definition) => ({
    name: definition.name,
    title: definition.title,
    description: definition.description,
    inputSchema: toJsonSchema(definition.inputSchema, 'input'),
    ...(definition.outputSchema ? { outputSchema: toJsonSchema(definition.outputSchema, 'output') } : {}),
    ...(definition.annotations ? { annotations: { title: definition.title, ...definition.annotations } } : {})
  }));
  return listedCache;
}
