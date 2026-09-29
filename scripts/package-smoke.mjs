#!/usr/bin/env node
// Package gate: verify a tarball, install it outside the repository with only
// runtime dependencies, and run the MCP transport tests against its installed
// bin. With --from-registry, first download a published version (fresh cache)
// and require its integrity to match --expect-integrity.
//
//   node scripts/package-smoke.mjs --tarball ./pkg.tgz [--report report.json]
//   node scripts/package-smoke.mjs --from-registry @programcomputer/nasa-mcp-server@1.1.0 --expect-integrity sha512-... [--report r.json]
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const isWindows = process.platform === 'win32';
const npmCmd = isWindows ? 'npm.cmd' : 'npm';
const PACKAGE = '@programcomputer/nasa-mcp-server';

function arg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function run(command, args, options = {}) {
  // Windows .cmd shims need a shell; quote anything with spaces for it.
  const shell = isWindows && /\.cmd$/.test(command);
  const quote = (value) => (shell && /\s/.test(value) ? `"${value}"` : value);
  const result = spawnSync(quote(command), args.map(quote), { encoding: 'utf8', shell, timeout: 300_000, ...options });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed (${result.status}):\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout;
}

function integrityOf(file) {
  const bytes = readFileSync(file);
  return {
    integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
    shasum: createHash('sha1').update(bytes).digest('hex'),
    size: bytes.length
  };
}

const ALLOWED = [/^package\/package\.json$/, /^package\/README\.md$/, /^package\/LICENSE$/, /^package\/CHANGELOG\.md$/, /^package\/dist\/(?!.*\/tests?\/).+\.(js|d\.ts)$/];
const REQUIRED = ['package/package.json', 'package/README.md', 'package/LICENSE', 'package/dist/index.js'];

/**
 * Reads a .tgz in-process (ustar + pax path records, as produced by npm pack)
 * so the gate does not depend on which `tar` binary is on PATH.
 */
function readTarball(file) {
  const data = gunzipSync(readFileSync(file));
  const entries = new Map();
  let offset = 0;
  let paxPath = null;
  while (offset + 512 <= data.length) {
    const header = data.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const field = (start, length) => header.subarray(start, start + length).toString('utf8').split('\0')[0];
    const size = parseInt(field(124, 12).trim() || '0', 8);
    const type = header[156] === 0 ? '0' : String.fromCharCode(header[156]);
    const body = data.subarray(offset + 512, offset + 512 + size);
    offset += 512 + Math.ceil(size / 512) * 512;
    if (type === 'x') {
      paxPath = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(body.toString('utf8'))?.[1] ?? null;
      continue;
    }
    if (type === 'g') continue;
    const prefix = field(345, 155);
    const path = paxPath ?? (prefix ? `${prefix}/${field(0, 100)}` : field(0, 100));
    paxPath = null;
    if (type === '0' || type === '7') entries.set(path, Buffer.from(body));
  }
  return entries;
}

function inspectFiles(entries) {
  const files = [...entries.keys()];
  const unexpected = files.filter((file) => !ALLOWED.some((pattern) => pattern.test(file)));
  const missing = REQUIRED.filter((file) => !files.includes(file));
  if (unexpected.length || missing.length) {
    throw new Error(`tarball contents rejected.\nunexpected: ${unexpected.join(', ') || 'none'}\nmissing: ${missing.join(', ') || 'none'}`);
  }
  return files;
}

