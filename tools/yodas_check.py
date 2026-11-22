"""How much of each YODAS2 language's subtitle text is in that language (config/yodas_language_share.csv).

YODAS2 counts hours of YouTube video with manually uploaded subtitles, by the language the video is
labelled with. Many subtitles are in another language: English subtitles on Georgian, Tamil or Yoruba
videos, Russian on Kazakh, French on Lingala. This samples each language's subtitle text (three text
shards from each of its first two subsets), identifies the language of each video's subtitles with
py3langid, and records the share of text that isn't in a widely used other language. The speech collector
counts YODAS2 hours times that share.

Only text identified as one of a few widely used languages (OTHER) counts against a language, since an
identifier often mistakes a smaller language for a related one; and a language isn't counted against
itself or against the languages it's most often confused with (CLOSE).

  pip install py3langid
  python tools/yodas_check.py        rewrites config/yodas_language_share.csv (needs huggingface.co)
"""

from __future__ import annotations

import csv
import datetime as dt
import json
import re
import sys
import urllib.request
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from ltdi.collectors import present  # noqa: E402
from ltdi.http import USER_AGENT  # noqa: E402

HF = "https://huggingface.co/datasets/espnet/yodas2"
OUT = ROOT / "config" / "yodas_language_share.csv"
OTHER = {"en", "fr", "es", "pt", "de", "ru", "ar", "zh", "id", "tr", "it"}
# languages an identifier confuses with one of OTHER: that one isn't counted against them
CLOSE = {"ms": {"id"}, "jv": {"id"}, "su": {"id"}, "gl": {"pt", "es"}, "ca": {"es"}, "oc": {"fr", "es"},
         "uk": {"ru"}, "be": {"ru"}, "ast": {"es"}, "pt": {"es"}, "es": {"pt"}, "lb": {"de"}, "ht": {"fr"},
         "mt": {"it", "ar"}, "ur": {"ar"}, "fa": {"ar"}, "ps": {"ar"}, "sd": {"ar"}, "ug": {"ar"}, "ku": {"ar", "tr"},
         "az": {"tr"}, "tk": {"tr"}, "gag": {"tr"}, "yue": {"zh"}, "wuu": {"zh"}, "iw": {"ar"}, "yi": {"de"},
         "rm": {"it", "es"}, "sc": {"it", "es"}, "co": {"it", "fr"}, "fy": {"de"}, "la": {"it", "es"}}


def get(url: str) -> bytes:
    return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": USER_AGENT}), timeout=60).read()


def main() -> None:
    import py3langid.langid as lid
    lid.classify("x")
    ident = lid.IDENTIFIER
    shards = dict(re.findall(r"'(\w+)':\s*(\d+)", get(f"{HF}/raw/main/meta.py").decode()))
    subsets: dict[str, list[tuple[str, int]]] = {}
    for s, n in shards.items():
        if re.fullmatch(r"[a-z]{2,3}0\d\d", s) and int(n):
            subsets.setdefault(s[:-3], []).append((s, int(n)))
    rows = []
    for lang, lst in sorted(subsets.items()):
        code = next(iter(present({lang})), None)
        if not code:
            continue
        chars, other, videos = 0, Counter(), 0
        skip = (OTHER & {lang, code}) | CLOSE.get(lang, set()) | CLOSE.get(code, set())
        for s, n in lst[:2]:
            for i in sorted({0, n // 2, n - 1}):
                try:
                    data = json.loads(get(f"{HF}/resolve/main/data/{s}/text/{i:08d}.json"))
                except Exception as e:  # a missing shard: sample the rest
                    print(f"  {s} {i}: {e}", file=sys.stderr)
                    continue
                for v in data:
                    t = re.sub(r"&\w+;|&#\d+;", "", " ".join(v["text"].values()))
                    if len(t) < 20:
                        continue
                    videos += 1
                    label, _ = ident.classify(t[:2000])
                    chars += len(t)
                    if label in OTHER and label not in skip:
                        other[label] += len(t)
        if not chars:
            continue
        share = 1 - sum(other.values()) / chars
        top = ", ".join(f"{k} {v / chars:.0%}" for k, v in other.most_common(2))
        rows.append({"yodas": lang, "language": code, "videos_sampled": videos,
                     "share": f"{share:.2f}" if share < 0.95 else "1", "other": top})
        print(lang, code, videos, rows[-1]["share"], top)
    with OUT.open("w", newline="", encoding="utf-8") as f:
        f.write(f"# Share of each YODAS2 language's sampled subtitle text in that language (tools/yodas_check.py, "
                f"{dt.date.today().isoformat()}); 1 where 95% or more\n")
        w = csv.DictWriter(f, fieldnames=["yodas", "language", "videos_sampled", "share", "other"])
        w.writeheader()
        w.writerows(rows)


if __name__ == "__main__":
    main()
