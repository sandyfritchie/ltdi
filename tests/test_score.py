import math
import unittest

from ltdi.records import Record
from ltdi.score import normalise, tier


def fact(ind, value):
    return Record("xx", ind, value, "bool", "test", "http://example.org")


class NormaliseTests(unittest.TestCase):
    def test_bool(self):
        self.assertEqual(normalise(1, {"scale": "bool"}), 1.0)
        self.assertEqual(normalise(0, {"scale": "bool"}), 0.0)

    def test_linear_clips(self):
        spec = {"scale": "linear", "min": 0, "max": 3}
        self.assertAlmostEqual(normalise(1.5, spec), 0.5)
        self.assertEqual(normalise(9, spec), 1.0)

    def test_log_midpoint(self):
        spec = {"scale": "log", "min": 0, "max": 999}
        self.assertAlmostEqual(normalise(math.sqrt(1000) - 1, spec), 0.5, places=6)


class TierTests(unittest.TestCase):
    tech = {"consumer": ["a", "b", "c"], "open": ["o"]}

    def test_two_consumer_products_is_full(self):
        self.assertEqual(tier({"a": fact("a", 1), "b": fact("b", 1)}, self.tech), 1.0)

    def test_one_consumer_product(self):
        self.assertEqual(tier({"a": fact("a", 1), "b": fact("b", 0)}, self.tech), 0.67)

    def test_open_only(self):
        self.assertEqual(tier({"o": fact("o", 1)}, self.tech), 0.33)

    def test_single_source_technology_can_reach_full(self):
        self.assertEqual(tier({"a": fact("a", 1)}, {"consumer": ["a"], "open": []}), 1.0)

    def test_unmeasured_llm_is_none(self):
        self.assertIsNone(tier({}, {"measured": "m", "mid": 90, "high": 97}))


if __name__ == "__main__":
    unittest.main()
