"""Map data: a point for every LinguaMeta language, and a world basemap.

Run:  python -m ltdi.geo
Writes:
  data/world_languages.json  [code, name, x, y, speakers] for every individual language with a location
  data/borders.json          {"countries", "other"}: Natural Earth 50m outlines, for the map zoomed to
                             chosen countries
  data/basemap.json          {"width", "height", "path", "countries", "regions"}: Natural Earth countries
                             (110m, via world-atlas), projected to Equal Earth as one SVG path, each
                             country's outline and the box to frame it, and the box for each region

A language's point is LinguaMeta's geolocation for its origin country where
config/language_overrides.csv gives one, otherwise for the country with the most
speakers. Macrolanguages are left out of the background layer (their members
are plotted), except where they are scored languages.
"""

from __future__ import annotations

import csv
import io
import json
import math
import subprocess
import tarfile

from . import CACHE, CONFIG, DATA
from .http import fetch

WORLD_ATLAS = "https://registry.npmjs.org/world-atlas/-/world-atlas-2.0.2.tgz"
WIDTH = 1000

# Equal Earth projection (Šavrič, Patterson & Jenny 2018)
A1, A2, A3, A4 = 1.340264, -0.081106, 0.000893, 0.003796
M = math.sqrt(3) / 2


def equal_earth(lon: float, lat: float) -> tuple[float, float]:
    lam, phi = math.radians(lon), math.radians(lat)
    th = math.asin(M * math.sin(phi))
    t2 = th * th
    t6 = t2 * t2 * t2
    x = lam * math.cos(th) / (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)))
    y = th * (A1 + A2 * t2 + t6 * (A3 + A4 * t2))
    return x, y


XMAX = equal_earth(180, 0)[0]
YMAX = equal_earth(0, 90)[1]
SCALE = WIDTH / (2 * XMAX)
LAT_MIN = -58  # crop Antarctica and the far south
HEIGHT = round((YMAX - equal_earth(0, LAT_MIN)[1]) * SCALE + 1)


def to_svg(lon: float, lat: float) -> tuple[float, float]:
    x, y = equal_earth(lon, lat)
    return round((x + XMAX) * SCALE, 1), round((YMAX - y) * SCALE, 1)


def basemap(scale: str = "110m", digits: int | None = None) -> dict:
    """The world map: 110m for the world view; 50m (with digits=2) for the borders and coasts drawn
    when the map is zoomed to a chosen country (data/borders.json)."""
    with tarfile.open(fileobj=io.BytesIO(fetch(WORLD_ATLAS))) as t:
        topo = json.load(t.extractfile(f"package/countries-{scale}.json"))
    fmt = (lambda v: f"{v:g}") if digits is None else (lambda v: f"{round(v, digits):g}")
    sx, sy = topo["transform"]["scale"]
    tx, ty = topo["transform"]["translate"]
    arcs = []
    for arc in topo["arcs"]:
        x = y = 0
        pts = []
        for dx, dy in arc:
            x += dx
            y += dy
            pts.append((x * sx + tx, y * sy + ty))
        arcs.append(pts)

    def ring(idx: list[int]) -> list[tuple[float, float]]:
        out = []
        for i in idx:
            pts = arcs[i] if i >= 0 else arcs[~i][::-1]
            out.extend(pts if not out else pts[1:])
        return out

    parts = []
    by_country: dict[str, list[list[tuple[float, float]]]] = {}
    shapes: dict[str, list] = {}  # country -> polygons -> rings (shell first)
    for geom in topo["objects"]["countries"]["geometries"]:
        if geom.get("id") == "010" or geom.get("properties", {}).get("name") == "Antarctica":
            continue
        polys = geom["arcs"] if geom["type"] == "MultiPolygon" else [geom["arcs"]]
        a2 = _alpha2(geom.get("id"))
        for poly in polys:
            kept: list = []
            if a2:
                shapes.setdefault(a2, []).append(kept)
            for r in poly:
                lonlat = ring(r)
                lons = [lon for lon, _ in lonlat]
                if min(lat for _, lat in lonlat) < LAT_MIN:
                    continue  # rings reaching into the cropped far south
                if max(lons) - min(lons) > 270:  # wraps the date line (Russia's Chukotka, Fiji): unwrap past 180°
                    lonlat = [(lon + 360 if lon < 0 else lon, lat) for lon, lat in lonlat]
                pts = [to_svg(lon, lat) for lon, lat in lonlat] if digits is None else \
                      [((x + XMAX) * SCALE, (YMAX - y) * SCALE) for x, y in (equal_earth(lo, la) for lo, la in lonlat)]
                if digits is not None and len(pts) > 3:  # the detailed map: drop points closer than a 25th of a pixel to the line
                    from shapely.geometry import LineString
                    pts = list(LineString(pts).simplify(0.02).coords)
                if len(pts) > 2:
                    parts.append("M" + "L".join(f"{fmt(x)},{fmt(y)}" for x, y in pts) + "Z")
                    if a2:
                        by_country.setdefault(a2, []).append(pts)
                        kept.append(pts)
    global COUNTRY_SHAPES
    COUNTRY_SHAPES = shapes
    return {"width": WIDTH, "height": HEIGHT, "path": "".join(parts), "countries": _country_views(by_country)}


