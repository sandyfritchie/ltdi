"""One definition of "no commercial service" for the banner, the Gaps column and the Charts bars
(re-review R1): coverage() marks a gap exactly where the level is open-only or none, and text
technologies count a spoken variety through its written standard."""
import json
from collections import defaultdict

from ltdi import DATA
from ltdi.config import load_config
from ltdi.records import read_dir
from ltdi.score import coverage, inherit_written


def test_gaps_and_levels_agree_and_varieties_count_through_their_standard():
    cfg = load_config()
    langs = json.loads((DATA / "languages.json").read_text(encoding="utf-8"))
    codes = [l["code"] for l in langs]
    own = defaultdict(dict)
    for r in read_dir(DATA / "records", codes) + read_dir(DATA / "manual", codes):
        own[r.language][r.indicator] = r
    eff = defaultdict(dict, {c: dict(f) for c, f in own.items()})
    inherit_written(eff, {l["code"]: l["name"] for l in langs}, cfg)
    techs = cfg["dimensions"]["tech"]["technologies"]
    for code in codes[::7] + ["ksh", "arz", "wuu"]:
        cov = coverage(eff[code], cfg)
        for k, t in techs.items():
            if "indicator" in t or not t.get("consumer") or (t.get("group") == "more" and not t.get("gap")):
                continue
            self_consistent = (k in cov["gaps"]) == (cov["levels"][k] in ("open", "none"))
            assert self_consistent, (code, k, cov["levels"][k], cov["gaps"].get(k))
    assert "keyboard" not in coverage(eff["ksh"], cfg)["gaps"]  # a Kölsch speaker types with a German keyboard
