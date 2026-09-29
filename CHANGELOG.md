# Changelog

## 1.1.0

A reliability and CMR release. It is published as a minor version, but **default responses, parameter validation and runtime support changed in ways existing clients can notice**. Anyone depending on `^1.0.x` (or `@latest`) will receive these changes, so review the list below before upgrading, or pin `1.0.14`.

### Breaking changes and migration

- **`nasa_cmr` returns a compact envelope by default** (`status`, `search_type`, `results`, `returned_count`, `total_hits`, `next_cursor`, `source`, `retrieved_at`, `warnings`) instead of the raw CMR feed. Clients that parsed the raw feed should pass `response_mode: "raw"` and read `raw`. The `raw` option alone does not preserve the old response shape.
- **`nasa_cmr` parameters**: `keyword` is optional and applies only to collection searches (CMR rejects it for granules). Filters that don't apply to the chosen `search_type` are rejected instead of being dropped. `page` still works but is deprecated in favour of `cursor`. The `iso_smap` format, which CMR does not support, was removed.
- **`nasa_firms` needs `FIRMS_MAP_KEY`** (it used `NASA_API_KEY`, which FIRMS never accepted). The area is `bbox` (`west,south,east,north`). `latitude`/`longitude` now require `radius_km`; `radius` without units is rejected. `days` is limited to FIRMS's 1–5. The result is structured (`detections`, `total_detections`, ...).
- **Strict validation**: every tool now rejects unknown parameters, and required/default fields match what is advertised in `tools/list`. Parameters that never worked upstream now return a migration message:
  - `jpl_sentry`: `date_min`/`date_max`. `limit` is now applied locally.
  - `jpl_scout`: `orbit_id` and `summary`. `file` is now `list`/`mpc`, `plot` is `el`/`ca`/`sr`, and `limit` is applied locally.
  - `jpl_fireball`: `req_energy`, `req_impact_e`, `alt_min` and `alt_max`.
  - `jpl_sbdb`: `cad` still works as an alias of `ca_data`, and `sstr`, `spk` or `des` is accepted.
- **`nasa_exoplanet`** uses the Exoplanet Archive TAP service (the old `nstedAPI` rejects current table names and ignored the row limit). Use TAP table names such as `ps`. `limit` now defaults to 100.
- **`nasa_eonet`** returns the matching events. It no longer silently re-runs a broader query when nothing matches.
- **`nasa_gibs`** sends WMS 1.3.0 bounding boxes in the required latitude-first order. Earlier releases requested a different region. `resolution` is now honoured.
- **`nasa_power`** sends `time-standard` (the old `time_standard` was ignored by POWER).
- **Images**: `nasa_apod`, `nasa_epic`, `nasa_images` and `nasa_mars_rover` embed a bounded number of images (`max_images`), only real image responses from nasa.gov hosts, and never null or placeholder image content.
- **Removed**: fabricated sample resources and resource-template generators (templates now fetch real data), the in-process `global.mcp__*` functions, the no-op `nasa/subscribe` method, and the `setupEnvironment` behaviour that copied `.env` into `dist/`.
- **Node.js 22 or newer** is required (Node 20 reached end of life in April 2026). Tested on Node 22 and 24 on Linux, Windows and macOS.

### Fixes and improvements

- One typed tool registry drives `tools/list`, validation and dispatch. Tool names are never turned into import paths. Aliases such as `nasa/apod` and `nasa/mars-rover` (which previously failed) are explicit.
- `nasa_cmr`: all supported collection/granule filters are exposed and validated. `bbox` is translated to CMR's `bounding_box` (CMR rejected `bbox`). Added `collection_concept_id`, facets, `fields` selection, `total_hits` from `CMR-Hits`, and Search After pagination with a stateless, versioned `next_cursor` that can be continued with the cursor alone.
- Upstream failures (HTTP errors, 429 with retry-after, timeouts, oversized or non-JSON/HTML responses) are reported as MCP tool errors instead of success-shaped text. Every request has a deadline and a response size limit.
- Resources are per server instance, bounded, keyed by the full query, and carry source and retrieval metadata. The stateless HTTP transport shares no state between requests.
- The server version is read from `package.json`. The CLI no longer starts when the module is imported, and nothing but MCP messages is written to stdout.
- `nasa_mars_rover`: the upstream Mars Rover Photos API has been retired (HTTP 404); the tool reports that accurately.

### Security

- Releases up to 1.0.14 shipped a hard-coded FIRMS MAP_KEY in `dist/tests/direct-api-test.js`, and releases up to 1.0.12 shipped a `dist/.env` file containing a NASA API key. Both files and the code that produced them are gone, and the package now uses an explicit file allowlist checked in CI. The exposed keys must be rotated by their owner. Git history was not rewritten.
- Credentials are redacted from results, resources, errors and logs; JPL requests no longer receive the api.nasa.gov key.
- Dependencies were narrowed to what the server uses (`axios`, `express`, `cors` and `@anthropic-ai/sdk` removed; `fetch` is built in), leaving no known vulnerabilities in the production dependency tree at release time.

## 1.0.14 and earlier

Released without a changelog; see the git history.
