"""Language backbone: core metadata for each language, from LinguaMeta.

Run:  python -m ltdi.backbone
Writes data/languages.json for the languages listed in config/slice_languages.csv.
"""

from __future__ import annotations

import csv
import json

from . import CONFIG, DATA
from .http import fetch_json

LINGUAMETA = "https://raw.githubusercontent.com/google-research/url-nlp/main/linguameta/data"

# UN M49 region codes used in LinguaMeta's locales.json
REGIONS = {"002": "Africa", "019": "Americas", "142": "Asia", "150": "Europe", "009": "Oceania"}
SOUTH_ASIA = "034"  # M49 Southern Asia


def region_group(region: str | None, subregion: str | None) -> str | None:
    """Regions for filtering, with South Asia split out from the rest of Asia."""
    if region == "Asia":
        return "South Asia" if subregion == SOUTH_ASIA else "Rest of Asia"
    return region


def slice_languages() -> list[dict]:
    with (CONFIG / "slice_languages.csv").open(encoding="utf-8") as f:
        return list(csv.DictReader(f))


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


def load_language(code: str, locales: dict[str, dict]) -> dict:
    d = fetch_json(f"{LINGUAMETA}/{code}.json")

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
        "countries": [
            {"code": c, "name": locales.get(c, {}).get("name", c), "speakers": n}
            for c, n in top
        ],
        "region": next(
            (region_group(locales[c]["region"], locales[c]["subregion"])
             for c, _ in top if locales.get(c, {}).get("region")),
            None,
        ),
        "source": f"{LINGUAMETA}/{code}.json",
    }


def main() -> None:
    locales = _locales()
    langs = []
    for row in slice_languages():
        lang = load_language(row["code"], locales)
        lang["name"] = row["name"] or lang["name"]
        lang["note"] = row["note"]
        if row.get("region"):  # origin region group, where the largest-country rule misleads
            lang["region"] = row["region"]
        langs.append(lang)
    DATA.mkdir(exist_ok=True)
    (DATA / "languages.json").write_text(json.dumps(langs, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"wrote {len(langs)} languages to data/languages.json")


if __name__ == "__main__":
    main()
