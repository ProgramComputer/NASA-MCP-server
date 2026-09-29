import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { z } from 'zod';
import { executeTool } from '../../src/tools/execute';
import { acceptedNames, legacyAliases, listTools, resolveTool, TOOL_DEFINITIONS } from '../../src/tools/registry';
import { defineTool, type ToolDefinition } from '../../src/tools/types';
import { testContext, textOf } from '../helpers/context';
import { fakeFetch } from '../helpers/fake-fetch';

const EXPECTED_TOOLS = [
  'nasa_apod', 'nasa_neo', 'nasa_epic', 'nasa_gibs', 'nasa_cmr', 'nasa_firms', 'nasa_images', 'nasa_exoplanet', 'nasa_donki',
  'nasa_mars_rover', 'nasa_eonet', 'nasa_power', 'nasa_osdr_files', 'jpl_sbdb', 'jpl_fireball', 'jpl_jd_cal', 'jpl_nhats',
  'jpl_cad', 'jpl_sentry', 'jpl_horizons', 'jpl_horizons_file', 'jpl_periodic_orbits', 'jpl_scout'
];

describe('tool registry', () => {
  it('advertises every tool from 1.0.14 exactly once, in a stable order', () => {
    const names = listTools().map((tool) => tool.name);
    assert.deepEqual([...names].sort(), [...EXPECTED_TOOLS].sort());
    assert.equal(new Set(names).size, names.length);
    assert.deepEqual(listTools().map((t) => t.name), names);
  });

  it('resolves every advertised tool and its documented aliases', () => {
    for (const tool of listTools()) {
      assert.equal(resolveTool(tool.name)?.name, tool.name);
      for (const alias of legacyAliases(tool.name)) assert.equal(resolveTool(alias)?.name, tool.name, alias);
    }
    assert.equal(resolveTool('nasa/mars-rover')?.name, 'nasa_mars_rover');
    assert.equal(resolveTool('nasa/mars_rover')?.name, 'nasa_mars_rover');
    assert.equal(resolveTool('jpl/jd_cal')?.name, 'jpl_jd_cal');
    assert.equal(resolveTool('nasa/apod')?.name, 'nasa_apod');
  });

  it('rejects unknown names, including path-like input', () => {
    for (const name of ['nasa_nope', 'nasa/../../index', '../handlers/nasa/apod', 'nasa_earth', '', 'constructor', '__proto__']) {
      assert.equal(resolveTool(name), undefined, name);
    }
  });

  it('never lists aliases as separate tools', () => {
    const listed = new Set(listTools().map((t) => t.name));
    const aliasOnly = [...acceptedNames().keys()].filter((name) => !listed.has(name));
    assert.ok(aliasOnly.length > 0);
    for (const alias of aliasOnly) assert.ok(alias.includes('/') || alias.includes('-'), alias);
  });

  it('generates valid object input schemas with annotations from the runtime schemas', () => {
    for (const tool of listTools()) {
      assert.equal(tool.inputSchema.type, 'object', tool.name);
      assert.equal(tool.inputSchema.additionalProperties, false, `${tool.name} should reject unknown parameters`);
      assert.ok(tool.description.length > 20, tool.name);
      assert.equal(tool.annotations?.readOnlyHint, true, tool.name);
      assert.equal(tool.annotations?.destructiveHint, false, tool.name);
      assert.equal(tool.annotations?.openWorldHint, true, tool.name);
      assert.equal('$schema' in tool.inputSchema, false);
    }
    const cmr = listTools().find((t) => t.name === 'nasa_cmr')!;
    const props = cmr.inputSchema.properties as Record<string, { default?: unknown }>;
    assert.equal(props.search_type.default, 'collections');
    assert.equal(props.format.default, 'json');
    assert.equal(props.limit.default, 10);
    assert.equal(cmr.inputSchema.required, undefined, 'keyword is optional');
    for (const filter of ['bounding_box', 'bbox', 'collection_concept_id', 'temporal', 'platform', 'instrument', 'project', 'processing_level_id', 'granule_data_format', 'downloadable', 'browsable', 'include_facets', 'sort_key', 'cursor', 'fields', 'response_mode']) {
      assert.ok(filter in props, `nasa_cmr should advertise ${filter}`);
    }
    const withOutput = listTools().filter((t) => t.outputSchema).map((t) => t.name).sort();
    assert.deepEqual(withOutput, ['nasa_cmr', 'nasa_firms']);
  });

  it('keeps every required field in tools/list consistent with runtime validation', () => {
    for (const definition of TOOL_DEFINITIONS) {
      const listed = listTools().find((t) => t.name === definition.name)!;
      const required = (listed.inputSchema.required as string[] | undefined) ?? [];
      const empty = definition.inputSchema.safeParse({});
      if (required.length === 0) continue;
      assert.equal(empty.success, false, `${definition.name} lists required ${required.join(',')} but accepts {}`);
    }
  });
});

describe('executeTool', () => {
  const seen: unknown[] = [];
  const probe: ToolDefinition = defineTool({
    name: 'test_probe',
    title: 'probe',
    description: 'probe tool',
    inputSchema: z.strictObject({ q: z.string(), limit: z.int().min(1).max(5).default(3) }),
    retiredParameters: { old: 'old was removed; use q.' },
    async handler({ args, provided }) {
      seen.push({ args, provided: [...provided] });
      if (args.q === 'boom') throw new Error('kaboom with TESTNASAKEY0000000000000000000000000000AA inside');
      return { content: [{ type: 'text', text: `ok ${args.q} ${args.limit}` }] };
    }
  }) as ToolDefinition;

  it('applies defaults before the handler runs and reports provided keys', async () => {
    const ctx = testContext(fakeFetch([]).fetch);
    const result = await executeTool(probe, { q: 'x' }, ctx);
    assert.equal(textOf(result), 'ok x 3');
    assert.deepEqual(seen.at(-1), { args: { q: 'x', limit: 3 }, provided: ['q'] });
  });

  it('returns MCP tool errors for invalid, unknown and retired parameters without calling the handler', async () => {
    const ctx = testContext(fakeFetch([]).fetch);
    const before = seen.length;
    const cases: Array<[unknown, RegExp]> = [
      [{ q: 1 }, /q: .*string/i],
      [{ q: 'x', extra: 1 }, /unknown parameter\(s\): extra/],
      [{ q: 'x', limit: 9 }, /limit/],
      [{ q: 'x', old: 1 }, /old was removed; use q/],
      [[1, 2], /must be a JSON object/],
      ['str', /must be a JSON object/]
    ];
    for (const [args, pattern] of cases) {
      const result = await executeTool(probe, args, ctx);
      assert.equal(result.isError, true);
      assert.match(textOf(result), pattern);
    }
    assert.equal(seen.length, before);
  });

  it('turns handler exceptions into redacted tool errors', async () => {
    const ctx = testContext(fakeFetch([]).fetch);
    const logged: string[] = [];
    const result = await executeTool(probe, { q: 'boom' }, ctx, { logError: (m) => logged.push(m) });
    assert.equal(result.isError, true);
    assert.doesNotMatch(textOf(result), /TESTNASAKEY/);
    assert.match(textOf(result), /\[REDACTED\]/);
    assert.doesNotMatch(logged.join(''), /TESTNASAKEY/);
  });
});
