"""Official status and literacy by country, from Unicode CLDR's territory data (the pinned release).

Official languages carry public-sector demand: government services, courts and schools need them.
CLDR records, for each country, the languages spoken there with their share of the population, and
marks those with official status:

  official             official throughout the country
  de_facto_official    used as official without a legal declaration
  official_regional    official in a region of the country

It also gives each country's adult literacy rate, and for some languages their literacy rate there.
CLDR's codes (yo, pa_Arab, zh_Hant) are resolved to LTDI languages through the crosswalk."""

from __future__ import annotations

from functools import lru_cache

from .crosswalk import to_ltdi
from .http import fetch_json

TERRITORY_INFO = ("https://raw.githubusercontent.com/unicode-org/cldr-json/7d2b9cb11cec08f4d333ad73209deb3df0711c3b/"
                  "cldr-json/cldr-core/supplemental/territoryInfo.json")
STATUS = {"official": "o", "de_facto_official": "d", "official_regional": "r"}
STATUS_LABEL = {"o": "official", "d": "official in practice", "r": "official in a region"}


@lru_cache(maxsize=1)
def _territories() -> dict:
    return fetch_json(TERRITORY_INFO)["supplemental"]["territoryInfo"]


def country_literacy() -> dict[str, float]:
    """{country (lower case): adult literacy, %}"""
    return {cc.lower(): float(t["_literacyPercent"]) for cc, t in _territories().items()
            if len(cc) == 2 and "_literacyPercent" in t}


def official() -> dict[str, dict[str, str]]:
    """{language: {country: o, d or r}}, the strongest status where CLDR lists several forms (yo, yo_Arab)."""
    out: dict[str, dict[str, str]] = {}
    rank = {"o": 3, "d": 2, "r": 1}
    for cc, t in _territories().items():
        if len(cc) != 2:
            continue
        for lang, v in (t.get("languagePopulation") or {}).items():
            s = STATUS.get(v.get("_officialStatus"))
            code = to_ltdi(lang.replace("_", "-"))
            if s and code:
                cur = out.setdefault(code, {}).get(cc.lower())
                if not cur or rank[s] > rank[cur]:
                    out[code][cc.lower()] = s
    return out


def language_literacy() -> dict[str, dict[str, float]]:
    """{language: {country: literacy in that language, %}} where CLDR gives one."""
    out: dict[str, dict[str, float]] = {}
    for cc, t in _territories().items():
        for lang, v in (t.get("languagePopulation") or {}).items():
            code = to_ltdi(lang.replace("_", "-"))
            if code and "_literacyPercent" in v and len(cc) == 2:
                out.setdefault(code, {})[cc.lower()] = float(v["_literacyPercent"])
    return out
