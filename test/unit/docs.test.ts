import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { resolveTool } from '../../src/tools/registry';

const repoRoot = join(__dirname, '..', '..', '..');

function jsonBlocks(markdown: string): string[] {
  return [...markdown.matchAll(/```json\n([\s\S]*?)\n```/g)].map((match) => match[1]);
}

describe('documentation examples', () => {
  it('every tools/call example in docs/inspector-test-examples.md passes tool validation', () => {
    const blocks = jsonBlocks(readFileSync(join(repoRoot, 'docs', 'inspector-test-examples.md'), 'utf8').replace(/\r\n/g, '\n'));
    assert.ok(blocks.length >= 20);
    const covered = new Set<string>();
    for (const block of blocks) {
      const { name, arguments: args } = JSON.parse(block) as { name: string; arguments: Record<string, unknown> };
      const tool = resolveTool(name);
      assert.ok(tool, `unknown tool ${name}`);
      covered.add(tool.name);
      if (typeof args.cursor === 'string' && args.cursor.includes('<paste')) continue;
      const result = tool.inputSchema.safeParse(args);
      assert.ok(result.success, `${name} example is invalid: ${JSON.stringify(result.error?.issues)}`);
    }
    assert.ok(covered.size >= 20, `examples cover ${covered.size} tools`);
  });

  it('README examples use tool names that exist', () => {
    const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8');
    for (const [, name] of readme.matchAll(/`((?:nasa|jpl)_[a-z_]+)`/g)) {
      assert.ok(resolveTool(name), `README mentions unknown tool ${name}`);
    }
  });
});
