"""MVP.md section 1 decision-gate metrics for one city extract.

Usage:
  python -m quality.metrics --city cities/erbil.yaml --input erbil.osm.pbf --as-of 2026-10-08 -o out/erbil.json

Definitions (kept identical for every city):
- road: way with highway in ROADS (car network incl. service and *_link). Lengths are haversine km.
- street: road that is not service or *_link; name percentages are length-weighted over streets.
- Arabic name: name:ar is set, or name is in Arabic script without Sorani-only letters.
- POI: node, way or relation with any of amenity/shop/tourism/office; by_key counts every key it has.
- connectivity: union-find on road node ids; largest component share of road length (and of nodes).
- recency: element timestamp >= as_of minus 24 months. "features" = roads + POIs.
- contributors: unique uids among recent elements, or unavailable when the extract has no user metadata (public Geofabrik).
"""

import argparse
import calendar
import datetime as dt
import itertools
import json
import re
import sys
from pathlib import Path

import osmium

from quality import cities

POI_KEYS = ("amenity", "shop", "tourism", "office")
PHONE_HOURS = ("phone", "contact:phone", "mobile", "contact:mobile", "opening_hours")
ROADS = {
    "motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential",
    "living_street", "road", "service",
    "motorway_link", "trunk_link", "primary_link", "secondary_link", "tertiary_link",
}
ARABIC = re.compile("[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]")
SORANI = re.compile("[ڕۆێڵەھ]")  # ڕ ۆ ێ ڵ ە ھ
RECENT_MONTHS = 24


def is_arabic_named(tags):
    if tags.get("name:ar"):
        return True
    name = tags.get("name") or ""
    return bool(ARABIC.search(name)) and not SORANI.search(name)


def months_before(d, months):
    y, m = divmod(d.year * 12 + d.month - 1 - months, 12)
    day = min(d.day, calendar.monthrange(y, m + 1)[1])
    return dt.datetime(y, m + 1, day, tzinfo=dt.timezone.utc)


def pct(a, b):
    return round(100 * a / b, 2) if b else 0.0


def compute(path, as_of, area_km2):
    cutoff = months_before(as_of, RECENT_MONTHS)
    n_el = n_recent = n_feat = n_feat_recent = 0
    has_uid, uids = False, set()
    roads = []  # (node_ids, km, tags)
    pois = []  # tags dicts
    for o in osmium.FileProcessor(str(path)).with_locations():
        n_el += 1
        recent = o.timestamp >= cutoff
        n_recent += recent
        if o.uid:
            has_uid = True
            if recent:
                uids.add(o.uid)
        tags = dict(o.tags) if len(o.tags) else {}
        feature = False
        if o.is_way() and tags.get("highway") in ROADS:
            try:
                km = osmium.geom.haversine_distance(o.nodes) / 1000
            except osmium.InvalidLocationError:
                km = 0.0
            roads.append(([n.ref for n in o.nodes], km, tags))
            feature = True
        if any(k in tags for k in POI_KEYS):
            pois.append(tags)
            feature = True
        n_feat += feature
        n_feat_recent += feature and recent

    parent = {}

    def find(x):
        while parent.setdefault(x, x) != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for ids, _, _ in roads:
        for a, b in itertools.pairwise(ids):
            ra, rb = find(a), find(b)
            if ra != rb:
                parent[ra] = rb
    comp_km, comp_nodes = {}, {}
    for ids, km, _ in roads:
        if ids:
            r = find(ids[0])
            comp_km[r] = comp_km.get(r, 0) + km
    for n in list(parent):
        r = find(n)
        comp_nodes[r] = comp_nodes.get(r, 0) + 1

    total_km = sum(km for _, km, _ in roads)
    streets = [(km, t) for _, km, t in roads if t["highway"] != "service" and not t["highway"].endswith("_link")]
    street_km = sum(km for km, _ in streets)
    big = max(comp_km, key=comp_km.get) if comp_km else None
    n_poi = len(pois)
    n_ar = sum(map(is_arabic_named, pois))
    return {
        "as_of": as_of.date().isoformat(),
        "area_km2": round(area_km2, 3),
        "roads": {
            "ways": len(roads),
            "length_km": round(float(total_km), 3),
            "street_length_km": round(float(street_km), 3),
            "named_pct": pct(sum(km for km, t in streets if t.get("name")), street_km),
            "name_ar_tag_pct": pct(sum(km for km, t in streets if t.get("name:ar")), street_km),
            "arabic_named_pct": pct(sum(km for km, t in streets if is_arabic_named(t)), street_km),
            "components": len(comp_km),
            "largest_component_length_pct": pct(comp_km[big], total_km) if big else 0.0,
            "largest_component_nodes_pct": pct(comp_nodes.get(big, 0), len(parent)),
        },
        "pois": {
            "total": n_poi,
            "by_key": {k: sum(k in t for t in pois) for k in POI_KEYS},
            "named_pct": pct(sum(bool(t.get("name")) for t in pois), n_poi),
            "name_ar_tag_pct": pct(sum(bool(t.get("name:ar")) for t in pois), n_poi),
            "arabic_named": n_ar,
            "arabic_named_pct": pct(n_ar, n_poi),
            "arabic_named_per_km2": round(n_ar / area_km2, 3) if area_km2 else 0.0,
            "phone_or_hours_pct": pct(sum(any(t.get(k) for k in PHONE_HOURS) for t in pois), n_poi),
        },
        "recency": {
            "window_months": RECENT_MONTHS,
            "cutoff": cutoff.date().isoformat(),
            "elements": n_el,
            "recent_pct": pct(n_recent, n_el),
            "features": n_feat,
            "features_recent_pct": pct(n_feat_recent, n_feat),
        },
        "contributors": {"available": has_uid, "unique": len(uids) if has_uid else None},
    }


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--city", required=True)
    ap.add_argument("--input", required=True)
    ap.add_argument("--as-of", required=True, type=dt.date.fromisoformat)
    ap.add_argument("-o", "--out", required=True)
    a = ap.parse_args(argv)
    cfg = cities.load(a.city)
    as_of = dt.datetime.combine(a.as_of, dt.time(), dt.timezone.utc)
    header = osmium.io.Reader(a.input, osmium.osm.osm_entity_bits.NOTHING)
    data_ts = header.header().get("osmosis_replication_timestamp") or None
    header.close()
    m = {"city": cfg["id"], "names": cfg["names"], "data_timestamp": data_ts}
    m.update(compute(a.input, as_of, cities.area_km2(cfg)))
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(json.dumps(m, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(m, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
