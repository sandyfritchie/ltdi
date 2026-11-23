"""The Linguistic Data Consortium's speech corpora, for listing on language pages (never counted: LDC
corpora are licensed, mostly for a fee).

  python tools/ldc_speech.py crawl          read the catalog (catalog.ldc.upenn.edu/byyear, then each speech
                                            corpus's page, one a second) and print LDCROW lines; run in Actions
                                            (.github/workflows/ldc-catalog.yml), since the catalog isn't reachable
                                            from everywhere
  python tools/ldc_speech.py ingest LOG     turn a crawl's log into config/ldc_speech.csv

Hours come from each corpus's introduction ("approximately 190 hours ..."), and only where the corpus has one
language other than English; where it has several, it's listed for each without hours.
"""

from __future__ import annotations

import csv
import html
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CAT = "https://catalog.ldc.upenn.edu"
UA = {"User-Agent": "ltdi-collector/0.1 (+https://github.com/sandyfritchie/ltdi)"}
FIELDS = ["id", "name", "languages", "hours", "task", "licence", "nonmember", "released"]


def get(url: str) -> str:
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                return r.read().decode("utf-8", "replace")
        except Exception:  # noqa: BLE001
            if attempt == 3:
                raise
            time.sleep(5 * (attempt + 1))
    return ""


def text(page: str) -> str:
    page = re.sub(r"<script.*?</script>|<style.*?</style>", "", page, flags=re.S)
    page = re.sub(r"</t[dh]>", " | ", page)
    return re.sub(r"[ \t\r\n]+", " ", html.unescape(re.sub(r"<[^>]+>", " ", page)))


def field(t: str, label: str) -> str:
    m = re.search(re.escape(label) + r":\s*\|\s*(.*?)\s*\|", t)
    return m.group(1).strip() if m else ""


def parse(cid: str, page: str) -> dict:
    t = text(page)
    intro = t.split("Introduction", 1)[1][:3000] if "Introduction" in t else ""
    m = re.search(r"(?:approximately|about|over|nearly|some|roughly)?\s*([\d][\d,]*(?:\.\d+)?)\s+hours", intro)
    price = re.search(r'data-price-table="([^"]+)"', page)
    nm = ""
    if price:
        try:
            nm = json.loads(html.unescape(price.group(1))).get("nm", {}).get("price", "")
        except ValueError:
            pass
    apps = field(t, "Application(s)").lower()
    task = "text-to-speech" if "synthesis" in apps else "speech recognition" if "recognition" in apps else "speech"
    return {"id": cid, "name": field(t, "Item Name"), "languages": field(t, "Language ID(s)"),
            "hours": m.group(1).replace(",", "") if m else "", "task": task, "licence": field(t, "License(s)"),
            "nonmember": nm, "released": field(t, "Release Date")}


def crawl() -> None:
    ids = sorted(set(re.findall(r"\b(LDC\d{4}S\d{2,3})\b", get(f"{CAT}/byyear"))))
    print(f"{len(ids)} speech corpora", flush=True)
    for cid in ids:
        try:
            row = parse(cid, get(f"{CAT}/{cid}"))
            print("LDCROW " + json.dumps(row, ensure_ascii=False), flush=True)
        except Exception as e:  # noqa: BLE001
            print(f"FAILED {cid}: {e}", flush=True)
        time.sleep(1)


def ingest(log: str) -> None:
    sys.path.insert(0, str(ROOT))
    from ltdi.crosswalk import to_ltdi
    rows = []
    for line in Path(log).read_text(encoding="utf-8").splitlines():
        if "LDCROW " not in line:
            continue
        r = json.loads(line.split("LDCROW ", 1)[1])
        codes = [c.strip() for c in r["languages"].split(",") if c.strip()]
        langs = list(dict.fromkeys(filter(None, (to_ltdi(c) for c in codes))))
        others = [c for c in langs if c != "en"]
        one = others if len(others) == 1 else langs if len(langs) == 1 else []
        price = r["nonmember"].replace("$", "").replace(",", "")
        paid = "no" if price in ("0.00", "0") else "yes"
        lic = r["licence"] + (f"; non-members {r['nonmember']}" if r["nonmember"] else "")
        for c in langs:
            rows.append({"id": "ldc_" + r["id"], "language": c, "name": f"{r['name']} ({r['id']})", "steward": "Linguistic Data Consortium",
                         "task": r["task"], "hours": r["hours"] if one and c in one else "", "licence": lic, "paid": paid,
                         "url": f"{CAT}/{r['id']}", "distributor": "the Linguistic Data Consortium"})
    out = ROOT / "config" / "ldc_speech.csv"
    with out.open("w", newline="", encoding="utf-8") as f:
        f.write("# The Linguistic Data Consortium's speech corpora, read by tools/ldc_speech.py: listed, never counted.\n")
        w = csv.DictWriter(f, fieldnames=["id", "language", "name", "steward", "task", "hours", "licence", "paid", "url", "distributor"],
                           lineterminator="\n")
        w.writeheader()
        w.writerows(sorted(rows, key=lambda r: (r["language"], r["id"])))
    print(f"wrote {out}: {len(rows)} rows, {len({r['id'] for r in rows})} corpora, {len({r['language'] for r in rows})} languages")


if __name__ == "__main__":
    {"crawl": lambda: crawl(), "ingest": lambda: ingest(sys.argv[2])}[sys.argv[1]]()
