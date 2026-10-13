"""Build Valhalla routing tiles from an OSM input file.

CLI contract (RoutingCliContracts.routingTilesBuild):
  python build_tiles.py --input <path.osm[.pbf]> --output <dir>

Writes <output>/valhalla.json and <output>/valhalla_tiles.tar.
When called with no arguments it uses fixture/fixture.osm and output/ (for local dev).
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tarfile
from pathlib import Path


HERE = Path(__file__).parent


def build_tiles(input_path: Path, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    tile_dir = output_dir / "valhalla_tiles"
    tile_dir.mkdir(exist_ok=True)

    config_path = output_dir / "valhalla.json"
    config = {
        "mjolnir": {
            "tile_dir": str(tile_dir),
            "timezone": "",
            "admin": "",
        },
        "loki": {
            "actions": ["locate", "route", "status"],
            "logging": {"type": "std_out", "color": False, "file_name": ""},
            "service": {"proxy": "ipc:///tmp/loki"},
        },
        "thor": {
            "logging": {"type": "std_out", "color": False, "file_name": ""},
            "service": {"proxy": "ipc:///tmp/thor"},
        },
        "odin": {
            "logging": {"type": "std_out", "color": False, "file_name": ""},
            "service": {"proxy": "ipc:///tmp/odin"},
        },
        "tyr": {
            "actions": ["route"],
            "logging": {"type": "std_out", "color": False, "file_name": ""},
            "service": {"proxy": "ipc:///tmp/tyr"},
        },
        "httpd": {
            "service": {
                "listen": "tcp://127.0.0.1:8002",
                "loopback": "ipc:///tmp/loopback",
                "interrupt": "ipc:///tmp/interrupt",
            }
        },
        "service_limits": {
            "auto": {"max_distance": 5000000.0, "max_locations": 20},
            "pedestrian": {"max_distance": 250000.0, "max_locations": 20},
        },
    }
    config_path.write_text(json.dumps(config, indent=2))

    try:
        import valhalla  # type: ignore[import]
        valhalla.Configure(str(config_path))
        valhalla.build_tiles(str(config_path), [str(input_path)])
    except ImportError:
        # Fall back to subprocess (valhalla_build_tiles binary on PATH)
        result = subprocess.run(
            ["valhalla_build_tiles", "-c", str(config_path), str(input_path)],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise RuntimeError(
                f"valhalla_build_tiles failed (exit {result.returncode}):\n{result.stderr}"
            )

    tile_files = list(tile_dir.rglob("*"))
    if not any(f.is_file() for f in tile_files):
        raise RuntimeError(f"No tiles were created in {tile_dir}")

    tar_path = output_dir / "valhalla_tiles.tar"
    with tarfile.open(tar_path, "w") as tar:
        tar.add(tile_dir, arcname="valhalla_tiles")

    print(f"Tiles built: {config_path}", flush=True)
    print(f"Archive: {tar_path}", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build Valhalla routing tiles")
    parser.add_argument("--input", type=Path, default=HERE / "fixture" / "fixture.osm")
    parser.add_argument("--output", type=Path, default=HERE / "output")
    args = parser.parse_args()

    if not args.input.exists():
        print(f"Input file not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    build_tiles(args.input, args.output)


if __name__ == "__main__":
    main()
