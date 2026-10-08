import datetime as dt
import json
import math
import shutil
from pathlib import Path

import pytest

from quality import cities, metrics

FIX = Path(__file__).parent / "fixtures" / "mini-city.osm.xml"
AS_OF = dt.datetime(2026, 10, 8, tzinfo=dt.timezone.utc)
D = 6372797.560856 * math.pi / 180 * 0.01 / 1000  # km per 0.01 deg of latitude


@pytest.fixture(scope="module")
def m():
    return metrics.compute(FIX, AS_OF, 2.0)


def test_roads(m):
    # roads: 1001 (2d), 1002, 1003, 1004 service, 1005 isolated (d each); footway 1006 excluded
    # streets (no service/link): 5d; named 1001+1002+1003 = 4d; name:ar 1001 = 2d;
    # Arabic 1001 + 1003 = 3d (1002 is Sorani)
    assert m["roads"] == {
        "ways": 5,
        "length_km": round(6 * D, 3),
        "street_length_km": round(5 * D, 3),
        "named_pct": 80.0,
        "name_ar_tag_pct": 40.0,
        "arabic_named_pct": 60.0,
        "components": 2,
        "largest_component_length_pct": 83.33,  # 5d / 6d
        "largest_component_nodes_pct": 75.0,  # nodes 1-6 of 1-8
    }


def test_pois(m):
    # 101 restaurant, 102 shop, 103 hotel, 104 office, 105 bench, way 2001 cafe+shop, rel 3001 attraction
    # Arabic: 101 (Arabic name), 102 (name:ar), 2001 (Arabic name), 3001 (name:ar) -> 4 of 7
    # phone/hours: 101, 102, 103, 2001 -> 4 of 7
    assert m["pois"] == {
        "total": 7,
        "by_key": {"amenity": 3, "shop": 2, "tourism": 2, "office": 1},
        "named_pct": 71.43,
        "name_ar_tag_pct": 28.57,
        "arabic_named": 4,
        "arabic_named_pct": 57.14,
        "arabic_named_per_km2": 2.0,
        "phone_or_hours_pct": 57.14,
    }


def test_recency_and_contributors(m):
    # 27 elements; recent (>= 2024-10-08): node 3, 101, 102 (exactly on cutoff), way 1001, 2001, rel 3001.
    # 103 is one second too old. Features = 5 roads + 7 POIs; recent: 1001, 101, 102, 2001, 3001.
    assert m["recency"] == {
        "window_months": 24,
        "cutoff": "2024-10-08",
        "elements": 27,
        "recent_pct": 22.22,
        "features": 12,
        "features_recent_pct": 41.67,
    }
    assert m["contributors"] == {"available": False, "unique": None}


def test_contributors_when_metadata_present(tmp_path):
    f = tmp_path / "meta.osm.xml"
    f.write_text(
        '<osm version="0.6">'
        '<node id="1" version="1" uid="7" user="a" timestamp="2026-01-01T00:00:00Z" lat="36.1" lon="44"/>'
        '<node id="2" version="1" uid="8" user="b" timestamp="2026-01-01T00:00:00Z" lat="36.1" lon="44"/>'
        '<node id="3" version="1" uid="7" user="a" timestamp="2026-01-01T00:00:00Z" lat="36.1" lon="44"/>'
        '<node id="4" version="1" uid="9" user="c" timestamp="2019-01-01T00:00:00Z" lat="36.1" lon="44"/>'
        "</osm>"
    )
    assert metrics.compute(f, AS_OF, 1.0)["contributors"] == {"available": True, "unique": 2}


def test_arabic_name_detection():
    assert metrics.is_arabic_named({"name": "شارع الزهور"})
    assert metrics.is_arabic_named({"name": "Family Mall", "name:ar": "فاميلي مول"})
    assert not metrics.is_arabic_named({"name": "شەقامی گوڵان"})
    assert not metrics.is_arabic_named({"name": "Family Mall"})


def test_months_before_clamps_day():
    assert metrics.months_before(dt.date(2026, 2, 28), 24).date() == dt.date(2024, 2, 28)
    assert metrics.months_before(dt.date(2024, 2, 29), 24).date() == dt.date(2022, 2, 28)


def test_cli_writes_json(tmp_path):
    city = tmp_path / "erbil.yaml"
    shutil.copy(Path(__file__).parents[1] / "cities" / "erbil.yaml", city)
    out = tmp_path / "erbil.json"
    metrics.main(["--city", str(city), "--input", str(FIX), "--as-of", "2026-10-08", "-o", str(out)])
    j = json.loads(out.read_text(encoding="utf-8"))
    assert j["city"] == "erbil" and j["names"]["ar"] == "أربيل" and j["data_timestamp"] is None
    assert j["area_km2"] == round(cities.area_km2(cities.load(city)), 3)
    assert j["pois"]["arabic_named_per_km2"] == round(4 / cities.area_km2(cities.load(city)), 3)


@pytest.mark.skipif(not shutil.which("osmium"), reason="osmium-tool not installed")
def test_clip_drops_outside_road(tmp_path):
    cfg = {"bbox": [43.99, 36.14, 44.03, 36.21]}  # excludes the isolated road on lon 44.05
    out = tmp_path / "clip.osm.pbf"
    cities.clip(cfg, FIX, out)
    r = metrics.compute(out, AS_OF, 1.0)["roads"]
    assert r["ways"] == 4 and r["components"] == 1 and r["largest_component_length_pct"] == 100.0
