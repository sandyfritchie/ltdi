import unittest

from ltdi.opportunities import find, rank
from ltdi.records import Record


def facts(**kw):
    return {k: Record("xx", k, v, "x", "test", "http://example.org") for k, v in kw.items()}


def titles(fs, type_=None):
    return [o["title"] for o in find(fs) if type_ is None or o["type"] == type_]


FULL = dict(kb_gboard=1, kb_apple=1, kb_apple_features=4, asr_google=1, asr_azure=1, asr_apple=1,
            asr_whisper_fleurs_wer=4, cv_validated_hours=2000, tts_google=1, mt_google=1, mt_azure=1,
            mt_deepl=1, mt_open_nllb=1, llm_global_mmlu_rel=100, belebele=1, cldr_coverage=3,
            web_text_words=1e12, wikipedia_active_editors=100000)


class FindTests(unittest.TestCase):
    def test_fully_supported_language_has_no_opportunities(self):
        self.assertEqual(find(facts(**FULL)), [])

    def test_keyboard_on_one_platform_is_share(self):
        fs = facts(**{**FULL, "kb_apple": 0})
        self.assertIn("A keyboard layout exists but isn't on every major platform", titles(fs, "share"))

    def test_tts_gap_is_share_with_data_and_collect_without(self):
        self.assertTrue(any("text-to-speech" in t for t in titles(facts(**{**FULL, "tts_google": 0}), "share")))
        thin = facts(**{**FULL, "tts_google": 0, "cv_validated_hours": 3})
        self.assertIn("Record a single-speaker voice for text-to-speech", titles(thin, "collect"))

    def test_unmeasured_llm_is_measure(self):
        fs = facts(**{k: v for k, v in FULL.items() if k != "llm_global_mmlu_rel"})
        self.assertIn("No published LLM benchmark results", titles(fs, "measure"))

    def test_wording_never_names_companies(self):
        sparse = facts(kb_gboard=1, kb_apple=1, kb_apple_features=0, asr_google=1, cv_validated_hours=30,
                       web_text_words=1e7, cldr_coverage=1, asr_whisper_fleurs_wer=100, mt_google=1,
                       mt_open_nllb=1, wikipedia_active_editors=5)
        text = " ".join(o["title"] + " " + o["detail"] for o in find(sparse))
        for name in ("Apple", "Google", "Microsoft", "Azure", "DeepL", "OpenAI", "Anthropic", "Meta", "Gboard"):
            self.assertNotIn(name, text)


class RankTests(unittest.TestCase):
    def test_need_lowers_priority_for_well_supported_languages(self):
        opp = lambda: [{"type": "measure", "technology": "llm", "gap": 1.0}]
        scores = lambda ltdi: {"ltdi": ltdi, "dimensions": {"tech": {"indicators": {}},
                                                             "writing": {"score": 1}, "data": {"score": 1}}}
        lang = {"speakers": 1e8}
        strong = rank(lang, opp(), scores(0.95))[0]["priority"]
        weak = rank(lang, opp(), scores(0.5))[0]["priority"]
        self.assertGreater(weak, strong)


class ReachTests(unittest.TestCase):
    base = {"ltdi": 0.5, "dimensions": {"tech": {"indicators": {}}, "writing": {"score": 1}, "data": {"score": 1}}}

    def test_voice_reaches_more_than_text_where_texting_is_rare(self):
        fs = facts(reach_voice_share=0.4, reach_text_share=0.2, reach_voice_share_5y=0.4,
                   reach_text_share_5y=0.2, speaker_growth_5y=1.0)
        opps = [{"type": "share", "technology": "tts", "gap": 1.0}, {"type": "share", "technology": "mt", "gap": 1.0}]
        ranked = {o["technology"]: o for o in rank({"speakers": 1e7}, opps, self.base, fs)}
        self.assertGreater(ranked["tts"]["priority_now"], ranked["mt"]["priority_now"])

    def test_growing_user_base_ranks_higher_in_five_years(self):
        opp = lambda: [{"type": "share", "technology": "tts", "gap": 1.0}]
        flat = facts(reach_voice_share=0.4, reach_text_share=0.4, reach_voice_share_5y=0.4,
                     reach_text_share_5y=0.4, speaker_growth_5y=1.0)
        rising = facts(reach_voice_share=0.4, reach_text_share=0.4, reach_voice_share_5y=0.8,
                       reach_text_share_5y=0.8, speaker_growth_5y=1.0)
        a = rank({"speakers": 1e7}, opp(), self.base, flat)[0]
        b = rank({"speakers": 1e7}, opp(), self.base, rising)[0]
        self.assertEqual(a["priority_now"], b["priority_now"])
        self.assertGreater(b["priority_5y"], a["priority_5y"])
        self.assertEqual(b["momentum"], 1.5)


if __name__ == "__main__":
    unittest.main()
