"""Country connectivity from the World Bank API, for estimating who a technology can reach now
and in five years.

Indicators:
  IT.NET.USER.ZS  Individuals using the Internet, % of population (WDI, from ITU); full series since 2015
  con1            Own a mobile phone, % age 15+ (Global Findex)
  con16           Can send a text message on a mobile phone, % age 15+ (Global Findex)
  SE.ADT.LITR.ZS  Adult literacy rate, % age 15+ (WDI)
  SP.POP.GROW     Population growth, annual % (WDI)

Writes data/countries.csv (one row per country and indicator), then per-language
records to data/records/connectivity.csv:

  reach_voice_share     share of speakers who use the internet
  reach_text_share      ... and can read and write text on a phone
  reach_voice_share_5y  internet use projected five years past the latest data
  reach_text_share_5y   ... times the same text ability
  speaker_growth_5y     population growth factor over five years

Text ability for a country is con16 / con1 (of phone owners, the share who can
text), falling back to the literacy rate, then to 1.0 where neither is
published (mostly high-income countries). It is held constant in projections.

Internet use is projected from the trend of the last six years (least-squares
slope, never downward), capped at 4 points a year and scaled by sqrt(1 - current
share) so growth slows as use saturates, with a ceiling of 98%. All shares are weighted by LinguaMeta's
per-country speaker counts, over the countries that have both a count and data.
"""

from __future__ import annotations

import csv
import json
from collections import defaultdict

from .. import DATA
from ..http import fetch_json
from ..records import Record

API = "https://api.worldbank.org/v2/country/{countries}/indicator/{ind}?format=json&per_page=5000&source={src}&{when}"
LATEST = "mrnev=1"
SERIES = "date=2015:2026"
INDICATORS = {
    "internet": ("IT.NET.USER.ZS", 2, SERIES, "Individuals using the Internet (% of population)"),
    "phone": ("con1", 28, LATEST, "Own a mobile phone (% age 15+)"),
    "can_text": ("con16", 28, LATEST, "Can send a text message on a mobile phone (% age 15+)"),
    "literacy": ("SE.ADT.LITR.ZS", 2, LATEST, "Literacy rate, adult total (% age 15+)"),
    "pop_growth": ("SP.POP.GROW", 2, LATEST, "Population growth (annual %)"),
    "population": ("SP.POP.TOTL", 2, LATEST, "Population, total"),
}
COUNTRIES = "https://api.worldbank.org/v2/country?format=json&per_page=400"
HORIZON = 5
CAP = 98.0
MAX_GAIN = 4.0  # percentage points a year


def fetch_countries(codes: list[str]) -> dict[str, dict[str, list[tuple[int, float]]]]:
    """country (lowercase ISO2) -> {key: [(year, value), ...] oldest first}"""
    out: dict[str, dict] = defaultdict(lambda: defaultdict(list))

    def get(batch: list[str], key: str) -> None:
        ind, src, when, _ = INDICATORS[key]
        url = API.format(countries=";".join(c.upper() for c in batch), ind=ind, src=src, when=when)
        try:
            body = fetch_json(url)
            ok = isinstance(body, list) and len(body) > 1
        except Exception as e:
            body, ok = str(e), False
        if not ok:  # the API reports a bad country code for the whole batch: split and retry
            if len(batch) > 1:
                mid = len(batch) // 2
                get(batch[:mid], key)
                get(batch[mid:], key)
            return
        for row in body[1] or []:
            if row.get("value") is not None:
                out[row["country"]["id"].lower()][key].append((int(row["date"]), float(row["value"])))

    for key in INDICATORS:
        for i in range(0, len(codes), 40):
            get(codes[i:i + 40], key)
    for c in out.values():
        for series in c.values():
            series.sort()
    return out


def latest(c: dict, key: str) -> float | None:
    return c[key][-1][1] if c.get(key) else None


