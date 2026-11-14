"""F7, F8, F9: the changes feed's rules, organisations' ids, and Wikipedia's 12-month window."""

import csv
import datetime as dt
import tempfile
import unittest
from pathlib import Path

from ltdi import CONFIG
from ltdi.changes import _day, edition_events
from ltdi.collectors.wikipedia_views import window
from ltdi.config import services
from ltdi.organisations import for_language, table


class ChangesTests(unittest.TestCase):
    def test_edition_diff_reports_both_directions(self):
        with tempfile.TemporaryDirectory() as d:
            ids = [s["id"] for s in services()][:2]
            for name, vals in (("2026-11", ("1", "0")), ("2027-05", ("0", "1"))):
                with (Path(d) / f"{name}-services.csv").open("w", newline="", encoding="utf-8") as f:
                    w = csv.writer(f)
                    w.writerow(["code", "name", *ids])
                    w.writerow(["yo", "Yoruba", *vals])
            events, _ = edition_events(Path(d))
        self.assertEqual(sorted(e[4] for e in events), [-1, 1])
        self.assertTrue(all(e[0] == "2026-11" and e[1] == "2027-05" for e in events))

    def test_one_edition_has_no_diff(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "2026-11-services.csv").write_text("code,name\n", encoding="utf-8")
            self.assertEqual(edition_events(Path(d))[0], [])

    def test_feed_dates(self):
        self.assertEqual(_day("2025-06"), "2025-06-30")
        self.assertEqual(_day("2025-12"), "2025-12-31")
        self.assertEqual(_day("2026-11"), "2026-11-01")


class OrganisationTests(unittest.TestCase):
    def test_every_id_is_tracked(self):
        known = {s["id"] for s in services()}
        known |= {r["indicator"] for r in csv.DictReader((CONFIG / "resources.csv").open(encoding="utf-8"))}
        known |= {f"bench_{k}" for k in ("global_mmlu", "mmmlu", "include", "xnli", "mgsm", "irokobench")}
        known |= {"ud_treebank_words", "wikipedia_articles"}
        for i, row in table().items():
            self.assertIn(i, known, i)
            self.assertTrue(row["source"].startswith("https://"), i)

    def test_grouped_by_organisation(self):
        facts = {"mt_open_nllb": {"value": 1}, "flores200": {"value": 1}, "speech_naijavoices": {"value": 600}}
        orgs = for_language({"mt_open_nllb"}, facts, lambda i: i)
        self.assertEqual(orgs[0]["organisation"], "NaijaVoices community and Lanfrica")  # community first
        meta = next(o for o in orgs if o["organisation"] == "Meta AI")
        self.assertEqual(sorted(meta["what"]), ["flores200", "mt_open_nllb"])


class WindowTests(unittest.TestCase):
    def test_last_twelve_complete_months(self):
        start, end, _ = window(dt.date(2026, 11, 14))
        self.assertEqual((start, end), ("2025110100", "2026103100"))


if __name__ == "__main__":
    unittest.main()
