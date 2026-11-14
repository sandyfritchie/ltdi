import csv
import json

import ltdi.edition as edition

CFG = {"meta": {"edition": "2099-01", "methodology_version": "9.9"},
       "tiers": {"cutoffs": [["vh", "Very high", 0.9]], "stages": [["ln", "None recorded", "Nothing"]]},
       "dimensions": {"tech": {"technologies": {"mt": {"label": "Translation"}}}}}


def lang(code, ltdi, rank, tier, **kw):
    dims = {"tech": {"score": ltdi, "raw": ltdi, "indicators": {"mt": ltdi}},
            "data": {"score": ltdi, "raw": ltdi / 2, "indicators": {}}}
    return {"code": code, "name": code.upper(), "speakers": 10, "ltdi": ltdi, "rank": rank, "tied": 0,
            "tier": tier, "dimensions": dims, **kw}


def test_edition_table_and_metadata(tmp_path, monkeypatch):
    monkeypatch.setattr(edition, "DATA", tmp_path)
    (tmp_path / "records").mkdir()
    (tmp_path / "manual").mkdir()
    (tmp_path / "languages.json").write_text("[]")
    rs = [lang("aa", 0.95, 1, "vh"),
          lang("bb", 0.05, 2, "ln", written_in="aa", via={"ltdi": 0.6, "tier": "vh"}),
          lang("cc", 0.05, None, "ln", extinct=True)]
    edition.write_edition(rs, CFG)
    rows = list(csv.DictReader((tmp_path / "editions" / "2099-01.csv").open()))
    assert [r["code"] for r in rows] == ["aa", "bb", "cc"]
    assert rows[0]["tier"] == "Very high" and rows[0]["tech_mt"] == "0.9500"
    assert rows[1]["data_unfloored"] == "0.0250" and rows[1]["through_standard_ltdi"] == "0.6000"
    assert rows[2]["rank"] == "" and rows[2]["tied"] == ""  # extinct: outside the ranking
    meta = json.loads((tmp_path / "editions" / "2099-01.json").read_text())
    assert meta["methodology_version"] == "9.9" and meta["ranked"] == 2
    assert set(meta["columns"]) == set(rows[0])  # every column is described