def project(series: list[tuple[int, float]], years: int = HORIZON) -> float:
    """Trend of the last six points, never downward, damped near saturation, capped."""
    pts = series[-6:]
    last_year, last = pts[-1]
    if len(pts) < 2:
        return last
    n = len(pts)
    mx = sum(y for y, _ in pts) / n
    my = sum(v for _, v in pts) / n
    var = sum((y - mx) ** 2 for y, _ in pts)
    slope = sum((y - mx) * (v - my) for y, v in pts) / var if var else 0.0
    # Growth slows as use saturates: at most MAX_GAIN points a year, scaled by sqrt(1 - share)
    gain = min(max(0.0, slope), MAX_GAIN) * years * (1 - last / 100) ** 0.5
    return min(CAP, last + gain)


def rates(c: dict) -> dict | None:
    online = latest(c, "internet")
    if online is None:
        return None
    phone, can_text, lit = latest(c, "phone"), latest(c, "can_text"), latest(c, "literacy")
    if can_text is not None and phone:
        text_ability = min(1.0, can_text / phone)
    elif lit is not None:
        text_ability = lit / 100
    else:
        text_ability = 1.0
    online_5y = project(c["internet"]) / 100
    growth = (1 + (latest(c, "pop_growth") or 0) / 100) ** HORIZON
    return {"voice": online / 100, "text": online / 100 * text_ability,
            "voice_5y": online_5y, "text_5y": online_5y * text_ability, "growth": growth}


def collect() -> list[Record]:
    langs = json.loads((DATA / "languages.json").read_text(encoding="utf-8"))
    known = {c["iso2Code"].lower() for c in fetch_json(COUNTRIES)[1] if c["region"]["value"] != "Aggregates"}
    codes = sorted({c["code"] for l in langs for c in l["countries"]} & known)
    data = fetch_countries(codes)

    with (DATA / "countries.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["country", "indicator", "value", "year", "label"])
        for cc in sorted(data):
            for key in INDICATORS:
                if data[cc].get(key):
                    year, v = data[cc][key][-1]
                    w.writerow([cc, key, round(v, 2), year, INDICATORS[key][3]])
            r = rates(data[cc])
            if r:
                w.writerow([cc, "internet_5y", round(r["voice_5y"] * 100, 2), data[cc]["internet"][-1][0] + HORIZON,
                            "Individuals using the Internet, projected (% of population)"])

    src = "https://data.worldbank.org/indicator/IT.NET.USER.ZS"
    out = []
    for l in langs:
        tot = 0.0
        acc = defaultdict(float)
        used = []
        # Weight countries by their speakers; where a language has a speaker total but no count for any
        # country, by each listed country's population instead
        by_pop = l.get("speakers") and not any(c.get("speakers") for c in l["countries"])
        for c in l["countries"]:
            r = rates(data.get(c["code"], {}))
            pop = (data.get(c["code"], {}).get("population") or [(0, 0)])[-1][1]
            w = pop if by_pop else c.get("speakers")
            if not w or r is None:
                continue
            tot += w
            for k, v in r.items():
                acc[k] += w * v
            used.append(c["code"].upper())
        if not tot:
            continue
        where = (f"Weighted by {'population' if by_pop else 'speakers'} in {len(used)} "
                 f"{'country' if len(used) == 1 else 'countries'}: {', '.join(used[:8])}{'…' if len(used) > 8 else ''}")
        rec = lambda ind, k, unit, note: Record(l["code"], ind, round(acc[k] / tot, 4), unit, "World Bank", src,
                                                method="api", note=f"{note} {where}")
        out += [
            rec("reach_voice_share", "voice", "share", "Speakers who use the internet."),
            rec("reach_text_share", "text", "share",
                "Speakers who use the internet and can read and write text on a phone."),
            rec("reach_voice_share_5y", "voice_5y", "share",
                f"Internet use projected {HORIZON} years ahead on its recent trend."),
            rec("reach_text_share_5y", "text_5y", "share",
                f"Projected internet use, {HORIZON} years ahead, times today's ability to text."),
            rec("speaker_growth_5y", "growth", "factor", f"Population growth over {HORIZON} years."),
        ]
    return out
