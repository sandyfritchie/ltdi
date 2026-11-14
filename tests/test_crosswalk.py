"""How source labels resolve to LTDI codes, including the cases that have gone wrong before."""
from ltdi.crosswalk import to_ltdi


def test_chinese_labels():
    assert to_ltdi("zh") == "cmn"          # vendors' "Chinese" is Mandarin
    assert to_ltdi("zh-TW") == "cmn"       # Traditional characters, still Mandarin
    assert to_ltdi("zh-Hant") == "cmn"
    assert to_ltdi("zh-HK") == "yue"       # Hong Kong: Cantonese
    assert to_ltdi("zh-HK", speech=True) == "yue"


def test_speech_and_text_locales():
    assert to_ltdi("ar-EG") == "ar" and to_ltdi("ar-EG", speech=True) == "arz"
    assert to_ltdi("fa-AF") == "fa" and to_ltdi("fa-AF", speech=True) == "prs"


def test_script_subtags():
    assert to_ltdi("pa") == "pa"
    assert to_ltdi("pa-Arab") == "pnb"     # Punjabi in Shahmukhi: Western Punjabi
    assert to_ltdi("sr-Latn") == "sr"


def test_deprecated_codes():
    assert [to_ltdi(c) for c in ("iw", "in", "ji", "mo", "tl", "no")] == ["he", "id", "yi", "ro", "fil", "nb"]


def test_unknown_labels_are_skipped():
    assert to_ltdi("qqq") is None and to_ltdi("sh") is None  # sh: retired Serbo-Croatian, ambiguous
