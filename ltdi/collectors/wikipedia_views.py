"""Wikipedia page views: how much people read each language's Wikipedia, a measure of reading demand
beside the editor count (wikipedia.py).

  wikipedia_pageviews   page views by people (not bots or crawlers) over the last 12 complete months,
                        summed across the language's editions

From the Wikimedia Analytics pageviews API (aggregate, all access, user agent), one request per
edition. The editions and their LTDI languages come from the wikipedia collector's list. Views count
readers of the edition, whatever their first language: many readers of the English or Spanish
Wikipedias are second-language readers, and some views of small editions are curious visitors.

Run:  python -m ltdi.collectors wikipedia_views   (needs wikimedia.org; takes a few minutes)
"""

from __future__ import annotations

import datetime as dt
import urllib.error

from ..http import fetch_json
from ..records import Record
from ._common import ltdi_codes
from .wikipedia import editions

API = "https://wikimedia.org/api/rest_v1/metrics/pageviews/aggregate/{wiki}.wikipedia/all-access/user/monthly/{start}/{end}"


def window(today: dt.date | None = None) -> tuple[str, str, str]:
    """The last 12 complete months: (start, end) for the API, and a label."""
    today = today or dt.date.today()
    end = today.replace(day=1) - dt.timedelta(days=1)  # last day of the previous month
    start = (end.replace(day=1) - dt.timedelta(days=330)).replace(day=1)
    return start.strftime("%Y%m0100"), end.strftime("%Y%m%d00"), f"{start:%b %Y} to {end:%b %Y}"


def collect() -> list[Record]:
    start, end, label = window()
    out = []
    by_code = editions()
    for code in ltdi_codes():
        eds = by_code.get(code, [])
        if not eds:
            continue
        views, used = 0, []
        for wiki, _, _ in eds:
            url = API.format(wiki=wiki, start=start, end=end)
            try:
                items = fetch_json(url)["items"]
            except urllib.error.HTTPError as e:
                if e.code == 404:  # an edition too new or closed to have figures
                    continue
                raise
            views += sum(i["views"] for i in items)
            used.append(wiki)
        if used:
            out.append(Record(code, "wikipedia_pageviews", views, "views in 12 months", "Wikimedia pageviews",
                              f"https://pageviews.wmcloud.org/siteviews/?sites={used[0]}.wikipedia.org",
                              method="api", note=f"{label}, by people; editions: {', '.join(used)}"))
    return out
