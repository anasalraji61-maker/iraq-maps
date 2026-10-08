import copy
from pathlib import Path

import pytest

from quality import cities

CITIES = Path(__file__).parents[1] / "cities"


@pytest.mark.parametrize("cid", ["erbil", "baghdad"])
def test_real_configs_are_valid(cid):
    cfg = cities.load(CITIES / f"{cid}.yaml")
    assert cfg["id"] == cid and cfg["default_locales"][0] == "ar"
    assert 100 < cities.area_km2(cfg) < 1500


def test_area_of_bbox():
    # 0.1 x 0.1 deg box on the equator ~ 11.12 km x 11.12 km
    assert round(cities.area_km2({"bbox": [0, -0.05, 0.1, 0.05]}), 1) == 123.6


@pytest.mark.parametrize(
    "mutate, msg",
    [
        (lambda c: c["names"].pop("ckb"), "names"),
        (lambda c: c.update(bbox=[44.1, 36.1, 44.0, 36.2]), "min must be below max"),
        (lambda c: c.update(bbox=[10, 10, 11, 11]), "inside Iraq"),
        (lambda c: c.update(default_locales=["fr"]), "default_locales"),
        (lambda c: c.update(categories=[]), "categories"),
        (lambda c: c.update(extra=1), "unknown key: extra"),
        (lambda c: c.update(id="Erbil"), "slug"),
        (lambda c: c.update(polygon=[[44, 36.2], [44.05, 36.2], [44, 36.25]]), "closed ring"),
        (lambda c: c.update(polygon=[[40, 36.2], [44.05, 36.2], [44, 36.25], [40, 36.2]]), "inside bbox"),
    ],
)
def test_invalid_configs_rejected(mutate, msg):
    cfg = copy.deepcopy(cities.load(CITIES / "erbil.yaml"))
    mutate(cfg)
    assert any(msg in e for e in cities.validate(cfg))


def test_id_must_match_file_name():
    cfg = cities.load(CITIES / "erbil.yaml")
    assert cities.validate(cfg, "cities/baghdad.yaml") == ["id 'erbil' must match file name baghdad.yaml"]


def test_validate_cli():
    assert cities.main(["validate", str(CITIES / "erbil.yaml"), str(CITIES / "baghdad.yaml")]) == 0