COUNTRY_SHAPES: dict | None = None


def write_borders() -> None:
    """data/borders.json: Natural Earth 50m country outlines, for the map zoomed to chosen countries
    (fetched by the page only then): {"countries": {code: SVG path}, "other": SVG path} (other: places
    with no ISO code, such as Kosovo and Somaliland)."""
    detail = basemap("50m", 2)
    mine = set().union(*(set(v["outline"].split("Z")) for v in detail["countries"].values()))
    other = "".join(r + "Z" for r in detail["path"].split("Z") if r and r not in mine)
    out = {"countries": {k: v["outline"] for k, v in detail["countries"].items()}, "other": other}
    (DATA / "borders.json").write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    basemap()  # back to the world map's shapes for anything that follows


def country_shapes() -> dict:
    """{country: shapely geometry in basemap pixels}, for the areas step's labels."""
    from shapely.geometry import MultiPolygon, Polygon
    if COUNTRY_SHAPES is None:
        basemap()
    out = {}
    for a2, polys in COUNTRY_SHAPES.items():
        ps = [Polygon(rings[0], rings[1:]).buffer(0) for rings in polys if rings]
        parts = [q for p in ps for q in getattr(p, "geoms", [p]) if q.geom_type == "Polygon"]
        if parts:
            out[a2] = MultiPolygon(parts).buffer(0)
    return out


def _alpha2(numeric: str | None) -> str | None:
    """ISO 3166 alpha-2 code (lower case, as LinguaMeta writes them) for world-atlas's numeric id."""
    import pycountry  # only this step needs it: pip install pycountry
    c = pycountry.countries.get(numeric=numeric) if numeric else None
    return c.alpha_2.lower() if c else None


def _country_views(by_country: dict[str, list[list[tuple[float, float]]]]) -> dict[str, dict]:
    """Country -> {"box": [x0, y0, x1, y1], "outline": SVG path}: the box frames its largest polygon
    (the mainland, so France isn't framed with French Guiana), the outline is all of it."""
    out = {}
    for a2, rings in by_country.items():
        def extent(r):
            xs, ys = [x for x, _ in r], [y for _, y in r]
            return min(xs), min(ys), max(xs), max(ys)
        main = max(rings, key=lambda r: (lambda e: (e[2] - e[0]) * (e[3] - e[1]))(extent(r)))
        out[a2] = {"box": [round(v, 1) for v in extent(main)],
                   "outline": "".join("M" + "L".join(f"{x:g},{y:g}" for x, y in r) + "Z" for r in rings)}
    return out


def linguameta_dir():
    repo = CACHE / "url-nlp"
    if not repo.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        subprocess.run(["git", "clone", "-q", "--depth", "1", "--filter=blob:none", "--sparse",
                        "https://github.com/google-research/url-nlp", str(repo)], check=True)
        subprocess.run(["git", "-C", str(repo), "sparse-checkout", "set", "linguameta/data"], check=True)
    return repo / "linguameta" / "data"


