"""A collector run that loses many languages, or a most-spoken one, stops before writing (B3)."""
from ltdi.collectors import check_drops

TOP = ["en", "zh", "hi"]


def test_small_change_passes(capsys):
    old = {"x": {f"l{i}" for i in range(100)} | {"en"}}
    new = {"x": (old["x"] - {"l1", "l2"}) | {"l200"}}
    assert check_drops("c", old, new, TOP) == []
    assert "removed l1, l2" in capsys.readouterr().out


def test_large_drop_fails():
    old = {"x": {f"l{i}" for i in range(100)}}
    new = {"x": {f"l{i}" for i in range(50)}}
    assert check_drops("c", old, new, TOP)


def test_losing_a_most_spoken_language_fails():
    old = {"x": {f"l{i}" for i in range(100)} | {"hi"}}
    new = {"x": old["x"] - {"hi"}}
    assert "hi" in check_drops("c", old, new, TOP)[0]


def test_a_vanished_indicator_fails():
    assert check_drops("c", {"x": {"en", "fr"}}, {}, TOP)
