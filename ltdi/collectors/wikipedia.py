"""Wikipedia: number of articles in each language edition (Wikimedia API).

Needs open network access to *.wikipedia.org, so run it locally:
    python -m ltdi.collectors wikipedia
"""

from __future__ import annotations

from ..http import fetch_json
from ..records import Record
from ._common import ltdi_codes

# LTDI code -> Wikipedia edition codes credited to it
EDITIONS = {
    "cmn": ["zh"],
    "pa": ["pa", "pnb"],  # Gurmukhi and Shahmukhi editions
    "ar": ["ar"],         # Egyptian (arz) and Moroccan (ary) editions excluded, as dialects
}

API = "https://{wiki}.wikipedia.org/w/api.php?action=query&meta=siteinfo&siprop=statistics&format=json"


def collect() -> list[Record]:
    out = []
    for code in ltdi_codes():
        total, urls = 0, []
        for wiki in EDITIONS.get(code, [code]):
            url = API.format(wiki=wiki)
            try:
                total += fetch_json(url, cache=False)["query"]["statistics"]["articles"]
                urls.append(url)
            except Exception as e:  # edition doesn't exist, or network failure
                print(f"  {wiki}: {e}")
        out.append(Record(code, "wikipedia_articles", total, "articles", "Wikipedia",
                          " ".join(urls) or API.format(wiki=code), method="api"))
    return out
