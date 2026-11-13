"""Languages spoken in each country, from national censuses: immigrant and diaspora languages too.

LinguaMeta lists the languages traditionally spoken in each country, so a country's view misses the
languages of its immigrant communities (Chinese, Tagalog or Vietnamese in the United States, say).
Censuses that ask about language count them:

  UN Statistics Division   Demographic Statistics, "Population by language, sex and urban/rural
                           residence" (table 27): national census results from 1995 on, as each
                           country reported them; each country's latest census is used
  US Census Bureau         American Community Survey 2017-2021, detailed languages spoken at home
                           (over 500 languages and groups), people aged 5 and over; used for the US
                           in place of the UN table's 2000 census

Countries ask different questions (mother tongue, language spoken at home, main language; some
count everyone in each language they name), so the figures are each census's own, not comparable
across countries. The site uses them only for languages LinguaMeta doesn't list in a country, or
lists there without a count; LinguaMeta's figures and each language's world total stay as they are,
so scores don't change.

  python -m ltdi.collectors.census_languages --fetch   download into data/sources/ (GitHub Actions,
                                                        census-languages.yml: census sites aren't
                                                        reachable from every network)
  python -m ltdi.collectors.census_languages           data/sources/ -> data/census_languages.csv

Census names that don't match an Index language name go in config/census_names.csv: a code, several
codes for a name the Index splits (Chinese: Mandarin, Yue...), or "-" to leave a name out.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sys
import zipfile
from collections import defaultdict

from .. import CONFIG, DATA
from ..http import fetch

SOURCES = DATA / "sources"
OUT = DATA / "census_languages.csv"
NAMES = CONFIG / "census_names.csv"
UNDATA_URL = ("https://data.un.org/legacy/Handlers/DownloadHandler.ashx?DataFilter=tableCode:27"
              "&DataMartId=POP&Format=csv")  # UNdata moved under /legacy/ in 2026
UNDATA_PAGE = "https://data.un.org/legacy/Data.aspx?d=POP&f=tableCode:27"
UNDATA_OUT = SOURCES / "undata_population_by_language.csv"
UNDATA_NOTES = SOURCES / "undata_population_by_language_footnotes.csv"
ACS_URL = ("https://www2.census.gov/programs-surveys/demo/tables/language-use/2017/"
           "2017-2021-acs-lang-tables-nation.xlsx")
ACS_PAGE = "https://www.census.gov/data/tables/time-series/demo/language-use/2017-2021-lang-tables.html"
ACS_OUT = SOURCES / "acs_2017_2021_languages_us.csv"
MIN_SPEAKERS = 1000  # smaller counts are mostly sampling noise (and add little to a country's view)
# Tables that don't count speakers, left out
SKIP = {
    "Philippines": "counts households by the language spoken in them, not people",
    "Rwanda": "measures literacy in each language",
    "Sri Lanka": "measures ability to speak each language",
    "Russian Federation": "counts everyone able to speak each language (7.6 million for English)",
    "Ireland": "counts ability to speak Irish only",
    "Ghana": "lists ethnic groups",
    "United States of America": "the US Census Bureau's American Community Survey 2017-2021 is used instead",
}
COUNTRY = {  # UN names pycountry doesn't resolve
    "China, Hong Kong SAR": "hk", "China, Macao SAR": "mo", "Bolivia (Plurinational State of)": "bo",
    "Micronesia (Federated States of)": "fm", "Republic of Moldova": "md", "Russian Federation": "ru",
    "United Kingdom of Great Britain and Northern Ireland": "gb", "United States of America": "us",
    "Falkland Islands (Malvinas)": "fk", "Brunei Darussalam": "bn", "Åland Islands": "ax",
}
NOT_LANGUAGES = re.compile(r"^(total|others?\b.*|all other.*|not stated|unknown|none|no language|not reported|"
                           r"undeclared|non-indigenous|native|.* and .*|.*, .*|.*n\.e\.c\.?\*?)$", re.I)


# ------------------------------------------------------------------------------------------- fetch
def _unzip_csv(body: bytes) -> str:
    if body[:2] == b"PK":
        with zipfile.ZipFile(io.BytesIO(body)) as z:
            body = z.read(next(n for n in z.namelist() if n.lower().endswith(".csv")))
    return body.decode("utf-8-sig", errors="replace")


def fetch_undata():
    rows = list(csv.reader(io.StringIO(_unzip_csv(fetch(UNDATA_URL, cache=False)))))
    head = rows[0]
    col = {h.strip().lower(): i for i, h in enumerate(head)}
    keep = [r for r in rows[1:] if len(r) == len(head) and r[col["sex"]].lower().startswith("both")
            and r[col["area"]].lower() == "total"]
    # after the data the export lists its footnotes (what each census asked), as number and text
    notes = [r[:2] for r in rows[1:] if len(r) != len(head) and len(r) >= 2 and r[0].strip().isdigit()]
    SOURCES.mkdir(parents=True, exist_ok=True)
    with UNDATA_OUT.open("w", encoding="utf-8", newline="") as f:
        csv.writer(f).writerows([head, *keep])
    with UNDATA_NOTES.open("w", encoding="utf-8", newline="") as f:
        csv.writer(f).writerows([["footnote", "text"], *notes])
    print(f"UNdata: {len(rows) - 1} rows, kept {len(keep)} (both sexes, whole country), {len(notes)} footnotes")


def fetch_acs():
    from openpyxl import load_workbook
    wb = load_workbook(io.BytesIO(fetch(ACS_URL, cache=False)), read_only=True, data_only=True)
    rows = [[("" if v is None else str(v).strip()) for v in row] for row in wb.worksheets[0].iter_rows(values_only=True)]
    rows = [r for r in rows if any(r)]
    SOURCES.mkdir(parents=True, exist_ok=True)
    with ACS_OUT.open("w", encoding="utf-8", newline="") as f:
        csv.writer(f).writerows(rows)
    print(f"ACS: {len(rows)} rows")


# ------------------------------------------------------------------------------------------- read
def _num(v: str) -> float | None:
    try:
        return float(v.replace(",", ""))
    except ValueError:
        return None


def undata_tables() -> dict[str, tuple[str, list[tuple[str, float]]]]:
    """{UN country name: (census year, [(language name, people), ...])}, each country's latest census."""
    rows = list(csv.reader(UNDATA_OUT.open(encoding="utf-8")))
    col = {h.strip().lower(): i for i, h in enumerate(rows[0])}
    by = defaultdict(list)
    for r in rows[1:]:
        by[r[col["country or area"]]].append(r)
    out = {}
    for country, rs in by.items():
        year = max(r[col["year"]] for r in rs)
        out[country] = (year, [(r[col["language"]].strip(), _num(r[col["value"]]) or 0)
                               for r in rs if r[col["year"]] == year])
    return out


