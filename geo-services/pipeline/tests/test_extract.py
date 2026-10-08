"""Acceptance criterion M1 #1: the extract of tests/fixtures/baghdad-mini.osm.xml (see its header)."""

import json
from pathlib import Path

import pytest

from pipeline import extract

FIX = Path(__file__).parent / "fixtures"
GOLDEN = FIX / "baghdad-mini"  # committed output, read by the places and e2e tests
EXPECTED = {
    # 117 lies outside the bbox; 114-116 have no category or no name; 303 is place=city
    "place": [f"n{i}" for i in range(101, 114)] + ["r3001", "w2001"],
    # 1002 merges into 1001 (shared node 3); 1003 and 1004 share a name but not a node; 1006 footway, 1007 unnamed
    "street": ["w1001", "w1003", "w1004", "w1005"],
    "area": ["n301", "n302", "r4001", "w2003"],
}


@pytest.fixture(scope="module")
def out(tmp_path_factory):
    d = tmp_path_factory.mktemp("baghdad")
    assert extract.main(["--city", "baghdad", "--input", str(FIX / "baghdad-mini.osm.xml"), "--output", str(d)]) == 0
    return d


def lines(d):
    return [json.loads(s) for s in (d / "places.ndjson").read_text(encoding="utf-8").splitlines()]


def test_exact_counts_and_ids(out):
    recs = lines(out)
    assert {k: [r["id"] for r in recs if r["kind"] == k] for k in EXPECTED} == EXPECTED
    assert len(recs) == 23 and (out / "baghdad.osm.pbf").stat().st_size > 0


def test_every_line_matches_the_contract_schema(out):
    places = extract.validator("place-import-record")
    for r in lines(out):
        assert not list(places.iter_errors(r)), r["id"]
    city = json.loads((out / "city.json").read_text(encoding="utf-8"))
    assert not list(extract.validator("city-import-record").iter_errors(city))
    assert city["center"] == [44.385, 33.325]


def test_committed_fixture_output_is_current(out):
    # Regenerate with the command in README.md when the fixture or the extract changes.
    for f in ("places.ndjson", "city.json"):
        assert (out / f).read_text(encoding="utf-8") == (GOLDEN / f).read_text(encoding="utf-8"), f


def test_record_details(out):
    r = {x["id"]: x for x in lines(out)}
    assert r["n101"]["names"] == {"name": "مطعم أربيل", "ckb": "چێشتخانەی هەولێر", "en": "Erbil Restaurant"}
    assert r["n102"]["names"]["name"] == "قلعة الرصافة" and r["n102"]["category"] == "tourism"
    assert r["n104"]["names"] == {"name": "صيدلية الكرادة"}  # trimmed
    assert r["n113"]["names"] == {"name": "مدرسة الوحدة الابتدائية", "ar": "مدرسة الوحدة الابتدائية"}
    assert r["n103"]["tags"]["phone"] == "+964 770 100 0103"  # from contact:phone
    assert r["n105"]["tags"]["website"] == "https://example.org/nahrain-bank"  # from contact:website
    assert r["n111"]["category"] == "government" and r["n112"]["category"] == "entertainment"
    # merged chain: names from both ways, location on its middle vertex (node 3)
    assert r["w1001"]["names"] == {"name": "شارع الكرادة داخل", "en": "Karrada Dakhil Street", "ar": "شارع الكرادة داخل"}
    assert r["w1001"]["location"] == [44.414, 33.302] and r["w1001"]["category"] is None
    assert r["w2001"]["location"] == [44.425, 33.31] and r["r3001"]["location"] == [44.38, 33.275]
    assert r["r4001"]["names"]["en"] == "Jadriya" and r["r4001"]["tags"] == {}


@pytest.mark.parametrize(
    "tags, allowed, cat",
    [
        ({"shop": "vacant", "amenity": "cafe"}, {"shopping", "cafe"}, "cafe"),
        ({"amenity": "restaurant", "shop": "bakery"}, {"shopping"}, "shopping"),  # first allowed match
        ({"office": "diplomatic"}, {"government", "office"}, "government"),
        ({"amenity": "parking"}, {"food"}, None),
    ],
)
def test_category(tags, allowed, cat):
    assert extract.category(tags, allowed) == cat


def test_names_are_capped_at_255():
    assert extract.names({"name": "x" * 300 + " ", "name:en": " "}) == {"name": "x" * 255}
    assert extract.names({"name": "  "}) is None
