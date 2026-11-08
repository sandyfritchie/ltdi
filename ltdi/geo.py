"""Map data: a point for every LinguaMeta language, and a world basemap.

Run:  python -m ltdi.geo
Writes:
  data/world_languages.json  [code, name, x, y, speakers] for every individual language with a location
  data/basemap.json          {"width", "height", "path"}: Natural Earth countries (110m, via world-atlas),
                             projected to Equal Earth as one SVG path

A language's point is LinguaMeta's geolocation for its origin country where
config/slice_languages.csv gives one, otherwise for the country with the most
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


def basemap() -> dict:
    with tarfile.open(fileobj=io.BytesIO(fetch(WORLD_ATLAS))) as t:
        topo = json.load(t.extractfile("package/countries-110m.json"))
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
    for geom in topo["objects"]["countries"]["geometries"]:
        if geom.get("id") == "010" or geom.get("properties", {}).get("name") == "Antarctica":
            continue
        polys = geom["arcs"] if geom["type"] == "MultiPolygon" else [geom["arcs"]]
        for poly in polys:
            for r in poly:
                lonlat = ring(r)
                lons = [lon for lon, _ in lonlat]
                if min(lat for _, lat in lonlat) < LAT_MIN:
                    continue  # rings reaching into the cropped far south
                if max(lons) - min(lons) > 270:  # wraps the date line (Russia's Chukotka, Fiji): unwrap past 180°
                    lonlat = [(lon + 360 if lon < 0 else lon, lat) for lon, lat in lonlat]
                pts = [to_svg(lon, lat) for lon, lat in lonlat]
                if len(pts) > 2:
                    parts.append("M" + "L".join(f"{x:g},{y:g}" for x, y in pts) + "Z")
    return {"width": WIDTH, "height": HEIGHT, "path": "".join(parts)}


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


def main() -> None:
    with (CONFIG / "slice_languages.csv").open(encoding="utf-8") as f:
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
        if p is None:
            continue
        name = next((n["name"] for n in d.get("name_data", []) if n.get("bcp_47_code") == "en" and n.get("is_canonical")),
                    next((n["name"] for n in d.get("name_data", []) if n.get("bcp_47_code") == "en"), code))
        x, y = to_svg(p[1], max(p[0], LAT_MIN))
        out.append([code, name, x, y, d.get("total_population") or 0])
    (DATA / "world_languages.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (DATA / "basemap.json").write_text(json.dumps(basemap()), encoding="utf-8")
    missing = [c for c in slice_rows if c not in {r[0] for r in out}]
    print(f"{len(out)} language points; basemap written; scored languages without a point: {missing or 'none'}")


if __name__ == "__main__":
    main()
