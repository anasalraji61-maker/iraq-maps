import json

from quality import compare


def city(cid, density, conn, contributors=None):
    return {
        "city": cid,
        "names": {"ar": {"erbil": "أربيل", "baghdad": "بغداد"}[cid], "ckb": "-", "en": cid},
        "as_of": "2026-10-08",
        "data_timestamp": None,
        "area_km2": 1.0,
        "roads": {k: 0 for k in ("length_km", "named_pct", "name_ar_tag_pct", "arabic_named_pct",
                                 "largest_component_nodes_pct", "components")}
        | {"largest_component_length_pct": conn},
        "pois": {k: 0 for k in ("total", "named_pct", "name_ar_tag_pct", "arabic_named_pct", "phone_or_hours_pct")}
        | {"by_key": {"amenity": 0, "shop": 0, "tourism": 0, "office": 0}, "arabic_named_per_km2": density},
        "recency": {"recent_pct": 0, "features_recent_pct": 0},
        "contributors": {"available": contributors is not None, "unique": contributors},
    }


def test_erbil_by_default():
    assert compare.decide(city("erbil", 10, 90), city("baghdad", 12, 95))["choice"] == "erbil"


def test_exactly_30_percent_is_not_enough():
    d = compare.decide(city("erbil", 10, 90), city("baghdad", 13, 95))
    assert d["choice"] == "erbil" and not d["challenger_density_wins"] and d["density_ratio"] == 1.3


def test_baghdad_needs_density_and_connectivity():
    assert compare.decide(city("erbil", 10, 90), city("baghdad", 13.1, 95))["choice"] == "baghdad"
    assert compare.decide(city("erbil", 10, 90), city("baghdad", 50, 90))["choice"] == "erbil"  # equal conn
    assert compare.decide(city("erbil", 10, 90), city("baghdad", 50, 80))["choice"] == "erbil"


def test_zero_base_density():
    d = compare.decide(city("erbil", 0, 90), city("baghdad", 1, 95))
    assert d["choice"] == "baghdad" and d["density_ratio"] is None


def test_cli_report(tmp_path):
    (tmp_path / "e.json").write_text(json.dumps(city("erbil", 10, 90)))
    (tmp_path / "b.json").write_text(json.dumps(city("baghdad", 12, 95)))
    args = ["--base", "e.json", "--challenger", "b.json", "--json", "r.json", "--md", "r.md"]
    compare.main([str(tmp_path / a) if a.endswith((".json", ".md")) else a for a in args])
    md = (tmp_path / "r.md").read_text(encoding="utf-8")
    assert "| المقياس | أربيل | بغداد |" in md
    assert "المدينة المختارة: أربيل (`erbil`)" in md
    assert "عدد المساهمين غير متاح" in md
    assert (
        "- المصدر: Geofabrik iraq-latest.osm.pbf — © OpenStreetMap contributors، ترخيص ODbL 1.0 "
        "(https://www.openstreetmap.org/copyright)\n" in md
    )
    report = json.loads((tmp_path / "r.json").read_text(encoding="utf-8"))
    assert report["decision"]["choice"] == "erbil"
    assert report["source"] == {
        "attribution": "© OpenStreetMap contributors",
        "license": "ODbL-1.0",
        "url": "https://www.openstreetmap.org/copyright",
        "extract": "Geofabrik iraq-latest",
    }
