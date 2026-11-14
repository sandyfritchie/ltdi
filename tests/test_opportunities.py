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
            web_text_words=1e12, wikipedia_active_editors=100000,
            ui_ios=1, ui_windows=1, ui_office=1, ocr_google=1, ocr_azure=1, ocr_apple=1, proof_office=1,
            va_google_assistant=1, va_siri=1, lid_glotlid=1, lid_cld3=1, kb_swiftkey=1, asr_amazon=1,
            tts_azure=1, tts_amazon=1, va_alexa=1, llm_app_gemini=1, llm_app_copilot=1,
            tts_openai=1, llm_app_chatgpt=1)


class FindTests(unittest.TestCase):
    def test_fully_supported_language_has_no_opportunities(self):
        self.assertEqual(find(facts(**FULL)), [])

    def test_keyboard_on_one_platform_is_share(self):
        fs = facts(**{**FULL, "kb_apple": 0})
        self.assertIn("A keyboard layout exists but isn't on every major platform", titles(fs, "share"))

    def test_tts_gap_is_share_with_data_and_collect_without(self):
        none = {"tts_google": 0, "tts_azure": 0, "tts_amazon": 0, "tts_openai": 0}
        self.assertTrue(any("text-to-speech" in t for t in titles(facts(**{**FULL, **none}), "share")))
        self.assertIn("Text-to-speech is offered by 3 of 4 major services", titles(facts(**{**FULL, "tts_amazon": 0}), "share"))
        thin = facts(**{**FULL, **none, "cv_validated_hours": 3})
        self.assertIn("Record a single-speaker voice for text-to-speech", titles(thin, "collect"))

    def test_speech_collect_counts_every_open_dataset(self):
        thin = facts(**{**FULL, "cv_validated_hours": 5})
        self.assertTrue(any(t.startswith("Only 5") for t in titles(thin, "collect")))
        rich = facts(**{**FULL, "cv_validated_hours": 5, "open_speech_hours": 1600, "speech_shrutilipi": 1595})
        self.assertFalse(any("open transcribed speech" in t for t in titles(rich, "collect")))

    def test_open_ocr_without_a_service_is_share(self):
        fs = facts(**{**FULL, "ocr_google": 0, "ocr_azure": 0, "ocr_apple": 0, "ocr_open_tesseract": 1})
        self.assertIn("An open text recognition model exists, but no major service", titles(fs, "share"))
        fs = facts(**{**FULL, "ocr_google": 0, "ocr_azure": 0, "ocr_apple": 0, "ocr_open_tesseract": 0})
        self.assertIn("No text recognition found, open or commercial, in the services tracked", titles(fs, "collect"))

    def test_proofing_shares_open_dictionary_or_builds_from_text(self):
        fs = facts(**{**FULL, "proof_office": 0, "proof_hunspell": 1})
        self.assertIn("An open spell-checker exists that more word processors could adopt", titles(fs, "share"))
        fs = facts(**{**FULL, "proof_office": 0, "proof_hunspell": 0, "web_text_words": 5e7})
        self.assertIn("A spell-checker could be built from open text", titles(fs))

    def test_assistant_follows_speech_and_voice(self):
        no_va = {"va_google_assistant": 0, "va_siri": 0, "va_alexa": 0}
        fs = facts(**{**FULL, **no_va})
        self.assertIn("The building blocks for a voice assistant exist", titles(fs, "share"))
        self.assertEqual(titles(facts(**{**FULL, **no_va, "tts_google": 0, "tts_azure": 0, "tts_amazon": 0, "tts_openai": 0}), "share")
                         .count("The building blocks for a voice assistant exist"), 0)

    def test_open_keyboard_without_a_platform_is_share(self):
        fs = facts(**{**FULL, "kb_gboard": 0, "kb_apple": 0, "kb_swiftkey": 0, "kb_open_keyman": 1})
        self.assertIn("Open keyboard layouts exist, but no major phone keyboard", titles(fs, "share"))

    def test_benchmarked_language_missing_from_apps_is_share(self):
        fs = facts(**{**FULL, "llm_app_copilot": 0})
        self.assertIn("2 of 3 major AI assistant apps list this language", titles(fs, "share"))

    def test_interface_from_volunteer_translation(self):
        fs = facts(**{**FULL, "ui_ios": 0, "ui_windows": 0, "ui_office": 0, "ui_firefox": 1})
        self.assertIn("Volunteers translate an open browser, but no major platform", titles(fs, "share"))

    def test_unmeasured_llm_is_measure(self):
        fs = facts(**{k: v for k, v in FULL.items() if k != "llm_global_mmlu_rel"})
        self.assertIn("Not in the LLM benchmark results tracked here", titles(fs, "measure"))

    def test_wording_never_names_companies(self):
        sparse = facts(kb_gboard=1, kb_apple=1, kb_apple_features=0, asr_google=1, cv_validated_hours=30,
                       web_text_words=1e7, cldr_coverage=1, asr_whisper_fleurs_wer=100, mt_google=1,
                       mt_open_nllb=1, wikipedia_active_editors=5, ui_ios=0, ui_windows=1, ui_office=0,
                       ocr_google=1, ocr_azure=0, ocr_apple=0, proof_office=0, proof_hunspell=1,
                       va_google_assistant=1, va_siri=0, lid_glotlid=0, lid_cld3=0, kb_swiftkey=0,
                       kb_open_keyman=1, tts_azure=1, tts_amazon=0, tts_open_mms=1, llm_app_gemini=1,
                       llm_app_copilot=0, llm_global_mmlu_rel=80)
        text = " ".join(o["title"] + " " + o["detail"] for o in find(sparse))
        for name in ("Apple", "Google", "Microsoft", "Azure", "DeepL", "OpenAI", "Anthropic", "Meta", "Gboard",
                     "Siri", "Windows", "Firefox", "Mozilla", "Tesseract", "Hunspell", "LanguageTool", "Office",
                     "Amazon", "Alexa", "Polly", "SwiftKey", "Keyman", "Gemini", "Copilot", "MMS", "Whisper"):
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


