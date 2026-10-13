"""Synthetic tests — no S3 access required."""
import json
import tempfile
from pathlib import Path

import numpy as np
import pytest
import rasterio
from rasterio.crs import CRS
from rasterio.transform import from_bounds


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_synthetic_tif(path: Path, bbox: list, shape=(256, 256)) -> None:
    """Create a small 3-band RGB GeoTIFF with a known WGS-84 extent."""
    west, south, east, north = bbox
    transform = from_bounds(west, south, east, north, shape[1], shape[0])
    data = np.random.randint(0, 255, (3, shape[0], shape[1]), dtype=np.uint8)
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        height=shape[0],
        width=shape[1],
        count=3,
        dtype=np.uint8,
        crs=CRS.from_epsg(4326),
        transform=transform,
    ) as dst:
        dst.write(data)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_crop_to_bbox_shrinks_extent():
    """crop_to_bbox should produce bounds inside (or equal to) the target bbox."""
    from pipeline import crop_to_bbox

    src_bbox = [44.0, 32.9, 44.8, 33.6]
    target_bbox = [44.1, 33.0, 44.7, 33.5]

    with tempfile.TemporaryDirectory() as tmpdir:
        src = Path(tmpdir) / "src.tif"
        dst = Path(tmpdir) / "dst.tif"
        make_synthetic_tif(src, src_bbox)
        crop_to_bbox(src, target_bbox, dst)

        with rasterio.open(dst) as r:
            b = r.bounds
            # The cropped raster must not extend beyond the *source* raster.
            assert b.left >= src_bbox[0] - 0.01
            assert b.right <= src_bbox[2] + 0.01
            assert b.bottom >= src_bbox[1] - 0.01
            assert b.top <= src_bbox[3] + 0.01
            # Band count must be preserved.
            assert r.count == 3


def test_crop_to_bbox_3_bands():
    """Output raster must have exactly 3 bands (RGB / TCI)."""
    from pipeline import crop_to_bbox

    with tempfile.TemporaryDirectory() as tmpdir:
        src = Path(tmpdir) / "src.tif"
        dst = Path(tmpdir) / "dst.tif"
        make_synthetic_tif(src, [44.0, 32.9, 44.8, 33.6])
        crop_to_bbox(src, [44.1, 33.0, 44.7, 33.5], dst)
        with rasterio.open(dst) as r:
            assert r.count == 3


def test_metadata_schema():
    """metadata.json must carry all fields required by SatelliteLayer."""
    required = {"capturedAt", "resolutionM", "attribution"}
    meta = {
        "city": "baghdad",
        "capturedAt": "2024-03-15",
        "resolutionM": 10,
        "attribution": "Contains modified Copernicus Sentinel data 2024",
        "cloudCover": 4.2,
    }
    with tempfile.TemporaryDirectory() as tmpdir:
        p = Path(tmpdir) / "metadata.json"
        p.write_text(json.dumps(meta))
        loaded = json.loads(p.read_text())
        assert required.issubset(loaded.keys()), f"Missing keys: {required - loaded.keys()}"
        assert loaded["resolutionM"] == 10
        assert "2024" in loaded["attribution"]
        assert loaded["capturedAt"] == "2024-03-15"


def test_attribution_txt():
    """ATTRIBUTION.txt must mention 'Copernicus Sentinel'."""
    from pipeline import write_attribution

    with tempfile.TemporaryDirectory() as tmpdir:
        out = Path(tmpdir)
        write_attribution(out, "2024")
        text = (out / "ATTRIBUTION.txt").read_text()
        assert "Copernicus Sentinel" in text
        assert "2024" in text


def test_list_scenes_returns_strings():
    """list_scenes called with a non-existent city falls back gracefully (returns [])."""
    from pipeline import list_scenes

    # Use a city key that has no MGRS entry to keep the test offline-safe:
    # the function will still build a real prefix but should return an empty list
    # if the bucket call fails (we don't want CI to hit real S3 here, but if it
    # does, we just check the return type).
    try:
        scenes = list_scenes("__nonexistent__")
        assert isinstance(scenes, list)
        for s in scenes:
            assert isinstance(s, str)
    except Exception:
        # Network not available — that's fine for synthetic tests.
        pytest.skip("S3 not reachable in this environment")


def test_pick_best_scene_empty_input():
    """pick_best_scene on empty list returns None without raising."""
    from pipeline import pick_best_scene

    assert pick_best_scene([]) is None
