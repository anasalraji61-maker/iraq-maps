"""
Sentinel-2 L2A → raster PMTiles pipeline.

Usage:
  python pipeline.py --city baghdad --bbox "44.1,33.0,44.7,33.5" --output ./tiles/
  python pipeline.py --city baghdad --bbox "44.1,33.0,44.7,33.5" --output ./tiles/ --max-cloud 20

Outputs:
  <output>/<city>-satellite.pmtiles   raster WebP tiles z10–z14, clipped to city bbox
  <output>/ATTRIBUTION.txt
  <output>/metadata.json              holds attribution, resolutionM, capturedAt (SatelliteLayer schema)
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path

import boto3
import boto3.session


# Public sentinel-cogs bucket (AWS Open Data, no credentials required).
_BUCKET = "sentinel-cogs"
_REGION = "us-west-2"

# Baghdad's MGRS tile grid square.  Each city config lives in
# geo-services/pipeline/cities/<id>.yaml; hard-coded here for the MVP city.
_CITY_MGRS = {
    "baghdad": ("38", "S", "MB"),
}

_DEFAULT_MAX_CLOUD = 20


def _s3_client():
    return boto3.client(
        "s3",
        region_name=_REGION,
        config=boto3.session.Config(signature_version="UNSIGNED"),
    )


def list_scenes(city: str, year_start: int = 2023) -> list[str]:
    """Return S3 key prefixes for all Sentinel-2 L2A COG scenes for *city*.

    Lists the public sentinel-cogs bucket directly (STAC Earth Search is blocked
    in CI).  Each returned prefix ends with '/' and points to one acquisition.
    """
    s3 = _s3_client()
    utm_zone, lat_band, grid_sq = _CITY_MGRS.get(city, ("38", "S", "MB"))
    scenes: list[str] = []
    paginator = s3.get_paginator("list_objects_v2")
    now_year = datetime.now().year
    for year in range(year_start, now_year + 1):
        prefix = f"sentinel-s2-l2a-cogs/{utm_zone}/{lat_band}/{grid_sq}/{year}/"
        for page in paginator.paginate(Bucket=_BUCKET, Prefix=prefix, Delimiter="/"):
            for cp in page.get("CommonPrefixes", []):
                # Each CommonPrefix is e.g. ".../2024/3/" (month); list one more level
                for page2 in paginator.paginate(
                    Bucket=_BUCKET, Prefix=cp["Prefix"], Delimiter="/"
                ):
                    for cp2 in page2.get("CommonPrefixes", []):
                        # day-level prefix; acquisitions live one level deeper
                        for page3 in paginator.paginate(
                            Bucket=_BUCKET, Prefix=cp2["Prefix"], Delimiter="/"
                        ):
                            for cp3 in page3.get("CommonPrefixes", []):
                                scenes.append(cp3["Prefix"])
    return scenes


def pick_best_scene(scenes: list[str], max_cloud: float = _DEFAULT_MAX_CLOUD):
    """Return (prefix, tileinfo_dict) for the scene with lowest cloud cover
    below *max_cloud*, or None if nothing qualifies.
    """
    s3 = _s3_client()
    best_prefix = None
    best_info: dict = {}
    best_cloud: float = max_cloud + 1

    for scene_prefix in scenes[:40]:  # cap to avoid long CI runs
        try:
            obj = s3.get_object(Bucket=_BUCKET, Key=scene_prefix + "tileinfo.json")
            info = json.loads(obj["Body"].read())
            cloud = float(info.get("cloudyPixelPercentage", 100))
            if cloud < best_cloud:
                best_cloud = cloud
                best_prefix = scene_prefix
                best_info = info
        except Exception:
            continue

    if best_prefix is None:
        return None
    return best_prefix, best_info


def download_tci(scene_prefix: str, out_path: Path) -> None:
    """Download the TCI (True Color Image) GeoTIFF for *scene_prefix*."""
    s3 = _s3_client()
    key = scene_prefix + "TCI.tif"
    s3.download_file(_BUCKET, key, str(out_path))


def crop_to_bbox(src_path: Path, bbox: list[float], out_path: Path) -> None:
    """Crop a GeoTIFF to *bbox* [west, south, east, north] in WGS-84."""
    import rasterio
    from rasterio.crs import CRS
    from rasterio.mask import mask
    from shapely.geometry import box, mapping

    west, south, east, north = bbox
    geom = mapping(box(west, south, east, north))

    with rasterio.open(src_path) as src:
        out_image, out_transform = mask(src, [geom], crop=True, all_touched=True)
        out_meta = src.meta.copy()
        out_meta.update(
            {
                "height": out_image.shape[1],
                "width": out_image.shape[2],
                "transform": out_transform,
            }
        )
        with rasterio.open(out_path, "w", **out_meta) as dst:
            dst.write(out_image)


def to_pmtiles(
    tif_path: Path, out_path: Path, min_zoom: int = 10, max_zoom: int = 14
) -> None:
    """Convert *tif_path* to raster PMTiles at *out_path*.

    Tries rio-pmtiles (``rio pmtiles`` CLI) first; raises RuntimeError if
    unavailable so callers can handle the fallback.
    """
    result = subprocess.run(
        [
            "rio",
            "pmtiles",
            str(tif_path),
            str(out_path),
            "--min-zoom",
            str(min_zoom),
            "--max-zoom",
            str(max_zoom),
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"rio pmtiles failed (exit {result.returncode}):\n{result.stderr}\n"
            "Install rio-pmtiles:  pip install rio-pmtiles\n"
            "or go-pmtiles:        https://github.com/protomaps/go-pmtiles"
        )


def write_attribution(out_dir: Path, year: str) -> None:
    text = (
        f"Contains modified Copernicus Sentinel data {year}\n"
        "Sentinel-2 data is available free of charge from the Copernicus Open Access Hub\n"
        "https://dataspace.copernicus.eu\n"
    )
    (out_dir / "ATTRIBUTION.txt").write_text(text)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Sentinel-2 → raster PMTiles")
    parser.add_argument("--city", required=True, help="City id (e.g. baghdad)")
    parser.add_argument(
        "--bbox",
        required=True,
        help="west,south,east,north in WGS-84 (e.g. 44.1,33.0,44.7,33.5)",
    )
    parser.add_argument("--output", required=True, help="Output directory (absolute)")
    parser.add_argument(
        "--max-cloud",
        type=float,
        default=_DEFAULT_MAX_CLOUD,
        help=f"Maximum cloud cover %% (default {_DEFAULT_MAX_CLOUD})",
    )
    args = parser.parse_args(argv)

    bbox = list(map(float, args.bbox.split(",")))
    if len(bbox) != 4:
        print("--bbox must be west,south,east,north", file=sys.stderr)
        return 1

    out_dir = Path(args.output)
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"[imagery] Listing Sentinel-2 scenes for city={args.city}…")
    scenes = list_scenes(args.city)
    if not scenes:
        print("[imagery] ERROR: no scenes found for city", args.city, file=sys.stderr)
        return 1

    print(f"[imagery] {len(scenes)} scenes found; selecting best (max cloud {args.max_cloud}%)…")
    result = pick_best_scene(scenes, max_cloud=args.max_cloud)
    if result is None:
        print(
            f"[imagery] ERROR: no scene with cloud cover ≤{args.max_cloud}%",
            file=sys.stderr,
        )
        return 1

    scene_prefix, info = result
    captured_at: str = (info.get("timestamp") or info.get("datetime") or "")[:10]
    year = captured_at[:4] or str(datetime.now().year)
    cloud = info.get("cloudyPixelPercentage", "?")
    print(f"[imagery] Best scene: {scene_prefix}  cloud={cloud}%  date={captured_at}")

    with tempfile.TemporaryDirectory() as tmpdir:
        tci_path = Path(tmpdir) / "TCI.tif"
        cropped_path = Path(tmpdir) / "cropped.tif"

        print("[imagery] Downloading TCI…")
        download_tci(scene_prefix, tci_path)

        print("[imagery] Cropping to bbox…")
        crop_to_bbox(tci_path, bbox, cropped_path)

        pmtiles_path = out_dir / f"{args.city}-satellite.pmtiles"
        print(f"[imagery] Converting to PMTiles → {pmtiles_path}")
        to_pmtiles(cropped_path, pmtiles_path)

    attribution = f"Contains modified Copernicus Sentinel data {year}"
    metadata = {
        "city": args.city,
        "bbox": bbox,
        "capturedAt": captured_at,
        "cloudCover": cloud,
        "attribution": attribution,
        "resolutionM": 10,
        "scenePrefix": scene_prefix,
    }
    (out_dir / "metadata.json").write_text(json.dumps(metadata, indent=2))
    write_attribution(out_dir, year)

    print(f"[imagery] Done. metadata:\n{json.dumps(metadata, indent=2)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
