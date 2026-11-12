from ltdi.crosswalk import to_ltdi


def test_speech_locale_names_the_spoken_variety():
    assert to_ltdi("ar-EG", speech=True) == "arz"
    assert to_ltdi("ar-AE", speech=True) == "afb"
    assert to_ltdi("fa-AF", speech=True) == "prs"


def test_text_locale_stays_the_standard_language():
    assert to_ltdi("ar-EG") == "ar"
    assert to_ltdi("ar-SA", speech=True) == "ar"  # Saudi Arabia: several varieties, so Arabic
