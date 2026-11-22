"""Which speech services list a country locale for a spoken variety (ar-AE, "Arabic (United Arab
Emirates)") without naming the variety. Those count for the standard language (crosswalk.names_variety);
this lists them so a variety's page can say so: data/unnamed_locales.csv (language, indicator, counted_as).

Reruns the vendor collectors from the download cache with every country locale read as its variety, and
compares with the records they wrote. Run after the collectors: python tools/unnamed_locales.py
"""

from __future__ import annotations

import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ltdi import CONFIG, DATA, crosswalk  # noqa: E402
from ltdi.collectors import docs_vendors, speech_vendors, vendors  # noqa: E402
from ltdi.records import read_dir  # noqa: E402

MODULES = {"vendors": vendors, "speech_vendors": speech_vendors, "docs_vendors": docs_vendors}
OUT = DATA / "unnamed_locales.csv"


def main() -> None:
    with (CONFIG / "crosswalk_speech.csv").open(encoding="utf-8") as f:
        base = {}  # variety: the standard language its country locales count for
        for r in csv.DictReader(f):
            base.setdefault(r["ltdi"], crosswalk.to_ltdi(r["label"]))
    entries = (DATA / "list_entries.json").read_text(encoding="utf-8")
    crosswalk.ANY_LOCALE = True
    try:
        loose = [r for m in MODULES.values() for r in m.collect()]
    finally:
        crosswalk.ANY_LOCALE = False
        (DATA / "list_entries.json").write_text(entries, encoding="utf-8")  # the counts are the strict run's
    strict = {(r.language, r.indicator) for r in read_dir(DATA / "records", [*base])
              if r.value}
    rows = sorted({(r.language, r.indicator, base[r.language]) for r in loose
                   if r.value and r.unit == "bool" and r.language in base and (r.language, r.indicator) not in strict})
    with OUT.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["language", "indicator", "counted_as"])
        w.writerows(rows)
    print(f"wrote {OUT.relative_to(DATA.parent)}: {len(rows)} variety-service pairs")


if __name__ == "__main__":
    main()
