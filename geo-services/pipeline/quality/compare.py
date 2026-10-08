"""Apply the MVP.md section 1 decision rule to two metrics files and render the report.

Usage:
  python -m quality.compare --base out/erbil.json --challenger out/baghdad.json \
      --json out/osm-quality.json --md out/osm-quality.md

Rule: keep the base city (Erbil) unless the challenger (Baghdad) has more than 30% higher
density of Arabic-named POIs per km2 of the configured urban area AND a higher largest-component
share of road length.
"""

import argparse
import json
import sys
from pathlib import Path

MARGIN = 0.30

ROWS = [
    ("area_km2", "مساحة المنطقة المقصوصة (كم²)"),
    ("roads.length_km", "مجموع أطوال الطرق (كم)"),
    ("roads.named_pct", "الشوارع ذات `name` (% من الطول)"),
    ("roads.name_ar_tag_pct", "الشوارع ذات `name:ar` (% من الطول)"),
    ("roads.arabic_named_pct", "الشوارع ذات اسم عربي (% من الطول)"),
    ("pois.total", "عدد الأماكن amenity/shop/tourism/office"),
    ("pois.by_key.amenity", "منها amenity"),
    ("pois.by_key.shop", "منها shop"),
    ("pois.by_key.tourism", "منها tourism"),
    ("pois.by_key.office", "منها office"),
    ("pois.named_pct", "الأماكن ذات `name` (%)"),
    ("pois.name_ar_tag_pct", "الأماكن ذات `name:ar` (%)"),
    ("pois.arabic_named_pct", "الأماكن المسمّاة بالعربية (%)"),
    ("pois.arabic_named_per_km2", "كثافة الأماكن المسمّاة بالعربية (لكل كم²)"),
    ("pois.phone_or_hours_pct", "الأماكن ذات هاتف أو ساعات عمل (%)"),
    ("roads.largest_component_length_pct", "الاتصال: أكبر مكوّن متصل (% من طول الطرق)"),
    ("roads.largest_component_nodes_pct", "الاتصال: أكبر مكوّن متصل (% من العقد)"),
    ("roads.components", "عدد المكوّنات المتصلة"),
    ("recency.recent_pct", "عناصر عُدّلت خلال 24 شهراً (% من كل العناصر)"),
    ("recency.features_recent_pct", "طرق وأماكن عُدّلت خلال 24 شهراً (%)"),
    ("contributors.unique", "المساهمون النشطون خلال 24 شهراً"),
]


def get(m, key):
    for part in key.split("."):
        m = m[part]
    return m


def decide(base, challenger, margin=MARGIN):
    bd = base["pois"]["arabic_named_per_km2"]
    cd = challenger["pois"]["arabic_named_per_km2"]
    bc = base["roads"]["largest_component_length_pct"]
    cc = challenger["roads"]["largest_component_length_pct"]
    density_wins = cd > bd * (1 + margin)
    connectivity_wins = cc > bc
    return {
        "rule": f"{base['city']} unless {challenger['city']} has > {margin:.0%} higher Arabic-named POI density per km2 AND higher largest-component road-length share",
        "density_ratio": round(cd / bd, 3) if bd else None,
        "challenger_density_wins": density_wins,
        "challenger_connectivity_wins": connectivity_wins,
        "choice": challenger["city"] if density_wins and connectivity_wins else base["city"],
    }


def fmt(v):
    if v is None:
        return "غير متاح*"
    return f"{v:,}" if isinstance(v, int) else f"{v:,.2f}"


def render(base, challenger, d):
    a, b = base["names"]["ar"], challenger["names"]["ar"]
    lines = [
        "# تقرير جودة OSM: " + f"{a} مقابل {b}",
        "",
        f"- تاريخ المرجع (as-of): {base['as_of']}، وتاريخ بيانات المستخرج: {base.get('data_timestamp') or 'غير مذكور'}",
        "- المصدر: Geofabrik iraq-latest.osm.pbf (ODbL، © مساهمو OpenStreetMap).",
        "",
        f"| المقياس | {a} | {b} |",
        "|---|---:|---:|",
    ]
    lines += [f"| {label} | {fmt(get(base, k))} | {fmt(get(challenger, k))} |" for k, label in ROWS]
    ratio = "غير محددة" if d["density_ratio"] is None else f"{d['density_ratio']:.3f}"
    choice = base if d["choice"] == base["city"] else challenger
    lines += [
        "",
        "## القرار",
        "",
        f"- القاعدة: نختار {a} إلا إذا تفوقت {b} بأكثر من {MARGIN:.0%} في كثافة الأماكن المسمّاة بالعربية لكل كم²، **و** كان اتصالها الشبكي أفضل.",
        f"- نسبة الكثافة ({b} ÷ {a}): {ratio}، تتجاوز {1 + MARGIN:.2f}؟ {'نعم' if d['challenger_density_wins'] else 'لا'}",
        f"- اتصال {b} أفضل؟ {'نعم' if d['challenger_connectivity_wins'] else 'لا'}",
        f"- **المدينة المختارة: {choice['names']['ar']} (`{choice['city']}`)**",
        "",
    ]
    if not (base["contributors"]["available"] and challenger["contributors"]["available"]):
        lines += ["\\* عدد المساهمين غير متاح: المستخرج العام من Geofabrik يحذف معرّفات المستخدمين (user/uid).", ""]
    return "\n".join(lines)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base", required=True)
    ap.add_argument("--challenger", required=True)
    ap.add_argument("--json", required=True)
    ap.add_argument("--md", required=True)
    a = ap.parse_args(argv)
    base, ch = (json.loads(Path(p).read_text(encoding="utf-8")) for p in (a.base, a.challenger))
    d = decide(base, ch)
    Path(a.json).write_text(
        json.dumps({"decision": d, "cities": [base, ch]}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    Path(a.md).write_text(render(base, ch, d), encoding="utf-8")
    print(f"choice: {d['choice']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
