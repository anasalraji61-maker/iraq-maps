# Geo Pipeline

Complete reference for the Iraq Smart Maps geographic data pipeline.

**Data license:** ODbL 1.0 — © OpenStreetMap contributors  
**Attribution must appear in the app at all times.**  
**Iraq bbox:** 29.0–37.5 N, 38.5–48.8 E  

---

## Table of contents

1. [Overview](#overview)
2. [OSM data sources and licensing](#osm-data-sources-and-licensing)
3. [Pipeline flow](#pipeline-flow)
4. [Tile generation (Planetiler → PMTiles)](#tile-generation)
5. [Geocoder (Photon)](#geocoder-photon)
6. [Routing (Valhalla)](#routing-valhalla)
7. [Update procedures](#update-procedures)
8. [Iraq-specific considerations](#iraq-specific-considerations)
9. [Service ports](#service-ports)
10. [Troubleshooting](#troubleshooting)

---

## Overview

The geo pipeline converts raw OpenStreetMap data into three services that power the app:

```
Geofabrik → iraq-latest.osm.pbf
               │
               ├─── Planetiler ───→ iraq.pmtiles  (vector tiles)
               │                         │
               │                    martin server  ←── MapLibre Native (mobile)
               │
               ├─── Photon ────────→ geocoder API  ←── search bar, assistant
               │
               └─── Valhalla ──────→ routing API   ←── turn-by-turn navigation
```

All three services are self-hosted. No data is fetched from external tile CDNs,
Mapbox, Google, Bing, Esri, or `tile.openstreetmap.org`.

---

## OSM data sources and licensing

### Primary source

| Property | Value |
|---|---|
| Provider | Geofabrik GmbH |
| URL | `https://download.geofabrik.de/asia/iraq.html` |
| Format | PBF (Protocol Buffer Binary) |
| Update cycle | Daily (Geofabrik re-generates overnight) |
| License | ODbL 1.0 |
| Attribution | Map data © OpenStreetMap contributors |

### What ODbL requires

1. **Attribution:** The app must display "Map data © OpenStreetMap contributors"
   on every screen that shows a map or uses OSM-derived data.
2. **Share-alike:** Any database that incorporates substantial OSM data must
   also be released under ODbL. Our provider-submitted data (photos, hours,
   prices) is stored in separate tables and never merged with OSM data for
   redistribution, so share-alike does not propagate.
3. **Produced works:** Rendered tiles are a "produced work" under ODbL — they
   do not require share-alike. Our PMTiles are produced works.
4. **No TPM:** We cannot apply digital rights management to ODbL data.

### Separation of data

```
places.osm_features        ← ODbL data (OSM nodes/ways/relations)
places.provider_features   ← Our own terms (business submissions)
```

These tables are never `JOIN`ed in a way that would force share-alike onto
our user data. The API never returns a mix of the two without preserving
the `source` and `license` fields.

---

## Pipeline flow

### Step 1: Download

```bash
./geo-services/tiles/scripts/download-iraq.sh --verify
```

Downloads `iraq-latest.osm.pbf` from Geofabrik with MD5 verification.
Typical size: 55–70 MB.

### Step 2: Import places (OSM pipeline)

```bash
cd geo-services/osm-pipeline
pnpm run import -- --input data/osm/iraq-latest.osm.pbf \
                   --output data/places.ndjson \
                   --city baghdad
```

Reads the PBF, applies category and tag mapping, validates coordinates against
the Iraq bbox, deduplicates by OSM ID, and writes an NDJSON file ready for
bulk insert into `places.osm_features`.

Key modules:

| File | Purpose |
|---|---|
| `src/import-places.ts` | Main OSM element converter |
| `src/tag-mapper.ts` | OSM tag → PlaceCategory mapping |
| `src/category-icons.ts` | 200+ OSM value → icon name mappings |
| `src/address-formatter.ts` | Iraqi Arabic address builder |
| `src/opening-hours-parser.ts` | OSM opening_hours → WeeklySchedule |
| `src/validators.ts` | Coordinate, OSM ID, bbox validation |

### Step 3: Tile generation

```bash
./geo-services/tiles/scripts/build-tiles.sh
```

Runs Planetiler against the PBF and produces `iraq.pmtiles`.

### Step 4: Load geocoder

Photon reads from an Elasticsearch index built from OSM data. After a PBF
update, run the Photon importer (see [Geocoder section](#geocoder-photon)).

### Step 5: Load routing graph

Valhalla builds a routing graph from the same PBF (see [Routing section](#routing-valhalla)).

---

## Tile generation

### Planetiler

Planetiler (<https://github.com/onthegomap/planetiler>) converts OSM PBF directly
to PMTiles format without an intermediate PostGIS step.

**Configuration:** `geo-services/tiles/configs/planetiler-iraq.yml`

Tile layers generated:

| Layer | Zoom | Content |
|---|---|---|
| `water` | 4–14 | Tigris, Euphrates, lakes, marshes, irrigation canals |
| `waterway` | 8–14 | River/canal line features |
| `landcover` | 4–14 | Agricultural land, desert, urban areas |
| `boundary` | 0–14 | Governorate borders (admin_level 4–8) |
| `place` | 2–14 | City/town/village/neighbourhood names |
| `transportation` | 4–14 | Roads: motorway → residential |
| `transportation_name` | 12–14 | Arabic road name labels |
| `poi` | 13–14 | Mosques, hospitals, restaurants, shops |
| `building` | 14 | Building outlines |

**Name priority in tiles:**
1. `name:ar` (Arabic)
2. `name:ckb` (Kurdish Sorani)
3. `name:en` (English)
4. `name` (language-neutral fallback)

### PMTiles

PMTiles is a single-file archive format for cloud-optimized tiles.
The mobile app uses MapLibre Native's PMTiles support to read tiles directly
from S3-compatible storage without a tile proxy in production.

In development, `serve-tiles.sh` runs a local `martin` server.

### Serving tiles

**Development:**
```bash
./geo-services/tiles/scripts/serve-tiles.sh
# → http://localhost:3000/iraq/{z}/{x}/{y}
```

**Production:** Upload `iraq.pmtiles` to S3-compatible storage and reference it
from the app's MapLibre style with a `pmtiles://` URL scheme. See
`packages/map-kit/src/style.ts` for the style definition.

**Attribution control:** The MapLibre attribution control is always enabled and
shows the ODbL attribution string embedded in the PMTiles metadata:
```
© OpenStreetMap contributors
```

---

## Geocoder (Photon)

### What Photon is

Photon (<https://github.com/komoot/photon>) is an open-source geocoder built on
Elasticsearch and OpenStreetMap data. We run our own instance; no requests go to
the public Photon API at `photon.komoot.io`.

### Setup

```bash
# 1. Download the Photon JAR (or use Docker image)
# https://github.com/komoot/photon/releases
curl -L -o /opt/photon/photon.jar \
  https://github.com/komoot/photon/releases/download/0.5.0/photon-0.5.0.jar

# 2. Import Iraq OSM data into Elasticsearch
java -jar /opt/photon/photon.jar \
  -nominatim-import \
  -host localhost \
  -languages ar,en,ckb \
  -bbox 38.5,29.0,48.8,37.5

# 3. Start the Photon server
java -jar /opt/photon/photon.jar \
  -listen-ip 127.0.0.1 \
  -listen-port 2322 \
  -languages ar,en,ckb
```

### Geocoder bridge

The TypeScript bridge in `geo-services/geocoder/src/iraq-geocoder.ts` wraps
Photon with Iraq-specific logic:

- Boosts results inside the Iraq bbox
- Arabic Unicode normalization for queries
- Fallback to local curated place database (60+ cities, landmarks)
- Reverse geocode fallback to nearest local place

**Configuration (environment variables):**

| Variable | Default | Description |
|---|---|---|
| `PHOTON_BASE_URL` | `http://localhost:2322` | Photon server URL |

### Autocomplete strategy

```
Query arrives
    │
    ├─ Local Iraq DB (instant, curated cities/districts)
    │       ↓ merge + deduplicate
    └─ Photon (network, full POI coverage)
            ↓ rank by confidence × proximity
        Top 8 results → search bar
```

---

## Routing (Valhalla)

### What Valhalla is

Valhalla (<https://github.com/valhalla/valhalla>) is an open-source routing
engine that supports turn-by-turn navigation for cars, pedestrians, and bicycles
using OSM data.

### Setup

```bash
# 1. Build routing tiles from the Iraq PBF
valhalla_build_config \
  --mjolnir-tile-dir /var/lib/valhalla/tiles \
  --mjolnir-tile-extract /var/lib/valhalla/iraq.tar \
  > /etc/valhalla/valhalla.json

valhalla_build_tiles \
  -c /etc/valhalla/valhalla.json \
  geo-services/tiles/data/osm/iraq-latest.osm.pbf

# 2. Start Valhalla
valhalla_service /etc/valhalla/valhalla.json 1
```

The routing service listens on port `8002` by default.

### Route request example

```json
POST http://localhost:8002/route
{
  "locations": [
    {"lat": 33.3406, "lon": 44.4009},
    {"lat": 33.3062, "lon": 44.4069}
  ],
  "costing": "auto",
  "language": "ar",
  "directions_options": {"language": "ar"}
}
```

### Supported travel modes

| Mode | Valhalla costing | Use case |
|---|---|---|
| Car | `auto` | Default driving directions |
| Walking | `pedestrian` | Walking directions, city centre |
| Bicycle | `bicycle` | Future: cycling directions |

---

## Update procedures

### Weekly update (automated)

```cron
# Sunday 2 AM Baghdad time (UTC+3) = Saturday 23:00 UTC
0 23 * * 6  /srv/geo-services/tiles/scripts/download-iraq.sh --verify \
            && /srv/geo-services/tiles/scripts/build-tiles.sh \
            && aws s3 cp /data/tiles/iraq.pmtiles s3://$TILES_BUCKET/iraq.pmtiles
```

### After a tile update

1. Upload new `iraq.pmtiles` to S3.
2. The mobile app picks up the new tiles on next cold start (PMTiles range-requests).
3. No server restart needed.

### After a Photon update

```bash
# Re-import OSM data into Elasticsearch
java -jar /opt/photon/photon.jar -nominatim-import \
  -languages ar,en,ckb \
  -bbox 38.5,29.0,48.8,37.5
# Restart Photon (hot swap not supported — schedule for low-traffic hours)
systemctl restart photon
```

### After a Valhalla update

```bash
# Rebuild routing graph (takes 5–15 min for Iraq)
valhalla_build_tiles -c /etc/valhalla/valhalla.json \
  /data/osm/iraq-latest.osm.pbf
systemctl restart valhalla
```

---

## Iraq-specific considerations

### Language priority

All user-visible strings follow this priority:
1. `name:ar` — Arabic (product language)
2. `name:ckb` — Kurdish Sorani (northern Iraq)
3. `name:en` — English (international names)
4. `name` — OSM language-neutral tag

### Administrative hierarchy

Iraq uses a three-level administrative hierarchy in OSM:
- `admin_level=4` — Governorate (محافظة), 18 total
- `admin_level=6` — District / Qadha (قضاء)
- `admin_level=8` — Sub-district / Nahiya (ناحية)
- `admin_level=10` — Village/neighbourhood

The address formatter in `osm-pipeline/src/address-formatter.ts` maps these to
the Iraqi address format: **governorate / city / district / neighbourhood / street / number**.

### Friday prayer hours

Iraqi businesses typically close for Friday prayer (11:45–13:30 Baghdad time).
The opening hours parser (`opening-hours-parser.ts`) automatically subtracts this
block from Friday intervals when `applyPrayer: true` (the default).

### Ramadan hours

Many Iraqi businesses operate reduced or shifted hours during Ramadan.
The parser handles `Ramadan:` prefixed rules in `opening_hours` tags and
stores them as `ramadanIntervals` on the day schedule.

### Kurdistan Region

The Kurdistan Region (Erbil, Sulaymaniyah, Duhok governorates) uses Kurdish
Sorani (`name:ckb`) as its primary display language. The geocoder's Photon
instance is configured with `-languages ar,en,ckb` to index all three.

### Coordinate precision

All coordinates are stored at 7 decimal places (~1 cm precision), matching
OSM's native precision. The Iraq bbox validator rejects coordinates outside
29.0–37.5 N, 38.5–48.8 E at import time.

### OSM coverage quality

OSM coverage quality varies across Iraq:
- **Baghdad:** Very good — dense street network, many POIs, Arabic names present
- **Basra, Erbil, Mosul:** Good
- **Rural areas:** Sparse — villages may have only a centroid node
- **Western Anbar desert:** Minimal — highway network only

The app falls back to neighbourhood-level addressing when street-level data
is missing (handled by `address-formatter.ts → deriveAddressFromContext`).

---

## Service ports

| Service | Port | Protocol | Description |
|---|---|---|---|
| martin (tiles) | 3000 | HTTP | PMTiles tile server |
| Photon (geocoder) | 2322 | HTTP | Forward/reverse geocoding |
| Valhalla (routing) | 8002 | HTTP | Turn-by-turn routing |
| PostgreSQL | 5432 | TCP | Places, providers, insights |
| Redis | 6379 | TCP | BullMQ job queue, cache |

All services bind to `127.0.0.1` in development. In production, they are
behind the NestJS API reverse proxy — the mobile app never calls them directly.

---

## Troubleshooting

### Tiles not loading in the app

1. Check `TILES_BUCKET` env var is set in the API.
2. Verify `iraq.pmtiles` is accessible at the configured S3 URL.
3. Run `martin --check` against the PMTiles file to detect corruption.
4. Confirm the MapLibre style's `sources.tiles.url` is a `pmtiles://` URL.

### Geocoder returns no results for Arabic queries

1. Verify Photon was imported with `-languages ar`.
2. Check Elasticsearch is running: `curl http://localhost:9200/_cluster/health`.
3. Test Photon directly: `curl "http://localhost:2322/api?q=بغداد&lang=ar"`.
4. The local Iraq DB fallback should always return results for major cities.

### Routing fails for a specific area

1. Confirm the area is inside the Iraq bbox.
2. Check OSM has a connected road network in that area (use OSM's iD editor).
3. Rebuild the Valhalla graph after the next weekly OSM update.

### Import stats show high skip rate

Normal skip reasons:
- `filtered`: element has no interesting tags (expected — OSM has many natural features)
- `duplicate-id`: closed way already counted as both place and area (expected)
- `outside-bbox`: coordinates outside Iraq (expected for border areas)

Abnormal skip reasons:
- `invalid-coordinate`: may indicate a corrupt PBF — re-download.
- `error`: check the import log for TypeScript exceptions.
