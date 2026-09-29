# Releasing

Releases are **staged** from GitHub Actions with npm **trusted publishing** (OIDC, automatic provenance) by `.github/workflows/release.yml`. That is the only workflow that can publish; it never targets `latest`. A staged version is not public until a package owner approves it with 2FA.

## One-time setup (package owner)

1. On npmjs.com, open **@programcomputer/nasa-mcp-server → Settings → Trusted Publisher → GitHub Actions** and enter:
   - Organization or user: `ProgramComputer`
   - Repository: `NASA-MCP-server`
   - Workflow filename: `release.yml`
   - Environment: `npm-release`
   - Allowed actions: leave **Allow npm publish** unchecked, so only `npm stage publish` is allowed (npm's recommended setting).
2. Recommended afterwards: set publishing access to **Require two-factor authentication and disallow tokens**. Trusted publishing keeps working, and stale tokens (such as the unused `NPM_TOKEN` repository secret) can no longer publish.
3. The `npm-release` GitHub environment only allows deployments from `main`.

npm's OIDC authorizes `npm stage publish` and `npm publish` only. Approving a staged version and promoting a release to `latest` therefore need an interactive owner login with 2FA.

## Release steps

1. Merge the release PR once CI is green on every platform. The PR sets the version in `package.json`/`package-lock.json` and adds a `## X.Y.Z` section to `CHANGELOG.md`.
2. Tag the merged commit on `main` with an annotated tag (tags are immutable; never move or reuse one):
   ```bash
   git fetch origin && git checkout origin/main
   git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin vX.Y.Z
   ```
3. Draft the GitHub Release for the tag (keep it a draft until verification is complete).
4. Run the **Release** workflow from `main`: `gh workflow run release.yml -f tag=vX.Y.Z -f dist_tag=next`.
   - **build** checks the tag is annotated and on `main`, that the tag, `package.json`, lockfile and changelog versions match, and that the version is not on npm. It then runs clean install, lint, typecheck, clean build, the docs check and all tests, packs **one** tarball and runs the package gate on it (install outside the repo with runtime dependencies only, then MCP stdio/HTTP tests against the installed bin).
   - **stage** re-checks the tarball's sha512 and runs `npm stage publish` on that exact file with `--tag next` and provenance. The run summary lists the tested integrity and the next commands.
5. Approve the staged version (owner, 2FA). The `next` tag from step 4 is applied on approval:
   ```bash
   npx -y npm@11 stage list @programcomputer/nasa-mcp-server
   npx -y npm@11 stage approve <stage-id>
   ```
6. Run **Verify release**: `gh workflow run verify-release.yml -f tag=vX.Y.Z -f integrity=<sha512 from the Release summary>`. On Linux and Windows it:
   - requires the registry's integrity to equal the tested one and `next` to point at the version;
   - installs from the registry with a fresh cache and reruns the MCP tests against the installed bin;
   - checks the provenance attestation and `npm audit signatures`.

   Optionally also run the live checks against real services: `NASA_MCP_LIVE=1 npm run test:live`.
7. Promote the same version (owner, after verification passes):
   ```bash
   npm view @programcomputer/nasa-mcp-server dist-tags   # record the current latest first
   npm login
   npm dist-tag add @programcomputer/nasa-mcp-server@X.Y.Z latest
   ```
8. Confirm `npm view @programcomputer/nasa-mcp-server dist-tags.latest` is `X.Y.Z` and that `npx -y @programcomputer/nasa-mcp-server@latest --version` prints it from a fresh cache. Then publish the GitHub Release with the version, commit, notes and the workflow run link.

## If something fails

- **Before publish:** nothing reached npm. Fix it, release a new commit, and use a new tag if the tagged commit changes.
- **Staging failed or timed out:** check `npx -y npm@11 stage list @programcomputer/nasa-mcp-server` and `npm view @programcomputer/nasa-mcp-server@X.Y.Z version` before retrying. If a stage already exists for the version, approve or reject that one instead of staging again. If the version is already published and its integrity matches the Release summary, only run **Verify release**. Never republish, and never try to replace an existing version.
- **Verification failed:** leave `latest` alone, investigate, and fix forward with a new version.
- **A promoted release is broken:** move `latest` back to the recorded previous version (`npm dist-tag add @programcomputer/nasa-mcp-server@<previous> latest`), announce it, and fix forward with a new version. Do not unpublish.
- **Another release moved `latest` in the meantime:** inspect it before promoting; do not overwrite it blindly.
