# NASA MCP Server - Inspector Test Examples

This document provides example requests you can copy and paste into the MCP Inspector to test each of the NASA APIs implemented in our server.

## Running the Inspector

To run the MCP Inspector with our NASA MCP server:

```bash
# Run the provided script
./scripts/test-with-inspector.sh

# Or run manually
npx @modelcontextprotocol/inspector node dist/index.js
```

## Table of Contents
- [Server Information](#server-information)
- [NASA APIs](#nasa-apis)
  - [APOD (Astronomy Picture of the Day)](#apod)
  - [EPIC (Earth Polychromatic Imaging Camera)](#epic)
  - [NEO (Near Earth Object Web Service)](#neo)
  - [GIBS (Global Imagery Browse Services)](#gibs)
  - [CMR (Common Metadata Repository)](#cmr)
  - [FIRMS (Fire Information)](#firms)
  - [NASA Image and Video Library](#nasa-images)
  - [Exoplanet Archive](#exoplanet)
  - [DONKI (Space Weather Database)](#donki)
  - [Mars Rover Photos](#mars-rover)
  - [EONET (Earth Observatory Events)](#eonet)
  - [NASA Sounds API](#sounds)
  - [POWER (Energy Resources)](#power)
- [JPL APIs](#jpl-apis)
  - [SBDB (Small-Body Database)](#sbdb)
  - [Fireball Data](#fireball)
  - [Scout API](#scout)

## Server Information

Get the manifest of available APIs:

```json
{
  "method": "tools/manifest",
  "params": {}
}
```

## NASA APIs

### APOD

Get the Astronomy Picture of the Day:

```json
{
  "method": "nasa/apod",
  "params": {
    "date": "2023-01-01"
  }
}
```

Get a random APOD:

```json
{
  "method": "nasa/apod",
  "params": {
    "count": 1
  }
}
```

### EPIC

Get the latest EPIC images:

```json
{
  "method": "nasa/epic",
  "params": {
    "collection": "natural"
  }
}
```

### NEO

Get Near Earth Objects for a date range:

```json
{
  "method": "nasa/neo",
  "params": {
    "start_date": "2023-01-01",
    "end_date": "2023-01-02"
  }
}
```

### GIBS

Get a satellite imagery layer:

```json
{
  "method": "nasa/gibs",
  "params": {
    "layer": "MODIS_Terra_CorrectedReflectance_TrueColor",
    "date": "2023-01-01"
  }
}
```

### CMR

Basic collection search:

```json
{
  "method": "nasa/cmr",
  "params": {
    "keyword": "hurricane",
    "limit": 2
  }
}
```

Advanced collection search with spatial parameters:

```json
{
  "method": "nasa/cmr",
  "params": {
    "search_type": "collections",
    "platform": "Terra",
    "bbox": "-180,-90,180,90",
    "limit": 5,
    "include_facets": true
  }
}
```

Granule search:

```json
{
  "method": "nasa/cmr",
  "params": {
    "search_type": "granules",
    "concept_id": "C1000000000-ORNL_DAAC",
    "limit": 3
  }
}
```

### FIRMS

Get fire data:

```json
{
  "method": "nasa/firms",
  "params": {
    "area": "world",
    "days": 1
  }
}
```

### NASA Images

Search NASA's image library:

```json
{
  "method": "nasa/images",
  "params": {
    "q": "apollo 11",
    "media_type": "image",
    "year_start": 1969,
    "year_end": 1970
  }
}
```

### Exoplanet

Search for exoplanets:

```json
{
  "method": "nasa/exoplanet",
  "params": {
    "select": "pl_name,pl_masse,st_dist",
    "where": "pl_masse>1",
    "order": "pl_masse",
    "limit": 5
  }
}
```

### DONKI

Get Coronal Mass Ejection data:

```json
{
  "method": "nasa/donki",
  "params": {
    "type": "cme",
    "startDate": "2022-01-01",
    "endDate": "2022-01-10"
  }
}
```

### Mars Rover

Get photos from Mars Perseverance:

```json
{
  "method": "nasa/mars-rover",
  "params": {
    "rover": "perseverance",
    "sol": 100
  }
}
```

### EONET

Get natural event data:

```json
{
  "method": "nasa/eonet",
  "params": {
    "category": "wildfires",
    "days": 20,
    "status": "open"
  }
}
```

### Sounds

Get space sounds:

```json
{
  "method": "nasa/sounds",
  "params": {
    "q": "voyager",
    "limit": 3
  }
}
```

### POWER

Get solar and meteorological data:

```json
{
  "method": "nasa/power",
  "params": {
    "parameters": "T2M,PRECTOTCORR,WS10M",
    "community": "re",
    "latitude": 40.7128,
    "longitude": -74.0060,
    "start": "20220101",
    "end": "20220107"
  }
}
```

## JPL APIs

### SBDB

Query the Small-Body Database:

```json
{
  "method": "jpl/sbdb",
  "params": {
    "sstr": "433",
    "full_precision": true
  }
}
```

### Fireball

Get fireball data:

```json
{
  "method": "jpl/fireball",
  "params": {
    "date_min": "2022-01-01",
    "limit": 5
  }
}
```

### Scout

Get Scout data:

```json
{
  "method": "jpl/scout",
  "params": {}
}
``` 