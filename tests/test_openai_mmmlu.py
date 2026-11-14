import unittest
from pathlib import Path

from ltdi.collectors.openai_mmmlu import NAMES, SKIP, _table, parse

FIXTURE = Path(__file__).parent / "fixtures" / "openai_mmmlu_results.md"


class MMMLUTests(unittest.TestCase):
    def test_every_table_row_maps(self):
        text = FIXTURE.read_text(encoding="utf-8")
        rows = [r[0] for r in _table(text)[1:]]
        self.assertTrue(all(r in NAMES or r in SKIP for r in rows), rows)
        model, recs = parse(text)
        self.assertEqual(len(recs), 14)
        self.assertEqual({r.language for r in recs} >= {"de", "it", "ko"}, True)

    def test_unmapped_row_raises(self):
        text = FIXTURE.read_text(encoding="utf-8").replace("| Korean ", "| Klingon ")
        with self.assertRaises(ValueError):
            parse(text)


if __name__ == "__main__":
    unittest.main()
