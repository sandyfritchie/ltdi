"""Language areas for the map's tier view, from Glottography.

Glottography's digitisation of Asher & Moseley's *Atlas of the World's Languages* (2007), contemporary
version: where each language is spoken today as the atlas drew it (English across Australia, Spanish
and Portuguese across much of South America). The same source the glossodesy project uses, in its
other version. Each area is linked to Glottolog, and through LinguaMeta's glottocodes to an LTDI
language (members absorbed into a macrolanguage or merged language count for it).

Areas are projected to the site's Equal Earth basemap and simplified for a world map (about half a
pixel at its 1000-pixel width, ~20 km). Equal Earth keeps areas true, so the share of the map each
tier covers is also its share of the land drawn.

Run:  python -m ltdi.areas   (clones Glottography/asher2007world into .cache; needs shapely)
Writes data/areas.json: {"paths": {code: SVG path}, "area": {code: square pixels}}
"""

from __future__ import annotations

import json
import subprocess

from . import CACHE, DATA
from .geo import LAT_MIN, to_svg

REPO = "https://github.com/Glottography/asher2007world"
TAG = "v2.0"
FILE = "cldf/contemporary/languages.geojson"
TOLERANCE = 0.5  # pixels at the basemap's 1000-pixel width
MIN_AREA = 0.3   # square pixels: smaller fragments are dropped


def source() -> dict:
    root = CACHE / "asher2007world"
    if not (root / FILE).exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        subprocess.run(["git", "clone", "-q", "--depth", "1", "--branch", TAG, "--filter=blob:none",
                        "--no-checkout", REPO, str(root)], check=True)
        subprocess.run(["git", "-C", str(root), "sparse-checkout", "set", "--no-cone", FILE], check=True)
        subprocess.run(["git", "-C", str(root), "checkout", "-q", TAG], check=True)
    return json.loads((root / FILE).read_text(encoding="utf-8"))


def glottocode_to_ltdi() -> dict[str, str]:
    from .backbone import records
    from .crosswalk import to_ltdi

    out = {}
    for code, rec in records().items():
        gc, ltdi = rec.get("glottocode"), to_ltdi(code)
        if gc and ltdi:
            out.setdefault(gc, ltdi)
    return out


def project(geom):
    """Lon/lat geometry -> basemap pixels, cropped where the basemap is."""
    from shapely import box
    from shapely.ops import transform

    geom = geom.intersection(box(-180, LAT_MIN, 180, 90))
    return transform(lambda xs, ys: tuple(zip(*(to_svg(x, y) for x, y in zip(xs, ys)))), geom)


def svg_path(geom) -> str:
    def ring(coords):
        pts = [f"{x:.1f},{y:.1f}" for x, y in coords[:-1]]
        return "M" + "L".join(pts) + "Z" if len(pts) >= 3 else ""

    polys = getattr(geom, "geoms", [geom])
    out = []
    for p in polys:
        if p.geom_type != "Polygon" or p.area < MIN_AREA:
            continue
        out.append(ring(list(p.exterior.coords)))
        out += [ring(list(r.coords)) for r in p.interiors if abs(r.envelope.area) >= MIN_AREA]
    return "".join(out)


def main() -> None:
    from shapely.geometry import shape
    from shapely.ops import unary_union

    scored = {l["code"] for l in json.loads((DATA / "languages.json").read_text(encoding="utf-8"))}
    to_code = glottocode_to_ltdi()
    by_code: dict[str, list] = {}
    unmatched = 0
    for f in source()["features"]:
        gc = f["properties"].get("cldf:languageReference")
        code = to_code.get(gc)
        if not code or code not in scored or not f.get("geometry"):
            unmatched += 1
            continue
        by_code.setdefault(code, []).append(shape(f["geometry"]).buffer(0))
    paths, area = {}, {}
    for code, geoms in sorted(by_code.items()):
        g = project(unary_union(geoms)).simplify(TOLERANCE, preserve_topology=True)
        p = svg_path(g)
        if p:
            paths[code], area[code] = p, round(g.area, 1)
    out = {"paths": paths, "area": area}
    (DATA / "areas.json").write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    size = (DATA / "areas.json").stat().st_size
    print(f"areas for {len(paths)} languages ({unmatched} atlas areas not matched), {size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