def acs_table() -> list[tuple[str, float]]:
    """The US table's languages, without its group rows. A group whose name is also a language's
    ("Chinese", then "Chinese" again for Chinese not further specified, Mandarin, Yue...) is listed
    first, so of a name given twice the first is the group; family headings ("Slavic languages") and
    "Other ..." rows don't name a language and are dropped as names later."""
    rows = list(csv.reader(ACS_OUT.open(encoding="utf-8")))
    start = next(i for i, r in enumerate(rows) if r and r[0].startswith("Speak a language other than English")) + 1
    end = next((i for i, r in enumerate(rows) if r and r[0].startswith("Notes")), len(rows))
    body = [(r[0].strip(), _num(r[1])) for r in rows[start:end] if r and _num(r[1]) is not None]
    out = []
    for i, (name, n) in enumerate(body):
        if any(name == m for m, _ in body[i + 1:i + 12]):
            continue  # a group: its own name follows among its members
        if name.isupper():
            continue  # family headings in capitals ("INDO-EUROPEAN LANGUAGES")
        out.append((name, n))
    return out


# ------------------------------------------------------------------------------------------- map
def _norm(s: str) -> str:
    return re.sub(r"[^a-z]", "", s.lower())


def language_index() -> tuple[dict[str, set[str]], dict[str, dict]]:
    """{normalised name: codes}: each language's own name, then its other names where no language
    is called that (so "Arabic" is Arabic, not every Arabic variety that also answers to it)."""
    scores = json.loads((DATA / "scores.json").read_text(encoding="utf-8"))
    langs = {l["code"]: l for l in scores["languages"] if not l.get("extinct")}
    idx, alt = defaultdict(set), defaultdict(set)
    for l in langs.values():
        idx[_norm(l["name"])].add(l["code"])
        for n in l.get("alt_names") or []:
            alt[_norm(n)].add(l["code"])
    for k, v in alt.items():
        idx.setdefault(k, v)
    return idx, langs