class GateTests(unittest.TestCase):
    """Each rule fires only where its prerequisites exist (Fable's review, B4)."""

    def keys(self, **kw):
        return {o["key"] for o in find(facts(**kw))}

    def test_nothing_recorded_gets_one_documentation_card(self):
        fs = facts(web_text_words=0, wikipedia_articles=0, wikipedia_active_editors=0, cv_validated_hours=0,
                   asr_google=0, asr_whisper_fleurs_wer=100, cldr_coverage=0, ui_ios=0, ocr_google=0, belebele=0)
        self.assertEqual([o["key"] for o in find(fs)], ["document"])

    def test_wikipedia_card_needs_an_edition(self):
        self.assertNotIn("wiki-community", self.keys(web_text_words=1e5, wikipedia_articles=0, wikipedia_active_editors=0))
        self.assertIn("wiki-community", self.keys(web_text_words=1e5, wikipedia_articles=900, wikipedia_active_editors=3))

    def test_text_technologies_and_benchmarks_need_some_text(self):
        speech_only = dict(open_speech_hours=4, web_text_words=0, wikipedia_articles=0, cldr_coverage=0, ui_ios=0,
                           ocr_google=0, tts_google=0, belebele=0)
        got = self.keys(**speech_only)
        for k in ("llm-measure", "llm-reading", "cldr", "ui-none", "ocr-collect", "tts-collect"):
            self.assertNotIn(k, got)
        self.assertIn("asr-collect", got)  # speech is still worth collecting
        with_text = self.keys(**{**speech_only, "web_text_words": 2e5})
        for k in ("llm-measure", "llm-reading", "cldr", "ui-none", "ocr-collect", "tts-collect"):
            self.assertIn(k, with_text)

    def test_speech_measurement_needs_a_model_or_speech(self):
        self.assertNotIn("asr-measure", self.keys(web_text_words=1e5, asr_whisper_fleurs_wer=100, cv_validated_hours=0))
        self.assertIn("asr-measure", self.keys(web_text_words=1e5, asr_whisper_fleurs_wer=100, asr_open_omnilingual=1))
        self.assertNotIn("asr-improve", self.keys(web_text_words=1e5, asr_whisper_fleurs_wer=100))

    def test_benchmark_count_follows_the_config(self):
        from ltdi.opportunities import LLM
        o = next(o for o in find(facts(web_text_words=1e5)) if o["key"] == "llm-measure")
        self.assertIn(f"None of the {len(LLM)} ", o["detail"])


class TopListTests(unittest.TestCase):
    def test_at_most_two_per_language(self):
        from ltdi.build_site import PER_LANGUAGE, top_listed
        top = [{"lang": l, "key": f"k{i}", "_type": t} for i, (l, t) in
               enumerate([("a", "share"), ("a", "collect"), ("a", "measure"), ("b", "share"), ("a", "share")])]
        got = top_listed(top)
        self.assertLessEqual(max(sum(1 for o in got if o["lang"] == l) for l in "ab"), PER_LANGUAGE)
        self.assertEqual([o["key"] for o in got], ["k0", "k1", "k3"])


class WordingTests(unittest.TestCase):
    def test_no_title_asserts_that_something_does_not_exist(self):
        """Titles say what wasn't found in the sources tracked, not that it doesn't exist (re-review R3)."""
        import re
        sparse = facts(web_text_words=5e4, wikipedia_articles=10, wikipedia_active_editors=2, open_speech_hours=1,
                       asr_whisper_fleurs_wer=100, asr_open_omnilingual=1, cldr_coverage=0, ui_ios=0, ui_windows=0,
                       ui_office=0, ocr_google=0, ocr_azure=0, ocr_apple=0, tts_google=0, belebele=0, lid_glotlid=0,
                       lid_cld3=0, llm_app_gemini=0, llm_app_copilot=0, llm_app_chatgpt=0, proof_office=0)
        for o in find(sparse):
            t = o["title"]
            if re.match(r"(No|Not|None)\b", t) or "don't" in t or "doesn't" in t:
                self.assertRegex(t, r"found|tracked|in Unicode CLDR", t)
