"""The database download (ltdi/export.py): its tables hang together, and it answers a builder's question.
Needs data/scores.json, so it runs where the Index has been scored (skipped otherwise)."""

import json
import sqlite3
import tempfile
import unittest
import zipfile
from pathlib import Path

from ltdi import DATA
from ltdi import export

SCORES = DATA / "scores.json"


@unittest.skipUnless(SCORES.exists(), "needs data/scores.json (python -m ltdi.score)")
class ExportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.scores = json.loads(SCORES.read_text(encoding="utf-8"))
        cls.tables = export.build(cls.scores)

    def test_every_row_has_every_column(self):
        for t, cols in export.TABLES.items():
            names = {c[0] for c in cols}
            for r in self.tables[t]:
                self.assertEqual(set(r), names, t)

    def test_keys_join(self):
        langs = {r["code"] for r in self.tables["languages"]}
        datasets = {r["id"] for r in self.tables["datasets"]}
        services = {r["id"] for r in self.tables["services"]}
        indicators = {r["id"] for r in self.tables["indicators"]}
        self.assertEqual(len(datasets), len(self.tables["datasets"]))  # ids are unique
        for t in ("service_languages", "dataset_languages", "language_facts", "not_collected"):
            self.assertLessEqual({r["language"] for r in self.tables[t]}, langs, t)
        self.assertLessEqual({r["dataset"] for r in self.tables["dataset_languages"]}, datasets)
        self.assertLessEqual({r["service"] for r in self.tables["service_languages"]}, services)
        self.assertLessEqual({r["indicator"] for r in self.tables["language_facts"]}, indicators)
        pairs = [(r["dataset"], r["language"]) for r in self.tables["dataset_languages"]]
        self.assertEqual(len(pairs), len(set(pairs)))

    def test_no_scores_or_placeholders(self):
        facts = {r["indicator"] for r in self.tables["language_facts"]}
        self.assertFalse(facts & {"ltdi", "rank", "eval_benchmarks", "reach_text_share_5y"})
        self.assertNotIn(("fineweb2", "en"), {(r["dataset"], r["language"]) for r in self.tables["dataset_languages"]})

    def test_hausa_speech_with_where_to_get_it(self):
        with tempfile.TemporaryDirectory() as d:
            _, qzip = export.write(Path(d), self.scores)
            with zipfile.ZipFile(qzip) as z:
                z.extractall(d)
            db = sqlite3.connect(Path(d) / f"ltdi-database-{self.scores['edition']}.sqlite")
            rows = db.execute("""SELECT d.name, dl.repository, dl.subset FROM dataset_languages dl JOIN datasets d ON d.id = dl.dataset
                                 WHERE dl.language = 'ha' AND d.category = 'speech' AND d.counted AND d.commercial_use = 'yes'""").fetchall()
            db.close()
        names = {r[0] for r in rows}
        self.assertIn("FLEURS", names)
        self.assertIn(("FLEURS", "huggingface:google/fleurs", "ha_ng"), rows)


if __name__ == "__main__":
    unittest.main()
