"""Hand-copied language lists due for a re-check.

Most lists are read from the companies' pages by the collectors, so a change shows up on its own. A few
pages can't be read that way and are copied by hand (records with method "manual"), so nothing notices
when they change. This lists those copied more than --days ago (default 90) with the page to check.

  python tools/stale_lists.py            print them
  python tools/stale_lists.py --issue    also open a GitHub issue listing them, or update the open one
                                         (the monthly collectors run this, so the reminder arrives as an
                                         issue notification)

After re-checking a list, update it in its collector and the date there (RETRIEVED), then re-run the
collector."""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TITLE = "Re-check hand-copied language lists"

# What to look for beyond changes to the list itself
NOTES = {
    "llm_app_meta": "Meta publishes no list for the Meta AI app, so Llama 4's model card stands in; use an app list if one now exists, or a newer Llama model card.",
    "llm_app_qwen": "Qwen3.5 says it supports 201 languages but publishes no list, so Qwen3's table stands in; use a newer list if one now exists.",
    "llm_app_claude": "This is the app's language setting (listed_only in methodology.toml); check that the page still says Claude can be used in other languages.",
    "llm_app_chatgpt": "This is the app's language setting (listed_only in methodology.toml); check that it still is.",
}


def stale(days: int, today: dt.date) -> list[dict]:
    lists = {}
    for path in sorted((ROOT / "data" / "records").glob("*.csv")):
        with path.open(encoding="utf-8") as f:
            for r in csv.DictReader(f):
                if r.get("method") != "manual" or not r.get("retrieved"):
                    continue
                if re.search(r"/[0-9a-f]{40}/", r["url"]):  # a file pinned to a commit can't change
                    continue
                key = (r["indicator"], r["url"])
                if key not in lists:
                    lists[key] = {"indicator": r["indicator"], "source": r["source"], "url": r["url"],
                                  "retrieved": r["retrieved"], "collector": f"ltdi/collectors/{path.stem}.py"}
    out = []
    for x in lists.values():
        age = (today - dt.date.fromisoformat(x["retrieved"])).days
        if age > days:
            out.append(x | {"age": age})
    return sorted(out, key=lambda x: (x["collector"], x["indicator"]))


def body(rows: list[dict], days: int) -> str:
    lines = [f"These language lists were copied by hand more than {days} days ago, so a change to the page "
             "wouldn't be noticed. Check each page, update the list and its RETRIEVED date in the collector, "
             "and re-run the collector. (Opened by `tools/stale_lists.py`.)", ""]
    for x in rows:
        note = f" {NOTES[x['indicator']]}" if x["indicator"] in NOTES else ""
        lines.append(f"- [ ] **{x['source']}** (`{x['indicator']}`, copied {x['retrieved']}, in `{x['collector']}`): "
                     f"{x['url']}{note}")
    return "\n".join(lines) + "\n"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--days", type=int, default=90)
    ap.add_argument("--issue", action="store_true", help="open or update a GitHub issue (needs gh)")
    a = ap.parse_args()
    rows = stale(a.days, dt.date.today())
    if not rows:
        print(f"no hand-copied list is more than {a.days} days old")
        return
    text = body(rows, a.days)
    print(text)
    if a.issue:
        found = json.loads(subprocess.run(["gh", "issue", "list", "--state", "open", "--search", f'in:title "{TITLE}"',
                                           "--json", "number,title"], capture_output=True, text=True, check=True).stdout)
        num = next((i["number"] for i in found if i["title"] == TITLE), None)
        cmd = ["gh", "issue", "edit", str(num), "--body", text] if num else \
              ["gh", "issue", "create", "--title", TITLE, "--body", text]
        subprocess.run(cmd, check=True)


if __name__ == "__main__":
    sys.exit(main())
