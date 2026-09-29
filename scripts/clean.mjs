// Removes build outputs so builds and package checks start from a clean state.
import { rmSync } from 'node:fs';

for (const dir of ['dist', '.test-build']) {
  rmSync(new URL(`../${dir}`, import.meta.url), { recursive: true, force: true });
}
