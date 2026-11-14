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

    def test_benchmarks_only_count_as_the_base_level_discounted_by_quality(self):
        # no app lists it, but a benchmark has measured it: offered at 0.25, times the quality factor
        self.assertAlmostEqual(tech_score({"m": fact("m", 85)}, self.spec), 0.188)  # 0.25 x (0.5 + 0.5 x 0.5)
        self.assertAlmostEqual(tech_score({"m": fact("m", 100), "n": fact("n", 0.5)}, self.spec), 0.188)

    def test_benchmark_quality_discounts_availability(self):
        fs = {"app1": fact("app1", 1), "app2": fact("app2", 1), "m": fact("m", 85)}
        self.assertAlmostEqual(tech_score(fs, self.spec), 0.75)  # 1.0 x (0.5 + 0.5 x 0.5)

    def test_being_measured_never_lowers_a_language_below_its_unmeasured_peers(self):
        for apps in ({"app1": 1, "app2": 1}, {"app1": 1, "app2": 0}, {"app1": 0, "app2": 0}):
            base = {k: fact(k, v) for k, v in apps.items()}
            unmeasured = tech_score(base, self.spec)
            good = tech_score(base | {"m": fact("m", 100), "n": fact("n", 1.0)}, self.spec)
            self.assertGreaterEqual(good, unmeasured)

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


class TestRegional:
    TECH = {"consumer": ["a", "b"], "regional": ["r1", "r2"], "open": []}

    def facts(self, **kw):
        return {k: Record("x", k, v, "bool", "", "") for k, v in kw.items()}

    def test_regional_raises_a_score(self):
        assert tier(self.facts(a=1, b=0, r1=1, r2=0), self.TECH) == round(0.25 + 0.75 * 2 / 3, 3)

    def test_regional_never_dilutes_where_absent(self):
        assert tier(self.facts(a=1, b=0, r1=0, r2=0), self.TECH) == round(0.25 + 0.75 * 1 / 2, 3)

    def test_several_regional_count_once(self):
        assert tier(self.facts(a=0, b=0, r1=1, r2=1), self.TECH) == round(0.25 + 0.75 * 1 / 3, 3)


class RankTests(unittest.TestCase):
    def test_ties_share_a_rank(self):
        from ltdi.score import assign_ranks
        rs = [{"code": c, "name": n, "ltdi": v} for c, n, v in
              [("a", "Zed", 0.5), ("b", "Bee", 0.9), ("c", "Ace", 0.5), ("d", "Dee", 0.1), ("x", "Old", 0.5)]]
        rs[-1]["extinct"] = True
        assign_ranks(rs)
        got = {r["code"]: (r["rank"], r["tied"]) for r in rs}
        self.assertEqual(got, {"b": (1, 0), "c": (2, 1), "a": (2, 1), "d": (4, 0), "x": (None, 0)})
        # within a tie, by name
        self.assertEqual([r["code"] for r in rs if r["rank"] == 2], ["c", "a"])

    def test_anything_recorded_ranks_above_nothing(self):
        from ltdi.score import assign_ranks
        # both floored to the same LTDI; one has a little data before the floor
        dims = lambda d: {"data": {"score": 0.05, "raw": d}, "tech": {"score": 0.05, "raw": 0.0}}
        rs = [{"code": "n", "name": "Aaa", "ltdi": 0.05, "dimensions": dims(0.0)},
              {"code": "s", "name": "Zzz", "ltdi": 0.05, "dimensions": dims(0.01)}]
        assign_ranks(rs)
        got = {r["code"]: r["rank"] for r in rs}
        self.assertEqual(got, {"s": 1, "n": 2})


class TierOfTests(unittest.TestCase):
    CFG = {"tiers": {"cutoffs": [["vh", "Very high", 0.9], ["h", "High", 0.75], ["m", "Medium", 0.6]],
                     "stages": []},
           "dimensions": {"tech": {"technologies": {"mt": {"consumer": ["c"], "open": ["o"], "regional": ["r"]}}}}}

    def tier_of(self, ltdi, data=0.0, **on):
        from ltdi.score import tier_of
        facts = {k: fact(k, v) for k, v in on.items()}
        return tier_of(ltdi, facts, {"data": {"score": max(0.05, data), "raw": data}}, self.CFG)

    def test_cutoffs_for_the_top_three(self):
        self.assertEqual([self.tier_of(v) for v in (0.95, 0.9, 0.8, 0.6)], ["vh", "vh", "h", "m"])

    def test_stages_below_medium(self):
        self.assertEqual(self.tier_of(0.5, c=1), "lc")
        self.assertEqual(self.tier_of(0.5, r=1), "lc")  # a regional provider is commercial support
        self.assertEqual(self.tier_of(0.5, o=1, c=0), "lo")
        self.assertEqual(self.tier_of(0.2, data=0.1), "ld")
        self.assertEqual(self.tier_of(0.05), "ln")


class LocaleTests(unittest.TestCase):
    def test_cldr_level_scales_linearly(self):
        spec = {"indicator": "cldr_coverage", "min": 0, "max": 3}
        f = Record("xx", "cldr_coverage", 2, "level", "test", "http://example.org")
        self.assertAlmostEqual(tech_score({"cldr_coverage": f}, spec), 0.667)
        self.assertIsNone(tech_score({}, spec))
