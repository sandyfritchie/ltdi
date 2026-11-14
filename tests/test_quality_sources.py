"""F5: every published quality figure says who measured it and on what (config/services.csv)."""

import unittest

from ltdi.config import services


class QualitySourceTests(unittest.TestCase):
    def test_every_quality_figure_has_a_test_set(self):
        for s in services():
            if s["quality"] or s["role"] == "measured":
                with self.subTest(s["id"]):
                    self.assertTrue(s["test_set"], "test_set")
                    self.assertIn(s["quality_by"], ("own", "independent"))
                    self.assertIn(s["test_public"], ("yes", "no"))

    def test_test_columns_only_where_there_is_a_figure(self):
        for s in services():
            if not (s["quality"] or s["role"] == "measured"):
                self.assertFalse(s["test_set"] or s["test_size"] or s["test_public"], s["id"])


if __name__ == "__main__":
    unittest.main()
