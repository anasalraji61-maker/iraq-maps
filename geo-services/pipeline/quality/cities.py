"""City config (cities/<id>.yaml): load, validate, area, clip.

Usage:
  python -m quality.cities validate cities/*.yaml
  python -m quality.cities clip cities/erbil.yaml iraq-latest.osm.pbf erbil.osm.pbf
"""

import itertools
import json
import math
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import yaml

LOCALES = {"ar", "ckb", "en"}
CATEGORIES = {
    "food", "cafe", "lodging", "shopping", "tourism", "health", "finance", "fuel",
    "office", "worship", "education", "government", "transport", "entertainment",
}
KEYS = {"id", "names", "bbox", "polygon", "default_locales", "categories"}
IRAQ = (38.7, 29.0, 48.8, 37.4)  # generous lon/lat envelope of Iraq


def validate(cfg, path=None):
    """Return a list of errors (empty when the config is valid)."""
    if not isinstance(cfg, dict):
        return ["config must be a mapping"]
    err = [f"unknown key: {k}" for k in sorted(set(cfg) - KEYS)]
    err += [f"missing key: {k}" for k in sorted(KEYS - {"polygon"} - set(cfg))]
    cid = cfg.get("id")
    if not isinstance(cid, str) or not re.fullmatch(r"[a-z][a-z0-9-]*", cid):
        err.append("id must be a lowercase slug")
    elif path and Path(path).stem != cid:
        err.append(f"id {cid!r} must match file name {Path(path).name}")
    names = cfg.get("names")
    if not isinstance(names, dict) or set(names) != LOCALES or not all(
        isinstance(v, str) and v.strip() for v in names.values()
    ):
        err.append("names must have non-empty ar, ckb and en")
    bbox = cfg.get("bbox")
    if not (isinstance(bbox, list) and len(bbox) == 4 and all(_num(v) for v in bbox)):
        err.append("bbox must be [min_lon, min_lat, max_lon, max_lat]")
    else:
        x0, y0, x1, y1 = bbox
        if not (x0 < x1 and y0 < y1):
            err.append("bbox min must be below max")
        if not (IRAQ[0] <= x0 and x1 <= IRAQ[2] and IRAQ[1] <= y0 and y1 <= IRAQ[3]):
            err.append("bbox must lie inside Iraq")
        poly = cfg.get("polygon")
        if poly is not None:
            if not (
                isinstance(poly, list) and len(poly) >= 4 and poly[0] == poly[-1]
                and all(isinstance(p, list) and len(p) == 2 and all(_num(v) for v in p) for p in poly)
            ):
                err.append("polygon must be a closed ring of >= 4 [lon, lat] points")
            elif not all(x0 <= p[0] <= x1 and y0 <= p[1] <= y1 for p in poly):
                err.append("polygon must lie inside bbox")
    for key, allowed in (("default_locales", LOCALES), ("categories", CATEGORIES)):
        v = cfg.get(key)
        if not (isinstance(v, list) and v and len(set(v)) == len(v) and set(v) <= allowed):
            err.append(f"{key} must be a non-empty unique subset of {sorted(allowed)}")
    return err


def _num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def load(path):
    cfg = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    err = validate(cfg, path)
    if err:
        raise ValueError(f"{path}: " + "; ".join(err))
    return cfg


def ring(cfg):
    if cfg.get("polygon"):
        return cfg["polygon"]
    x0, y0, x1, y1 = cfg["bbox"]
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]


def area_km2(cfg):
    """Shoelace area on a local equirectangular projection (good to <1% at city scale)."""
    pts = ring(cfg)
    lat0 = math.radians(sum(p[1] for p in pts) / len(pts))
    k = 6371.0088 * math.pi / 180
    xy = [(p[0] * k * math.cos(lat0), p[1] * k) for p in pts]
    return abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in itertools.pairwise(xy))) / 2


def clip(cfg, src, dst):
    """osmium extract (complete_ways strategy: ways crossing the edge are kept whole)."""
    cmd = ["osmium", "extract", "--overwrite", "--output-header=osmosis_replication_timestamp!", "-o", str(dst)]
    with tempfile.TemporaryDirectory() as tmp:
        if cfg.get("polygon"):
            geo = Path(tmp) / "boundary.geojson"
            geo.write_text(json.dumps({"type": "Polygon", "coordinates": [cfg["polygon"]]}))
            cmd += ["-p", str(geo)]
        else:
            cmd += ["-b", ",".join(str(v) for v in cfg["bbox"])]
        subprocess.run(cmd + [str(src)], check=True)


def main(argv):
    if len(argv) >= 2 and argv[0] == "validate":
        bad = 0
        for p in argv[1:]:
            try:
                cfg = load(p)
                print(f"ok {p}: {area_km2(cfg):.1f} km2")
            except ValueError as e:
                bad += 1
                print(e, file=sys.stderr)
        return 1 if bad else 0
    if len(argv) == 4 and argv[0] == "clip":
        clip(load(argv[1]), argv[2], argv[3])
        return 0
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