def point(d: dict, origin: str | None = None) -> tuple[float, float] | None:
    geo = [(l.get("locale", {}).get("iso_3166_code"), l["geolocation"], l.get("speaker_data", {}).get("number_of_speakers") or 0)
           for l in d.get("language_script_locale", []) if l.get("geolocation", {}).get("latitude") is not None]
    if not geo:
        return None
    if origin:
        for cc, g, _ in geo:
            if cc == origin:
                return g["latitude"], g["longitude"]
    cc, g, _ = max(geo, key=lambda x: x[2])
    return g["latitude"], g["longitude"]


def country_point(records: dict[str, dict], country: str) -> tuple[float, float] | None:
    best = None
    for d in records.values():
        for l in d.get("language_script_locale", []):
            g = l.get("geolocation", {})
            n = l.get("speaker_data", {}).get("number_of_speakers") or 0
            if l.get("locale", {}).get("iso_3166_code") == country and g.get("latitude") is not None \
                    and (best is None or n > best[0]):
                best = (n, (g["latitude"], g["longitude"]))
    return best[1] if best else None


# What the map shows when a region is chosen: lon/lat boxes framing each region group's land
REGION_VIEW = {
    "Africa": (-20, -36, 55, 38),
    "Europe": (-25, 34, 65, 72),          # to the Urals; the region's Siberian languages lie beyond
    "South Asia": (44, 5, 98, 40),        # with Iran and Afghanistan
    "Rest of Asia": (25, -11, 150, 56),   # Turkey to Japan and Indonesia
    "Oceania": (110, -48, 180, 2),
    "Americas": (-170, -56, -30, 72),
}


def region_views() -> dict[str, dict]:
    """Region group -> {"box": [x0, y0, x1, y1], "outline": SVG path}: its lon/lat frame on the basemap
    (curved, as Equal Earth bends meridians) and the box around it."""
    out = {}
    for name, (w, s, e, n) in REGION_VIEW.items():
        ring = [to_svg(lon, s) for lon in range(w, e + 1)] + [to_svg(e, lat) for lat in range(s, n + 1)] + \
               [to_svg(lon, n) for lon in range(e, w - 1, -1)] + [to_svg(w, lat) for lat in range(n, s - 1, -1)]
        xs, ys = [p[0] for p in ring], [p[1] for p in ring]
        out[name] = {"box": [min(xs), min(ys), max(xs), max(ys)],
                     "outline": "M" + "L".join(f"{x},{y}" for x, y in ring) + "Z"}
    return out


def main() -> None:
    with (CONFIG / "language_overrides.csv").open(encoding="utf-8") as f:
        slice_rows = {r["code"]: r for r in csv.DictReader(f)}
    data_dir = linguameta_dir()
    records = {}
    for path in sorted(data_dir.glob("*.json")):
        if path.name == "locales.json":
            continue
        d = json.loads(path.read_text(encoding="utf-8"))
        code = d.get("bcp_47_code") or path.stem
        records[code] = d

    out = []
    for code, d in records.items():
        scope = d.get("language_scope", {}).get("scope")
        if scope == "MACROLANGUAGE" and code not in slice_rows:
            continue
        origin = (slice_rows.get(code) or {}).get("origin") or None
        p = point(d, origin)
        if p is None:  # fall back to a member language's location (e.g. macrolanguages)
            for m in d.get("individual_language_bcp_47_codes", []):
                if m in records and (p := point(records[m])):
                    break
        if p is None and origin:  # no location at all: where the most-spoken language of the origin country sits
            p = country_point(records, origin)
        if p is None:
            continue
        name = next((n["name"] for n in d.get("name_data", []) if n.get("bcp_47_code") == "en" and n.get("is_canonical")),
                    next((n["name"] for n in d.get("name_data", []) if n.get("bcp_47_code") == "en"), code))
        x, y = to_svg(p[1], max(p[0], LAT_MIN))
        out.append([code, name, x, y, d.get("total_population") or 0])
    (DATA / "world_languages.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    write_borders()
    (DATA / "basemap.json").write_text(json.dumps(basemap() | {"regions": region_views()}), encoding="utf-8")
    missing = [c for c in slice_rows if c not in {r[0] for r in out}]
    print(f"{len(out)} language points; basemap written; scored languages without a point: {missing or 'none'}")


if __name__ == "__main__":
    main()