def manual_names() -> dict[str, list[str]]:
    if not NAMES.exists():
        return {}
    return {_norm(r["name"]): ([] if r["codes"].strip() == "-" else r["codes"].split())
            for r in csv.DictReader(NAMES.open(encoding="utf-8"))}


def country_code(name: str) -> str | None:
    if name in COUNTRY:
        return COUNTRY[name]
    import pycountry
    try:
        return pycountry.countries.lookup(name).alpha_2.lower()
    except LookupError:
        return None


def resolve(table: list[tuple[str, float]], idx, manual, langs, unmatched) -> dict[str, float]:
    """One census table -> {language code: people}. Names matching one Index language count for it;
    several rows for one language are added up (Tagalog and Filipino). A name the Index splits
    (Chinese) is shared among its languages in proportion to those the table names itself (Mandarin,
    Yue), after taking them out where it's their total; where the table names none of them, it counts
    for the first listed (Chinese for Mandarin, though in some countries many are Cantonese speakers)."""
    out: dict[str, float] = defaultdict(float)
    umbrellas = []
    for name, n in table:
        if not n or NOT_LANGUAGES.match(name):
            continue
        key = _norm(name)
        codes = manual.get(key)
        if codes is None:
            found = idx.get(key, set())
            if len(found) != 1:
                unmatched[name] += n
                continue
            codes = list(found)
        codes = [c for c in codes if c in langs]
        if len(codes) == 1:
            out[codes[0]] += n
        elif codes:
            umbrellas.append((codes, n))
    for codes, n in umbrellas:
        named = {c: out[c] for c in codes if out.get(c)}
        if not named:  # the census names none of them: all to the first (Chinese: Mandarin)
            out[codes[0]] += n
            continue
        rest = n - sum(named.values()) if n >= sum(named.values()) else n
        total = sum(named.values())
        for c, w in named.items():
            out[c] += rest * w / total
    return out


def build() -> list[dict]:
    idx, langs = language_index()
    manual = manual_names()
    notes = dict(list(csv.reader(UNDATA_NOTES.open(encoding="utf-8")))[1:]) if UNDATA_NOTES.exists() else {}
    unmatched: dict[str, float] = defaultdict(float)
    rows = []
    for country, (year, table) in sorted(undata_tables().items()):
        cc = country_code(country)
        if country in SKIP or not cc:
            print(f"  skipped {country} {year}: {SKIP.get(country, 'no country code')}")
            continue
        for code, n in resolve(table, idx, manual, langs, unmatched).items():
            if n >= MIN_SPEAKERS:
                rows.append({"country": cc, "language": code, "speakers": round(n), "year": year,
                             "source": f"UN Statistics Division, {country} census {year}", "url": UNDATA_PAGE})
    for code, n in resolve(acs_table(), idx, manual, langs, unmatched).items():
        if n >= MIN_SPEAKERS:
            rows.append({"country": "us", "language": code, "speakers": round(n), "year": "2017-2021",
                         "source": "US Census Bureau, American Community Survey 2017-2021", "url": ACS_PAGE})
    top = sorted(unmatched.items(), key=lambda kv: -kv[1])[:40]
    print("largest unmatched names:", ", ".join(f"{k} ({v:,.0f})" for k, v in top))
    return rows


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--fetch", action="store_true", help="download the census sources into data/sources/")
    args = ap.parse_args(argv)
    if args.fetch:
        for f in (fetch_undata, fetch_acs):
            try:
                f()
            except Exception as e:  # one source down shouldn't lose the other
                print(f"{f.__name__} failed: {e}", file=sys.stderr)
        return
    rows = build()
    rows.sort(key=lambda r: (r["country"], -r["speakers"]))
    with OUT.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, ["country", "language", "speakers", "year", "source", "url"])
        w.writeheader()
        w.writerows(rows)
    print(f"wrote {OUT}: {len(rows)} language-country counts in {len({r['country'] for r in rows})} countries")


if __name__ == "__main__":
    sys.exit(main())
