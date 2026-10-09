# MCP Inspector examples

Run the server under the [MCP Inspector](https://github.com/modelcontextprotocol/inspector):

```bash
npm run build
NASA_API_KEY=YOUR_NASA_API_KEY FIRMS_MAP_KEY=YOUR_FIRMS_MAP_KEY npx @modelcontextprotocol/inspector node dist/index.js
```

Each block below is a `tools/call` request body (`name` + `arguments`). Paste the arguments into the Inspector's **Tools** tab. Every example is validated against the tool schemas by `test/unit/docs.test.ts`. The full parameter reference is in [TOOLS.md](TOOLS.md).

## Earthdata

CMR collection search (compact output, first page):

```json
{ "name": "nasa_cmr", "arguments": { "keyword": "sea surface temperature", "bounding_box": "-100,10,-60,40", "temporal": "2024-06-01T00:00:00Z,2024-09-30T23:59:59Z", "limit": 5 } }
```

Continue that search with only the returned cursor:

```json
{ "name": "nasa_cmr", "arguments": { "cursor": "cmr1.<paste next_cursor here>" } }
```

CMR granules in a collection, newest first, selected fields only:

```json
{ "name": "nasa_cmr", "arguments": { "search_type": "granules", "collection_concept_id": "C1996881146-POCLOUD", "sort_key": "-start_date", "fields": ["title", "time_start", "links"], "limit": 3 } }
```

CMR collections with facets, filtered by platform and instrument:

```json
{ "name": "nasa_cmr", "arguments": { "platform": "Terra", "instrument": "MODIS", "processing_level_id": "3", "include_facets": true, "limit": 3 } }
```

CMR upstream metadata (UMM-JSON, raw):

```json
{ "name": "nasa_cmr", "arguments": { "concept_id": "C1996881146-POCLOUD", "format": "umm_json", "response_mode": "raw" } }
```

FIRMS fire detections for a box (needs `FIRMS_MAP_KEY`):

```json
{ "name": "nasa_firms", "arguments": { "bbox": "-125,32,-114,42", "days": 2, "source": "VIIRS_NOAA20_NRT", "limit": 50 } }
```

FIRMS around a point (converted to a bbox):

```json
{ "name": "nasa_firms", "arguments": { "latitude": 37.45, "longitude": -122.18, "radius_km": 25 } }
```

GIBS true-colour imagery:

```json
{ "name": "nasa_gibs", "arguments": { "layer": "MODIS_Terra_CorrectedReflectance_TrueColor", "date": "2024-01-01", "bbox": "-20,30,40,60", "resolution": 8 } }
```

EONET open wildfires:

```json
{ "name": "nasa_eonet", "arguments": { "category": "wildfires", "status": "open", "days": 20, "limit": 10 } }
```

POWER daily temperature:

```json
{ "name": "nasa_power", "arguments": { "parameters": "T2M,PRECTOTCORR", "community": "RE", "latitude": 40.7128, "longitude": -74.006, "start": "20220101", "end": "20220107" } }
```

EPIC natural-colour images:

```json
{ "name": "nasa_epic", "arguments": { "collection": "natural", "date": "2024-01-01" } }
```

## api.nasa.gov (needs `NASA_API_KEY`)

```json
{ "name": "nasa_neo", "arguments": { "start_date": "2024-01-01", "end_date": "2024-01-03" } }
```

InSight Mars weather (historical; the feed stopped in October 2020):

```json
{ "name": "nasa_insight_weather", "arguments": {} }
```

## Other NASA services (no key needed)

DONKI space weather events (solar flares, CMEs, geomagnetic storms and more), up to 30 days per call. Results are one line per event; `response_mode: "raw"` returns the full records:

```json
{ "name": "nasa_donki", "arguments": { "type": "cme", "startDate": "2024-01-01", "endDate": "2024-01-10" } }
```

```json
{ "name": "nasa_donki", "arguments": { "type": "flr", "startDate": "2026-09-01", "endDate": "2026-09-29" } }
```

```json
{ "name": "nasa_donki", "arguments": { "type": "wsa", "startDate": "2026-09-01", "endDate": "2026-09-29", "response_mode": "raw", "limit": 3 } }
```

Astronomy Picture of the Day: the latest picture, one date, or a range of up to 100 days:

```json
{ "name": "nasa_apod", "arguments": {} }
```

```json
{ "name": "nasa_apod", "arguments": { "date": "2015-07-14" } }
```

```json
{ "name": "nasa_apod", "arguments": { "start_date": "2026-09-01", "end_date": "2026-09-07", "max_images": 0 } }
```

Two-line elements for the ISS, and a name search:

```json
{ "name": "nasa_tle", "arguments": { "satellite_id": 25544 } }
```

```json
{ "name": "nasa_tle", "arguments": { "search": "STARLINK", "page_size": 5 } }
```

Satellite Situation Center: find observatory IDs, then locate spacecraft:

```json
{ "name": "nasa_ssc_observatories", "arguments": { "search": "mms", "active_on": "2026-09-29" } }
```

```json
{ "name": "nasa_ssc_locations", "arguments": { "observatories": ["iss"], "start_time": "2026-09-29T00:00:00Z", "end_time": "2026-09-29T01:00:00Z" } }
```

```json
{ "name": "nasa_ssc_locations", "arguments": { "observatories": ["mms1", "moon"], "start_time": "2026-09-01", "end_time": "2026-09-08", "coordinate_systems": ["gse", "gsm"] } }
```

TechPort technology projects:

```json
{ "name": "nasa_techport", "arguments": { "query": "solar sail", "limit": 5 } }
```

```json
{ "name": "nasa_techport", "arguments": { "project_id": 94703 } }
```

Technology Transfer patents, software and spinoffs:

```json
{ "name": "nasa_techtransfer", "arguments": { "query": "solar panel", "limit": 5 } }
```

```json
{ "name": "nasa_techtransfer", "arguments": { "query": "visualization", "collection": "software", "limit": 5 } }
```

Mars, Moon and Vesta Trek map layers and tiles:

```json
{ "name": "nasa_trek_layers", "arguments": { "body": "mars", "search": "olympus" } }
```

```json
{ "name": "nasa_trek_tile", "arguments": { "body": "mars", "layer": "olympus_mons.eq", "zoom": 6, "latitude": 18.65, "longitude": 226.2 } }
```

```json
{ "name": "nasa_trek_tile", "arguments": { "body": "moon", "layer": "LRO_WAC_Mosaic_Global_303ppd_v02", "zoom": 2, "row": 1, "col": 3 } }
```

```json
{ "name": "nasa_images", "arguments": { "q": "apollo 11", "media_type": "image", "year_start": "1969", "year_end": "1970", "page_size": 5 } }
```

```json
{ "name": "nasa_exoplanet", "arguments": { "table": "ps", "select": "pl_name,pl_bmasse,sy_dist", "where": "pl_bmasse > 1", "order": "pl_bmasse", "limit": 5 } }
```

```json
{ "name": "nasa_osdr_files", "arguments": { "accession_number": "OSD-87" } }
```

MAST (TESS, Hubble, JWST, Kepler and more): TESS light curves of a star, the files of one observation, and TESS full-frame image sectors with cutout URLs. Results list download links; files are not downloaded:

```json
{ "name": "nasa_mast_observations", "arguments": { "target": "Pi Mensae", "limit": 10 } }
```

```json
{ "name": "nasa_mast_observations", "arguments": { "target": "TRAPPIST-1", "collection": "JWST", "dataproduct_type": "timeseries", "limit": 5 } }
```

```json
{ "name": "nasa_mast_products", "arguments": { "obsids": ["176755222"], "subgroups": ["LC"] } }
```

```json
{ "name": "nasa_mast_products", "arguments": { "obsids": "120865840", "minimum_recommended": true } }
```

```json
{ "name": "nasa_tess_ffi", "arguments": { "tic_id": 261136679, "cutout_size": 20 } }
```

## JPL Solar System Dynamics

```json
{ "name": "jpl_sbdb", "arguments": { "sstr": "433", "phys_par": true } }
```

```json
{ "name": "jpl_cad", "arguments": { "dist_max": "10LD", "date_min": "now", "date_max": "+60", "sort": "dist" } }
```

```json
{ "name": "jpl_sentry", "arguments": { "ip_min": 0.00001, "limit": 10 } }
```

```json
{ "name": "jpl_fireball", "arguments": { "date_min": "2024-01-01", "limit": 5 } }
```

```json
{ "name": "jpl_nhats", "arguments": { "dv": 6, "dur": 360 } }
```

```json
{ "name": "jpl_scout", "arguments": { "limit": 5 } }
```

```json
{ "name": "jpl_jd_cal", "arguments": { "cd": "2000-01-01T12:00:00" } }
```

```json
{ "name": "jpl_horizons", "arguments": { "COMMAND": "499", "OBJ_DATA": "YES", "MAKE_EPHEM": "YES", "EPHEM_TYPE": "OBSERVER", "CENTER": "500@399", "START_TIME": "2024-01-01", "STOP_TIME": "2024-01-02", "STEP_SIZE": "1d", "QUANTITIES": "1,9,20,23,24" } }
```

```json
{ "name": "jpl_periodic_orbits", "arguments": { "sys": "earth-moon", "family": "halo", "libr": 1, "branch": "N" } }
```

Mission options to one asteroid, and the most accessible NEOs for 2030 launches:

```json
{ "name": "jpl_mission_design", "arguments": { "sstr": "apophis" } }
```

```json
{ "name": "jpl_mission_design", "arguments": { "crit": 3, "year": [2030], "sb_group": "neo", "lim": 10 } }
```
