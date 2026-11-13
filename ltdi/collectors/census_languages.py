"""Languages spoken in each country, from national censuses: immigrant and diaspora languages too.

LinguaMeta lists the languages traditionally spoken in each country, so a country's view misses the
languages of its immigrant communities (Chinese, Tagalog or Vietnamese in the United States, say).
Censuses that ask about language count them:

  UN Statistics Division   Demographic Statistics, "Population by language, sex and urban/rural
                           residence" (table 27): national census results from 1995 on, as each
                           country reported them (mother tongue, usual language or ability to speak)
  US Census Bureau         American Community Survey 2017-2021, detailed languages spoken at home
                           (over 500 languages and groups), people aged 5 and over

Step 1 (this file, --fetch): download the sources and keep the rows that matter (both sexes, whole
country) in data/sources/. Census sites aren't reachable from every network, so it runs on GitHub
Actions (census-languages.yml).
"""

from __future__ import annotations

import argparse
import csv
import io
import sys
import zipfile
from collections import Counter, defaultdict

from .. import DATA
from ..http import fetch

SOURCES = DATA / "sources"
# UNdata's download link, with and without its column and sort options (tried in turn)
UNDATA_URLS = [
    "https://data.un.org/Handlers/DownloadHandler.ashx?DataFilter=tableCode:27&DataMartId=POP&Format=csv"
    "&c=2,3,6,8,10,12,13,14,15,16,17,18&s=_countryEnglishNameOrderBy:asc,refYear:desc,areaCode:asc",
    "http://data.un.org/Handlers/DownloadHandler.ashx?DataFilter=tableCode:27&DataMartId=POP&Format=csv"
    "&c=2,3,6,8,10,12,13,14,15,16,17,18&s=_countryEnglishNameOrderBy:asc,refYear:desc,areaCode:asc",
    "https://data.un.org/Handlers/DownloadHandler.ashx?DataFilter=tableCode%3a27&DataMartId=POP&Format=csv",
    "https://data.un.org/_Docs/SYB/CSV/",  # not this table; only to see what the server answers
]
UNDATA_OUT = SOURCES / "undata_population_by_language.csv"
ACS_URL = ("https://www2.census.gov/programs-surveys/demo/tables/language-use/2017/"
           "2017-2021-acs-lang-tables-nation.xlsx")
ACS_OUT = SOURCES / "acs_2017_2021_languages_us.csv"


def _unzip_csv(body: bytes) -> str:
    if body[:2] == b"PK":
        with zipfile.ZipFile(io.BytesIO(body)) as z:
            name = next(n for n in z.namelist() if n.lower().endswith(".csv"))
            body = z.read(name)
    return body.decode("utf-8-sig", errors="replace")


def fetch_undata():
    body = None
    for url in UNDATA_URLS:
        try:
            body = fetch(url, cache=False)
            print(f"UNdata: {url} -> {len(body)} bytes, starts {body[:60]!r}")
            if body[:2] == b"PK" or b"Country" in body[:200]:
                break
        except Exception as e:
            print(f"UNdata: {url} -> {e}")
    text = _unzip_csv(body)
    rows = list(csv.reader(io.StringIO(text)))
    head = rows[0]
    print("UNdata columns:", head)
    for r in rows[1:4]:
        print("  ", r)
    col = {h.strip().lower(): i for i, h in enumerate(head)}
    sex, area = col.get("sex"), col.get("area")
    keep = [r for r in rows[1:] if len(r) == len(head)
            and (sex is None or r[sex].strip().lower().startswith("both"))
            and (area is None or r[area].strip().lower() == "total")]
    SOURCES.mkdir(parents=True, exist_ok=True)
    with UNDATA_OUT.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(head)
        w.writerows(keep)
    # what it covers: countries, their latest census year, languages listed
    c, y = col.get("country or area"), col.get("year")
    latest, langs = {}, defaultdict(set)
    for r in keep:
        latest[r[c]] = max(latest.get(r[c], ""), r[y])
    lc = col.get("language")
    for r in keep:
        if r[y] == latest[r[c]]:
            langs[r[c]].add(r[lc])
    print(f"UNdata: {len(rows) - 1} rows, kept {len(keep)} (both sexes, whole country); {len(latest)} countries")
    by_decade = Counter(v[:3] + "0s" for v in latest.values())
    print("  latest census by decade:", dict(sorted(by_decade.items())))
    for k in sorted(latest):
        print(f"  {k}: {latest[k]}, {len(langs[k])} languages")


def fetch_acs():
    from openpyxl import load_workbook
    wb = load_workbook(io.BytesIO(fetch(ACS_URL, cache=False)), read_only=True, data_only=True)
    ws = wb.worksheets[0]
    rows = [[("" if v is None else str(v).strip()) for v in row] for row in ws.iter_rows(values_only=True)]
    rows = [r for r in rows if any(r)]
    for r in rows[:12]:
        print("  ", r[:6])
    SOURCES.mkdir(parents=True, exist_ok=True)
    with ACS_OUT.open("w", encoding="utf-8", newline="") as f:
        csv.writer(f).writerows(rows)
    print(f"ACS: {len(rows)} rows from sheet {ws.title!r} ({len(wb.worksheets)} sheets)")


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


if __name__ == "__main__":
    sys.exit(main())
