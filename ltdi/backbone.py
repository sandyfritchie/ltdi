"""Language backbone: core metadata for every language in LinguaMeta.

Run:  python -m ltdi.backbone
Writes data/languages.json: every individual language in LinguaMeta, plus the
macrolanguages config/macrolanguages.csv scores as one unit (minus the members
they absorb), with names, regions and notes from config/language_overrides.csv.
Reads LinguaMeta from a sparse git clone in .cache (see geo.linguameta_dir).
"""

from __future__ import annotations

import csv
import json

from . import CONFIG, DATA
from .http import fetch_json

LINGUAMETA = "https://raw.githubusercontent.com/google-research/url-nlp/main/linguameta/data"
CLDR_TERRITORIES = ("https://raw.githubusercontent.com/unicode-org/cldr-json/main/cldr-json/"
                    "cldr-localenames-full/main/en/territories.json")
# Short country names for display: CLDR's English names, with these overrides
SHORT_NAMES = {"HK": "Hong Kong", "MO": "Macao", "MM": "Myanmar", "PS": "Palestine",
               "CD": "DR Congo", "CG": "Republic of the Congo"}

# UN M49 region codes used in LinguaMeta's locales.json
REGIONS = {"002": "Africa", "019": "Americas", "142": "Asia", "150": "Europe", "009": "Oceania"}
SOUTH_ASIA = "034"  # M49 Southern Asia


def region_group(region: str | None, subregion: str | None) -> str | None:
    """Regions for filtering, with South Asia split out from the rest of Asia."""
    if region == "Asia":
        return "South Asia" if subregion == SOUTH_ASIA else "Rest of Asia"
    return region


def overrides() -> dict[str, dict]:
    with (CONFIG / "language_overrides.csv").open(encoding="utf-8") as f:
        return {r["code"]: r for r in csv.DictReader(f)}


def macrolanguages() -> dict[str, dict]:
    with (CONFIG / "macrolanguages.csv").open(encoding="utf-8") as f:
        return {r["macro"]: r for r in csv.DictReader(f)}


def absorbed_by() -> dict[str, str]:
    """Member -> the language it is scored under: macrolanguage members (config/macrolanguages.csv)
    and other merges (the absorbs column of config/language_overrides.csv)."""
    out = {}
    for rows in (macrolanguages(), overrides()):
        for unit, r in rows.items():
            for member in (r.get("absorbs") or "").split():
                out[member] = unit
    return out


def scope(records: dict[str, dict]) -> list[str]:
    """Which LinguaMeta entries are scored: individual languages, except members absorbed by a
    macrolanguage scored as a unit or merged into another language; plus those macrolanguages.
    A macrolanguage with an ISO 639-1 code is a unit unless config says "members"; other
    macrolanguages are represented by members."""
    macros = macrolanguages()
    units, absorbed = set(), set(absorbed_by()) - set(macros)
    for code, d in records.items():
        if d.get("language_scope", {}).get("scope") != "MACROLANGUAGE":
            continue
        unit = macros.get(code, {}).get("unit") or ("macro" if len(code) == 2 else "members")
        if unit == "macro":
            units.add(code)
            absorbed |= set((macros.get(code, {}).get("absorbs") or "").split())
    return sorted(c for c, d in records.items()
                  if (d.get("language_scope", {}).get("scope") == "LANGUAGE" and c not in absorbed) or c in units)


def _locales() -> dict[str, dict]:
    data = fetch_json(f"{LINGUAMETA}/locales.json")
    out = {}
    for entry in data.get("locale_map", []):
        loc = entry.get("locale", {})
        out[loc.get("locale_code")] = {
            "name": loc.get("locale_name"),
            "region": REGIONS.get(entry.get("region"), entry.get("region")),
            "subregion": entry.get("subregion"),
        }
    return out


COUNTRY: dict[str, str] = {}
SCRIPT: dict[str, str] = {}


def country_names() -> dict[str, str]:
    """ISO 3166 code (lower case) -> short English name: CLDR's, with SHORT_NAMES overrides."""
    t = fetch_json(CLDR_TERRITORIES)["main"]["en"]["localeDisplayNames"]["territories"]
    return {k.lower(): SHORT_NAMES.get(k, v) for k, v in t.items() if len(k) == 2 and "-alt-" not in k}


def script_names() -> dict[str, str]:
    """ISO 15924 code -> full name from LinguaMeta, e.g. latn -> Latin, hans -> Han (Simplified)."""
    data = fetch_json(f"{LINGUAMETA}/scripts.json")["script_map"]
    return {e["script"]["name"]: e["script"]["full_name"].replace(" variant)", ")") for e in data}


