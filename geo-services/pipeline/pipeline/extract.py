"""Extract one city into places.ndjson and city.json (CliContracts.pipelineExtract in packages/contracts).

Usage (pnpm runs it from geo-services/pipeline, so pass absolute paths):
  pnpm --filter @iraq-maps/geo-pipeline extract --city baghdad --input /abs/iraq-latest.osm.pbf --output /abs/out
  sh scripts/py.sh -m pipeline.extract --city baghdad --input ... --output ...

--city is a city id (cities/<id>.yaml) or a path to a city YAML. Writes to --output:
- <city>.osm.pbf: osmium extract of the city (smart strategy: multipolygons and boundaries kept whole).
- places.ndjson: PlaceImportRecord lines, unique ids sorted by kind then id. Records outside the city bbox are dropped.
  - place: a named node or area whose tags map to a PlaceCategory by packages/contracts/schemas/osm-categories.json
    (shared with the tiles profile; see category()) that the city config lists.
  - street: named STREETS ways, merged per name into connected chains. The id is the chain's lowest way id and
    the location is the chain vertex closest to the mean of its vertices.
  - area: place=suburb|quarter|neighbourhood (node or area), or boundary=administrative with admin_level 6-10.
    The location of an area polygon is the mean of its largest outer ring's vertices.
- city.json: CityImportRecord, centred on the bbox.
Every output line is validated against packages/contracts/schemas/*.schema.json. Prints the counts as JSON.
"""

import argparse
import functools
import json
import sys
from collections import defaultdict
from pathlib import Path

import jsonschema
import osmium

from quality import cities

ROOT = Path(__file__).resolve().parents[1]
SCHEMAS = ROOT.parents[1] / "packages" / "contracts" / "schemas"
STREETS = {
    "motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential",
    "living_street", "road", "pedestrian",
}
AREA_PLACES = {"suburb", "quarter", "neighbourhood"}
ADMIN_LEVELS = {"6", "7", "8", "9", "10"}
CONTACT = {
    "opening_hours": ("opening_hours",),
    "phone": ("phone", "contact:phone", "mobile", "contact:mobile"),
    "website": ("website", "contact:website", "url"),
}
KINDS = ("place", "street", "area")
OSM_CATEGORIES = json.loads((SCHEMAS / "osm-categories.json").read_text(encoding="utf-8"))
WS = "".join(c for c in map(chr, range(0x3001)) if c.isspace()) + "\ufeff"


def text(v):
    """Trimmed like zod's trim() (which also strips U+FEFF) and capped at 255 UTF-16 code units like zod's max(255)."""
    v = (v or "").strip(WS).encode("utf-16-le")[:510].decode("utf-16-le", "ignore")
    return v.strip(WS) or None


def names(t):
    n = {k: v for k in ("ar", "ckb", "en") if (v := text(t.get(f"name:{k}")))}
    name = text(t.get("name")) or n.get("ar") or n.get("ckb") or n.get("en")
    return {"name": name, **n} if name else None


def category(t, allowed):
    """The PlaceCategory that osm-categories.json gives these tags, as in the tiles profile: rules in order, the first
    that yields a category wins, an exact value beats "*", ignoredValues never match. None when no rule fits or the
    city does not list that category."""
    for rule in OSM_CATEGORIES["rules"]:
        v, values = t.get(rule["key"]), rule["values"]
        if v and v not in OSM_CATEGORIES["ignoredValues"] and (c := values.get(v, values.get("*"))):
            return c if c in allowed else None
    return None


def is_area(t):
    return t.get("place") in AREA_PLACES or (
        t.get("boundary") == "administrative" and t.get("admin_level") in ADMIN_LEVELS
    )


def record(oid, kind, n, cat, loc, tags):
    return {
        "id": oid, "kind": kind, "names": n, "category": cat,
        "location": [round(loc[0], 7), round(loc[1], 7)], "tags": tags,
    }


def feature(oid, t, loc, allowed):
    """A place or area record for a node or an area, or None."""
    n = names(t)
    if not n:
        return None
    if is_area(t):
        return record(oid, "area", n, None, loc, {})
    cat = category(t, allowed)
    if not cat:
        return None
    tags = {k: v for k, keys in CONTACT.items() if (v := next(filter(None, map(text, map(t.get, keys))), None))}
    return record(oid, "place", n, cat, loc, tags)


