import math
import unittest

from ltdi.records import Record
from ltdi.score import normalise, tech_score, tier


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

    def test_open_only_technology_counts_open_tools(self):
        lid = {"consumer": [], "open": ["g", "c"]}
        self.assertEqual(tier({"g": fact("g", 1), "c": fact("c", 1)}, lid), 1.0)
        self.assertEqual(tier({"g": fact("g", 1), "c": fact("c", 0)}, lid), 0.67)
        self.assertEqual(tier({"g": fact("g", 0)}, lid), 0.0)

    def test_unmeasured_llm_is_none(self):
        self.assertIsNone(tier({}, {"measured": {"m": {"min": 70, "max": 100}}}))

    def test_measured_llm_is_linear(self):
        self.assertAlmostEqual(tier({"m": fact("m", 85)}, {"measured": {"m": {"min": 70, "max": 100}}}), 0.5)

    def test_measured_llm_averages_benchmarks(self):
        spec = {"measured": {"m": {"min": 70, "max": 100}, "n": {"min": 0.5, "max": 1.0}}}
        self.assertAlmostEqual(tier({"m": fact("m", 100), "n": fact("n", 0.5)}, spec), 0.5)


class DepthTests(unittest.TestCase):
    tech = {"consumer": ["a"], "open": [], "depth": {"feat": 4}}

    def test_depth_averages_with_tier(self):
        self.assertEqual(tech_score({"a": fact("a", 1), "feat": fact("feat", 2)}, self.tech), 0.75)

    def test_depth_ignored_when_absent(self):
        self.assertEqual(tech_score({"a": fact("a", 0), "feat": fact("feat", 4)}, self.tech), 0.0)

    def test_inverted_depth_scale(self):
        tech = {"consumer": ["a"], "open": [], "depth": {"wer": {"min": 50, "max": 0}}}
        self.assertEqual(tech_score({"a": fact("a", 1), "wer": fact("wer", 25)}, tech), 0.75)

    def test_no_depth_record_keeps_tier(self):
        self.assertEqual(tech_score({"a": fact("a", 1)}, self.tech), 1.0)


if __name__ == "__main__":
    unittest.main()
