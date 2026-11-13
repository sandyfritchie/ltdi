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
    tech = {"consumer": ["a", "b", "c", "d"], "open": ["o"]}

    def test_presence_counts_share_of_services(self):
        fs = lambda n: {k: fact(k, 1 if i < n else 0) for i, k in enumerate("abcd")}
        self.assertEqual(tier(fs(4), self.tech), 1.0)
        self.assertEqual(tier(fs(2), self.tech), 0.625)
        self.assertEqual(tier(fs(1), self.tech), 0.438)
        self.assertEqual(tier(fs(0), self.tech), 0.0)

    def test_any_service_beats_open_only(self):
        self.assertEqual(tier({"o": fact("o", 1), "a": fact("a", 0)}, self.tech), 0.25)
        self.assertGreater(tier({"a": fact("a", 1)}, self.tech), 0.25)

    def test_nothing_collected_is_none(self):
        self.assertIsNone(tier({}, self.tech))

    def test_single_source_technology_can_reach_full(self):
        self.assertEqual(tier({"a": fact("a", 1)}, {"consumer": ["a"], "open": []}), 1.0)

    def test_open_only_technology_counts_open_tools(self):
        lid = {"consumer": [], "open": ["g", "c"]}
        self.assertEqual(tier({"g": fact("g", 1), "c": fact("c", 1)}, lid), 1.0)
        self.assertEqual(tier({"g": fact("g", 1), "c": fact("c", 0)}, lid), 0.625)
        self.assertEqual(tier({"g": fact("g", 0)}, lid), 0.0)


class LlmTests(unittest.TestCase):
    spec = {"consumer": ["app1", "app2"], "open": [], "measured": {"m": {"min": 70, "max": 100}, "n": {"min": 0.5, "max": 1.0}}}

    def test_nothing_known_is_none(self):
        self.assertIsNone(tech_score({}, self.spec))

    def test_benchmarks_only_are_linear_and_averaged(self):
        self.assertAlmostEqual(tech_score({"m": fact("m", 85)}, self.spec), 0.5)
        self.assertAlmostEqual(tech_score({"m": fact("m", 100), "n": fact("n", 0.5)}, self.spec), 0.5)

    def test_products_and_benchmarks_are_averaged(self):
        fs = {"app1": fact("app1", 1), "app2": fact("app2", 1), "m": fact("m", 85)}
        self.assertAlmostEqual(tech_score(fs, self.spec), 0.75)

    def test_listed_by_no_product_and_unmeasured_is_zero(self):
        self.assertEqual(tech_score({"app1": fact("app1", 0), "app2": fact("app2", 0)}, self.spec), 0.0)


class DepthTests(unittest.TestCase):
    tech = {"consumer": ["a", "b"], "open": [], "depth": {"a_feat": 4}}

    def test_service_depth_weights_that_services_credit(self):
        fs = {"a": fact("a", 1), "b": fact("b", 0), "a_feat": fact("a_feat", 2)}
        self.assertEqual(tech_score(fs, self.tech), 0.531)  # 0.25 + 0.75 x (0.5 + 0.5 x 0.5) / 2

    def test_adding_a_thin_service_never_lowers_the_score(self):
        without = tech_score({"a": fact("a", 0), "b": fact("b", 1), "a_feat": fact("a_feat", 0)}, self.tech)
        with_a = tech_score({"a": fact("a", 1), "b": fact("b", 1), "a_feat": fact("a_feat", 0)}, self.tech)
        self.assertGreater(with_a, without)

    def test_service_depth_ignored_where_service_is_absent(self):
        fs = {"a": fact("a", 0), "b": fact("b", 1), "a_feat": fact("a_feat", 4)}
        self.assertEqual(tech_score(fs, self.tech), 0.625)

    def test_technology_level_depth_averages_with_presence(self):
        tech = {"consumer": ["a"], "open": [], "depth": {"wer": {"min": 50, "max": 0}}}
        self.assertEqual(tech_score({"a": fact("a", 1), "wer": fact("wer", 25)}, tech), 0.75)

    def test_no_depth_record_keeps_presence(self):
        self.assertEqual(tech_score({"a": fact("a", 1)}, {"consumer": ["a"], "open": [], "depth": {"a_feat": 4}}), 1.0)


if __name__ == "__main__":
    unittest.main()


class TestQuality:
    TECH = {"consumer": ["mt_a", "mt_b"], "open": [], "quality": {"mt_a": {"indicator": "mt_a_q", "poor": 25, "good": 50}}}

    def facts(self, **kw):
        return {k: Record("x", k, v, "chrF++" if k.endswith("_q") else "bool", "", "") for k, v in kw.items()}

    def test_unmeasured_service_counts_in_full(self):
        assert tier(self.facts(mt_a=1, mt_b=1), self.TECH) == 1.0

    def test_poor_quality_counts_at_half(self):
        assert tier(self.facts(mt_a=1, mt_b=0, mt_a_q=10), self.TECH) == round(0.25 + 0.75 * 0.5 / 2, 3)

    def test_good_quality_counts_in_full(self):
        assert tier(self.facts(mt_a=1, mt_b=0, mt_a_q=60), self.TECH) == round(0.25 + 0.75 * 1 / 2, 3)

    def test_open_model_alone_is_discounted(self):
        tech = {"consumer": ["c"], "open": ["o"], "quality": {"o": {"indicator": "o_q", "poor": 50, "good": 10}}}
        f = {"c": Record("x", "c", 0, "bool", "", ""), "o": Record("x", "o", 1, "bool", "", ""),
             "o_q": Record("x", "o_q", 100, "% WER", "", "")}
        assert tier(f, tech) == 0.125
