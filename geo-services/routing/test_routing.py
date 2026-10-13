"""Integration tests for geo-services/routing.

Requires valhalla_build_tiles and valhalla_service on PATH (pyvalhalla or system).
Skipped automatically when they are not available.
"""

from __future__ import annotations

import json
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path

import pytest

HERE = Path(__file__).parent
FIXTURE = HERE / "fixture" / "fixture.osm"


def _has_valhalla() -> bool:
    return shutil.which("valhalla_build_tiles") is not None and shutil.which("valhalla_service") is not None


pytestmark = pytest.mark.skipif(not _has_valhalla(), reason="valhalla binaries not on PATH")


@pytest.fixture(scope="module")
def tile_dir(tmp_path_factory: pytest.TempPathFactory):
    d = tmp_path_factory.mktemp("valhalla")
    result = subprocess.run(
        ["python", str(HERE / "build_tiles.py"), "--input", str(FIXTURE), "--output", str(d)],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    return d


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _patch_config(config_path: Path, port: int) -> Path:
    config = json.loads(config_path.read_text())
    config["httpd"]["service"]["listen"] = f"tcp://127.0.0.1:{port}"
    out = config_path.parent / f"valhalla_{port}.json"
    out.write_text(json.dumps(config, indent=2))
    return out


def _wait(port: int, timeout: float = 30.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/status", timeout=2):
                return True
        except Exception:
            time.sleep(0.5)
    return False


@pytest.fixture(scope="module")
def valhalla_url(tile_dir):
    port = _free_port()
    cfg = _patch_config(tile_dir / "valhalla.json", port)
    proc = subprocess.Popen(
        ["valhalla_service", str(cfg), "1"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    assert _wait(port), "Valhalla did not start in time"
    yield f"http://127.0.0.1:{port}"
    proc.terminate()
    proc.wait(timeout=5)


def _route(base_url: str, costing: str, origin, destination) -> dict:
    payload = json.dumps({
        "locations": [
            {"lon": origin[0], "lat": origin[1]},
            {"lon": destination[0], "lat": destination[1]},
        ],
        "costing": costing,
        "directions_options": {"language": "en-US"},
    }).encode()
    req = urllib.request.Request(
        f"{base_url}/route",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())


# Fixture coordinates
# Footpath runs from (44.402, 33.302) to (44.406, 33.302) — motor_vehicle=no
ORIGIN = (44.400, 33.300)
DEST = (44.408, 33.305)
FOOT_ORIGIN = (44.402, 33.302)
FOOT_DEST = (44.406, 33.302)


def test_status(valhalla_url):
    with urllib.request.urlopen(f"{valhalla_url}/status", timeout=5) as resp:
        assert resp.status == 200
        data = json.loads(resp.read())
    assert "version" in data or "tileset_last_modified" in data or data


def test_car_route_finds_road(valhalla_url):
    result = _route(valhalla_url, "auto", ORIGIN, DEST)
    assert "trip" in result
    summary = result["trip"]["summary"]
    assert summary["length"] > 0


def test_walk_route_uses_footpath(valhalla_url):
    # Pedestrian route between the footpath endpoints should be short (direct)
    result = _route(valhalla_url, "pedestrian", FOOT_ORIGIN, FOOT_DEST)
    assert "trip" in result
    ped_length = result["trip"]["summary"]["length"]

    # Car route between same points must go around (footway has motor_vehicle=no)
    car_result = _route(valhalla_url, "auto", FOOT_ORIGIN, FOOT_DEST)
    car_length = car_result["trip"]["summary"]["length"]
    # Car route must be longer because it can't use the footpath
    assert car_length > ped_length, (
        f"Car ({car_length}) should be longer than walk ({ped_length}) when footpath is car-excluded"
    )


def test_build_tiles_creates_output(tile_dir):
    assert (tile_dir / "valhalla.json").exists()
    assert (tile_dir / "valhalla_tiles.tar").exists()
    tile_files = list((tile_dir / "valhalla_tiles").rglob("*"))
    assert any(f.is_file() for f in tile_files), "No tile files produced"
