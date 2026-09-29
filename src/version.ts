import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const PACKAGE_NAME = '@programcomputer/nasa-mcp-server';

interface PackageMetadata {
  name: string;
  version: string;
}

/**
 * Reads this package's own package.json so the version reported over MCP is
 * never a duplicated literal. Walks up from the compiled module because the
 * relative depth differs between dist/ and the test build.
 */
function readPackageMetadata(): PackageMetadata {
  let dir = __dirname;
  for (let depth = 0; depth < 4; depth++) {
    try {
      const parsed = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Partial<PackageMetadata>;
      if (parsed.name === PACKAGE_NAME && typeof parsed.version === 'string') {
        return { name: parsed.name, version: parsed.version };
      }
    } catch {
      // Not found at this level; keep walking up.
    }
    dir = dirname(dir);
  }
  throw new Error(`Unable to locate package.json for ${PACKAGE_NAME}`);
}

export const PACKAGE_METADATA = readPackageMetadata();
export const SERVER_VERSION = PACKAGE_METADATA.version;