def root(parent, i):
    """Union-find root with path halving."""
    while parent[i] != i:
        parent[i] = i = parent[parent[i]]
    return i


def merge_streets(groups):
    """One street record per connected chain of same-named ways. groups: name -> [(way id, names, [(ref, x, y)])]."""
    for ways in groups.values():
        ways.sort(key=lambda w: w[0])
        parent, first = list(range(len(ways))), {}
        for i, (_, _, pts) in enumerate(ways):
            for ref, _, _ in pts:
                parent[root(parent, i)] = root(parent, first.setdefault(ref, i))
        chains = defaultdict(list)
        for i, w in enumerate(ways):
            chains[root(parent, i)].append(w)
        for chain in chains.values():
            merged = {}
            for _, n, _ in chain:
                for k, v in n.items():
                    merged.setdefault(k, v)
            pts = [(x, y) for _, _, p in chain for _, x, y in p]
            mx, my = sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)
            loc = min(pts, key=lambda p: (p[0] - mx) ** 2 + (p[1] - my) ** 2)
            yield record(f"w{chain[0][0]}", "street", merged, None, loc, {})


def records(path, cfg):
    allowed = set(cfg["categories"])
    out, streets = [], defaultdict(list)
    keys = osmium.filter.KeyFilter(*(r["key"] for r in OSM_CATEGORIES["rules"]), "highway", "place", "boundary")
    for o in osmium.FileProcessor(str(path)).with_areas().with_filter(keys):
        t = dict(o.tags)
        if o.is_node():
            out.append(feature(f"n{o.id}", t, (o.location.lon, o.location.lat), allowed))
        elif o.is_way():
            if t.get("highway") in STREETS and (n := names(t)):
                pts = [(nd.ref, nd.location.lon, nd.location.lat) for nd in o.nodes if nd.location.valid()]
                if pts:
                    streets[n["name"]].append((o.id, n, pts))
        elif o.is_area() and (rings := list(o.outer_rings())):  # a broken multipolygon yields no rings
            pts = [(nd.lon, nd.lat) for nd in max(rings, key=len)][:-1]  # a ring repeats its first node at the end
            loc = (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))
            out.append(feature(f"{'w' if o.from_way() else 'r'}{o.orig_id()}", t, loc, allowed))
    x0, y0, x1, y1 = cfg["bbox"]
    unique = {}  # a closed way can be both a street and a place; the place wins
    for r in [*out, *merge_streets(streets)]:
        if r and x0 <= r["location"][0] <= x1 and y0 <= r["location"][1] <= y1:
            unique.setdefault(r["id"], r)
    return sorted(unique.values(), key=lambda r: (KINDS.index(r["kind"]), r["id"][0], int(r["id"][1:])))


def validator(name):
    """Draft-07 validator for packages/contracts/schemas/<name>.schema.json."""
    return jsonschema.Draft7Validator(json.loads((SCHEMAS / f"{name}.schema.json").read_text(encoding="utf-8")))


def extract(cfg, src, out):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    clipped = out / f"{cfg['id']}.osm.pbf"
    cities.clip(cfg, src, clipped, "-s", "smart", "-S", "types=multipolygon,boundary")
    recs = records(clipped, cfg)
    x0, y0, x1, y1 = cfg["bbox"]
    city = {"id": cfg["id"], "names": cfg["names"], "bbox": cfg["bbox"], "center": [round((x0 + x1) / 2, 6), round((y0 + y1) / 2, 6)]}
    validator("city-import-record").validate(city)
    places = validator("place-import-record")
    for r in recs:
        places.validate(r)
    dump = functools.partial(json.dumps, ensure_ascii=False, separators=(",", ":"))
    (out / "places.ndjson").write_text("".join(dump(r) + "\n" for r in recs), encoding="utf-8")
    (out / "city.json").write_text(dump(city) + "\n", encoding="utf-8")
    return {"city": cfg["id"], **{k: sum(r["kind"] == k for r in recs) for k in KINDS}}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--city", required=True)
    ap.add_argument("--input", required=True)
    ap.add_argument("--output", required=True)
    a = ap.parse_args(argv)
    cfg = cities.load(a.city if a.city.endswith(".yaml") else ROOT / "cities" / f"{a.city}.yaml")
    print(json.dumps(extract(cfg, a.input, a.output)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