def load_language(code: str, locales: dict[str, dict], d: dict) -> dict:

    def name_in(lang: str) -> str | None:
        for n in d.get("name_data", []):
            if n.get("bcp_47_code") == lang and n.get("is_canonical"):
                return n["name"]
        for n in d.get("name_data", []):
            if n.get("bcp_47_code") == lang:
                return n["name"]
        return None

    scripts: dict[str, bool] = {}
    countries: dict[str, int | None] = {}
    for lsl in d.get("language_script_locale", []):
        s = lsl.get("script", {})
        sc = s.get("iso_15924_code")
        if sc and sc != "xxxx" and (s.get("is_canonical") or s.get("is_in_widespread_use")):
            scripts[sc] = scripts.get(sc, False) or bool(s.get("is_canonical"))
        loc = lsl.get("locale", {}).get("iso_3166_code")
        if loc and loc != "xxxx" and len(loc) == 2:
            n = lsl.get("speaker_data", {}).get("number_of_speakers")
            countries[loc] = max(countries.get(loc) or 0, n or 0) or None

    top = sorted(countries.items(), key=lambda kv: -(kv[1] or 0))
    return {
        "code": code,
        "name": name_in("en"),
        "autonym": name_in(code),
        "iso_639_3": d.get("iso_639_3_code"),
        "glottocode": d.get("glottocode"),
        "scope": d.get("language_scope", {}).get("scope"),
        "speakers": d.get("total_population"),
        "members": d.get("individual_language_bcp_47_codes", []),
        "scripts": sorted(scripts, key=lambda s: (not scripts[s], s)),
        "script_names": [SCRIPT.get(sc, sc.title()) for sc in sorted(scripts, key=lambda s: (not scripts[s], s))],
        "countries": [
            {"code": c, "name": COUNTRY.get(c) or locales.get(c, {}).get("name", c), "speakers": n}
            for c, n in top
        ],
        "region": next(
            (region_group(locales[c]["region"], locales[c]["subregion"])
             for c, _ in top if locales.get(c, {}).get("region")),
            None,
        ),
        "source": f"{LINGUAMETA}/{code}.json",
    }


def apply_overrides(lang: dict, row: dict, locales: dict[str, dict]) -> None:
    """Corrections from config/language_overrides.csv, where LinguaMeta's data misleads:
      speakers   a total, or "-" for no count (also clears the per-country counts)
      countries  space-separated, each "cc" or "cc:speakers"; replaces the country list, and the
                 total too when speakers is empty
      scripts    space-separated ISO 15924 codes, main script first
      region     the region group, where the largest-country rule misleads"""
    if row.get("countries"):
        lang["countries"] = []
        for item in row["countries"].split():
            cc, _, n = item.partition(":")
            lang["countries"].append({"code": cc, "name": COUNTRY.get(cc) or locales.get(cc, {}).get("name", cc),
                                      "speakers": int(n) if n else None})
        if not row.get("speakers"):
            lang["speakers"] = sum(c["speakers"] or 0 for c in lang["countries"]) or None
        lang["region"] = next((region_group(locales[c["code"]]["region"], locales[c["code"]]["subregion"])
                               for c in lang["countries"] if locales.get(c["code"], {}).get("region")), lang["region"])
    if row.get("speakers") == "-":
        lang["speakers"] = None
        for c in lang["countries"]:
            c["speakers"] = None
    elif row.get("speakers"):
        lang["speakers"] = int(row["speakers"])
    if row.get("scripts"):
        lang["scripts"] = row["scripts"].split()
        lang["script_names"] = [SCRIPT.get(sc, sc.title()) for sc in lang["scripts"]]
    if row.get("region"):
        lang["region"] = row["region"]


def records() -> dict[str, dict]:
    from .geo import linguameta_dir
    out = {}
    for path in sorted(linguameta_dir().glob("*.json")):
        if path.name in ("locales.json", "scripts.json"):
            continue
        d = json.loads(path.read_text(encoding="utf-8"))
        out[d.get("bcp_47_code") or path.stem] = d
    return out


def main() -> None:
    locales = _locales()
    COUNTRY.update(country_names())
    SCRIPT.update(script_names())
    recs, over, macros = records(), overrides(), macrolanguages()
    langs = []
    for code in scope(recs):
        lang = load_language(code, locales, recs[code])
        row = over.get(code, {})
        lang["name"] = row.get("name") or lang["name"] or code
        lang["note"] = row.get("note") or macros.get(code, {}).get("note") or ""
        apply_overrides(lang, row, locales)
        langs.append(lang)
    DATA.mkdir(exist_ok=True)
    (DATA / "languages.json").write_text(json.dumps(langs, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"wrote {len(langs)} languages to data/languages.json")


if __name__ == "__main__":
    main()
