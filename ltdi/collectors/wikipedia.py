"""Wikipedia: articles and active editors in each language edition (Wikimedia API).

Article counts measure volume but include bot-generated stubs; active editors
(registered users who edited in the last 30 days) measure the living community.

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
        articles, editors, urls = 0, 0, []
        for wiki in EDITIONS.get(code, [code]):
            url = API.format(wiki=wiki)
            try:
                stats = fetch_json(url, cache=False)["query"]["statistics"]
                articles += stats["articles"]
                editors += stats["activeusers"]
                urls.append(url)
            except Exception as e:  # edition doesn't exist, or network failure
                print(f"  {wiki}: {e}")
        src = " ".join(urls) or API.format(wiki=code)
        out.append(Record(code, "wikipedia_articles", articles, "articles", "Wikipedia", src, method="api"))
        out.append(Record(code, "wikipedia_active_editors", editors, "editors", "Wikipedia", src, method="api",
                          note="Registered users with an edit in the last 30 days"))
    return out
