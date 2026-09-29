// prepack guard: refuse to pack a missing or contaminated dist/.
// npm pack/publish of a folder runs this; publishing a pre-built tarball does not.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const problems = [];

if (!existsSync(join(dist, 'index.js'))) {
  problems.push('dist/index.js is missing: run `npm run clean && npm run build` first');
} else if (!readFileSync(join(dist, 'index.js'), 'utf8').startsWith('#!/usr/bin/env node')) {
  problems.push('dist/index.js lacks the #!/usr/bin/env node shebang');
}

const SECRET_PATTERNS = [/api\/area\/csv\/[0-9a-f]{32}/i, /NASA_API_KEY=[A-Za-z0-9]{20,}/, /FIRMS_MAP_KEY=[A-Za-z0-9]{16,}/];

function walk(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const rel = relative(root, path).replace(/\\/g, '/');
    if (statSync(path).isDirectory()) {
      if (name === 'tests' || name === 'test') problems.push(`${rel}/ must not be packaged`);
      walk(path);
      continue;
    }
    if (name.startsWith('.env')) problems.push(`${rel} must not exist in dist/`);
    if (!/\.(js|d\.ts)$/.test(name)) problems.push(`${rel} is not a compiled .js/.d.ts file (stale build output?)`);
    const text = readFileSync(path, 'utf8');
    if (SECRET_PATTERNS.some((pattern) => pattern.test(text))) problems.push(`${rel} contains a credential-like value`);
  }
}
walk(dist);

if (problems.length) {
  console.error(`check-dist failed:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
