// Bundles the server and its runtime dependencies into dist/index.js, so a launch
// reads one file instead of a few hundred node_modules files and npx installs a
// package with no dependencies. Runs after tsc, which still emits the .d.ts files
// and the per-module output that scripts/generate-tool-docs.mjs reads.
import { build } from 'esbuild';
import { appendFileSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const outfile = join(root, 'dist', 'index.js');

const { metafile } = await build({
  entryPoints: [join(root, 'src', 'index.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  metafile: true,
  logLevel: 'warning'
});

// Bundling copies third-party code into our file, so their license notices
// (MIT, ISC, BSD) must travel with it.
const packageDirs = new Set();
for (const input of Object.keys(metafile.inputs)) {
  const match = /^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//.exec(input.replace(/\\/g, '/'));
  if (match) packageDirs.add(join(root, match[1]));
}

const notices = [...packageDirs]
  .map((dir) => {
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    const licenseFile = readdirSync(dir).find((name) => /^(licen[cs]e|copying)/i.test(name));
    const text = licenseFile ? readFileSync(join(dir, licenseFile), 'utf8').trim() : '(the package ships no license file)';
    return { id: `${manifest.name}@${manifest.version} (${manifest.license ?? 'unknown license'})`, text };
  })
  .sort((a, b) => a.id.localeCompare(b.id));

const body = notices.map(({ id, text }) => `${id}\n\n${text}`).join('\n\n----\n\n').replace(/\*\//g, '*\\/');
appendFileSync(outfile, `\n/*\nBundled third-party packages and their license notices:\n\n${body}\n*/\n`);
