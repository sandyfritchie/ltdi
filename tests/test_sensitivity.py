import random

from ltdi.config import load_config
from ltdi.sensitivity import competition_ranks, method, score_all


def test_ties_share_a_rank():
    assert competition_ranks([(0.9, 0.5), (0.5, 0.2), (0.9, 0.5), (0.1, 0.0)]) == [1, 3, 1, 4]


def test_unvaried_method_is_the_configured_one():
    cfg = load_config()
    m = method(cfg)
    assert m["floor"] == cfg["meta"]["floor"]
    assert m["tech"] == {k: t["weight"] for k, t in cfg["dimensions"]["tech"]["technologies"].items()}


def test_rescoring_matches_the_formula():
    cfg = load_config()
    lang = {"data": {"web_text_words": (1e7, None)}, "tech": {"keyboard": 1.0, "mt": 0.0}}
    m = method(cfg)
    m["data"] = {"web_text_words": {**cfg["dimensions"]["data"]["indicators"]["web_text_words"], "weight": 1}}
    m["tech"] = {"keyboard": 1, "mt": 1}
    (ltdi, raw), = score_all([lang], m)
    spec = m["data"]["web_text_words"]
    import math
    d = (math.log10(1e7 + 1) - math.log10(spec["min"] + 1)) / (math.log10(spec["max"] + 1) - math.log10(spec["min"] + 1))
    assert abs(ltdi - round(math.sqrt(round(d, 4) * 0.5), 4)) < 1e-4


def test_draws_vary_within_their_ranges():
    cfg = load_config()
    rng = random.Random(1)
    for _ in range(50):
        m = method(cfg, rng)
        assert 0.025 <= m["floor"] <= 0.075
        for k, t in cfg["dimensions"]["tech"]["technologies"].items():
            assert 0.5 * t["weight"] - 1e-9 <= m["tech"][k] <= 1.5 * t["weight"] + 1e-9