const report = { started_at: new Date().toISOString(), node: process.version, platform: `${process.platform}-${process.arch}`, checks: [] };
const work = mkdtempSync(join(tmpdir(), 'nasa-mcp-pkg-'));
if (resolve(work).startsWith(resolve(repoRoot))) throw new Error('temporary directory must be outside the repository');
const check = (name, detail) => {
  report.checks.push({ name, ...(detail === undefined ? {} : { detail }) });
  console.log(`ok - ${name}${detail === undefined ? '' : `: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
};

try {
  let tarball = arg('--tarball');
  const registrySpec = arg('--from-registry');
  const cache = join(work, 'npm-cache');

  if (registrySpec) {
    const downloads = join(work, 'download');
    run(npmCmd, ['pack', registrySpec, '--json', '--pack-destination', downloads, '--cache', cache, '--prefer-online'], { cwd: work, env: { ...process.env, npm_config_cache: cache } });
    const found = existsSync(downloads) ? readdirSync(downloads).filter((f) => f.endsWith('.tgz')) : [];
    if (found.length !== 1) throw new Error(`expected one downloaded tarball, found ${found.length}`);
    tarball = join(downloads, found[0]);
    check('downloaded from registry with a fresh cache', registrySpec);
  }
  if (!tarball) throw new Error('pass --tarball <file> or --from-registry <spec>');
  tarball = resolve(tarball);

  const digest = integrityOf(tarball);
  report.tarball = { file: tarball, ...digest };
  check('tarball integrity', digest.integrity);
  const expected = arg('--expect-integrity');
  if (expected) {
    if (expected !== digest.integrity) throw new Error(`integrity mismatch: expected ${expected}, got ${digest.integrity}`);
    check('integrity matches the tested artifact');
  }

  const entries = readTarball(tarball);
  report.files = inspectFiles(entries);
  check('tarball file list', `${report.files.length} files, no tests/fixtures/secrets`);

  const manifest = JSON.parse(entries.get('package/package.json').toString('utf8'));
  if (manifest.name !== PACKAGE) throw new Error(`unexpected package name ${manifest.name}`);
  report.version = manifest.version;

  const indexJs = entries.get('package/dist/index.js').toString('utf8');
  const secretPattern = /api\/area\/csv\/[0-9a-f]{32}|NASA_API_KEY=[A-Za-z0-9]{20,}|FIRMS_MAP_KEY=[A-Za-z0-9]{16,}/;
  for (const [file, body] of entries) {
    if (secretPattern.test(body.toString('utf8'))) throw new Error(`${file} contains a credential-like value`);
  }
  if (!indexJs.startsWith('#!/usr/bin/env node')) throw new Error('dist/index.js is missing its shebang');
  check('no credential-like values; shebang present');

  const app = join(work, 'app');
  run(process.execPath, ['-e', `require('fs').mkdirSync(${JSON.stringify(app)},{recursive:true});require('fs').writeFileSync(${JSON.stringify(join(app, 'package.json'))},'{"name":"smoke","private":true}')`]);
  run(npmCmd, ['install', tarball, '--omit=dev', '--no-audit', '--no-fund', '--cache', cache], { cwd: app, env: { ...process.env, npm_config_cache: cache } });
  check('installed into a fresh directory with runtime dependencies only', app);

  const installedVersion = JSON.parse(readFileSync(join(app, 'node_modules', ...PACKAGE.split('/'), 'package.json'), 'utf8')).version;
  if (installedVersion !== manifest.version) throw new Error(`installed ${installedVersion}, expected ${manifest.version}`);
  for (const devOnly of ['typescript', 'eslint', 'typescript-eslint', '@types/node']) {
    if (existsSync(join(app, 'node_modules', ...devOnly.split('/')))) throw new Error(`development dependency ${devOnly} was installed`);
  }
  check('no development-only packages installed');

  const probe = run(process.execPath, ['-e', `const m=require(${JSON.stringify(PACKAGE)});const keys=Object.keys(require.cache);console.log(JSON.stringify({keys,exports:Object.keys(m)}))`], { cwd: app });
  const { keys, exports } = JSON.parse(probe);
  const outside = keys.filter((key) => !resolve(key).startsWith(resolve(app) + sep));
  if (outside.length) throw new Error(`modules resolved outside the install directory: ${outside.slice(0, 5).join(', ')}`);
  if (!exports.includes('createNasaMcpServer')) throw new Error('library exports are missing createNasaMcpServer');
  check('importing the package loads nothing from the checkout and starts no process', `${keys.length} modules`);

  const bin = join(app, 'node_modules', '.bin', isWindows ? 'nasa-mcp-server.cmd' : 'nasa-mcp-server');
  const version = run(bin, ['--version'], { cwd: app }).trim();
  if (version !== manifest.version) throw new Error(`bin --version printed ${version}, expected ${manifest.version}`);
  check('installed bin runs', version);

  const testFile = join(repoRoot, '.test-build', 'test', 'integration', 'transports.test.js');
  if (!existsSync(testFile)) throw new Error('compiled transport tests missing: run `npm run build:test` first');
  const tests = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-timeout=120000', testFile], {
    timeout: 300_000,
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, NASA_MCP_SERVER_COMMAND: bin, NASA_MCP_SERVER_ARGS: '[]' }
  });
  process.stdout.write(tests.stdout);
  process.stderr.write(tests.stderr);
  if (tests.status !== 0) throw new Error('MCP transport tests failed against the installed package');
  check('stdio and Streamable HTTP MCP tests passed against the installed bin');

  report.result = 'passed';
} catch (error) {
  report.result = 'failed';
  report.error = error instanceof Error ? error.message : String(error);
  console.error(`package smoke FAILED: ${report.error}`);
  process.exitCode = 1;
} finally {
  report.finished_at = new Date().toISOString();
  const out = arg('--report');
  if (out) writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  rmSync(work, { recursive: true, force: true, maxRetries: 3 });
}
