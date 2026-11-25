"""Flag speaker counts that disagree sharply with Wikipedia.

For every language with a count, reads the speaker figure in its English Wikipedia infobox (the same
way ltdi.wikipedia_speakers does, cached) and lists those where the two differ by more than a factor
of RATIO, largest first. A disagreement is a prompt to check the sources, not proof of an error:
Wikipedia may count first-language speakers only, or an older census.

Run:  python tools/check_speakers.py [ratio]   (needs en.wikipedia.org)
Writes .cache/speaker_check.csv.
"""

from __future__ import annotations

import csv
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from ltdi import DATA  # noqa: E402
from ltdi.wikipedia_speakers import article, clean, field, parse_speakers  # noqa: E402

RATIO = float(sys.argv[1]) if len(sys.argv) > 1 else 10


def main() -> None:
    langs = [l for l in json.loads((DATA / "languages.json").read_text(encoding="utf-8"))
             if l.get("speakers") and l.get("iso_639_3")]
    with ThreadPoolExecutor(3) as pool:
        pages = list(pool.map(lambda l: article(l["iso_639_3"]), langs))
    rows = []
    for l, page in zip(langs, pages):
        if not page or page[0].startswith("ISO 639:"):
            continue
        title, box = page
        if clean(field(box, "iso3")).lower() != l["iso_639_3"] or field(box, "lc1"):
            continue
        wp = parse_speakers(field(box, "speakers"))
        if not wp:
            continue
        r = l["speakers"] / wp
        if r > RATIO or r < 1 / RATIO:
            rows.append({"_r": r, "code": l["code"], "name": l["name"], "ours": l["speakers"], "wikipedia": int(wp),
                         "ratio": round(r, 2) if r >= 0.01 else f"{r:.1e}", "article": title,
                         "as_written": clean(field(box, "speakers"))[:120], "date": clean(field(box, "date"))})
    rows.sort(key=lambda x: -max(x["_r"], 1 / x["_r"]) * x["ours"])
    for x in rows:
        del x["_r"]
    out = DATA.parent / ".cache" / "speaker_check.csv"
    with out.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]) if rows else ["code"])
        w.writeheader()
        w.writerows(rows)
    print(f"{len(langs)} languages with a count; {len(rows)} differ from Wikipedia by more than {RATIO:g}x; "
          f"written to {out}")


if __name__ == "__main__":
    main()
