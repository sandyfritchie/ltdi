"""On the committed records: a language benchmarked at or above every "good" mark scores no lower for
LLMs than an unbenchmarked one with the same app coverage (re-review R2)."""
import json
from collections import defaultdict

from ltdi import DATA
from ltdi.config import load_config
from ltdi.records import read_dir
from ltdi.score import tech_score


def llm_facts():
    codes = [l["code"] for l in json.loads((DATA / "languages.json").read_text(encoding="utf-8"))]
    out = defaultdict(dict)
    for r in read_dir(DATA / "records", codes) + read_dir(DATA / "manual", codes):
        out[r.language][r.indicator] = r
    return out


def test_strong_results_count_in_full():
    t = load_config()["dimensions"]["tech"]["technologies"]["llm"]
    facts = llm_facts()
    score = {c: tech_score(f, t) for c, f in facts.items()}
    assert score["es"] >= score["nl"]  # Spanish, benchmarked, against Dutch, which isn't
    apps = t["consumer"]
    for c, f in facts.items():
        in_all = all(f.get(i) and f[i].value for i in apps)
        measured = {i: s for i, s in t["measured"].items() if i in f}
        if in_all and measured and all(f[i].value >= s["max"] for i, s in measured.items()):
            assert score[c] == 1.0, c
