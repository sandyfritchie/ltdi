"""The per-language pages: their title, description and address (ltdi/pages.py)."""

import unittest

from ltdi.pages import _meta, describe

CFG = {"tiers": {"cutoffs": [["vh", "Very high", 0.9]], "stages": [["lc", "Commercial", ""]]},
       "dimensions": {"tech": {"technologies": {"llm": {"label": "LLMs"}, "assistant": {"label": "Voice assistant"},
                                                "mt": {"label": "Machine translation"}}}},
       "meta": {"edition": "2026-11"}}
LANG = {"code": "yo", "name": "Yoruba", "autonym": "Èdè Yorùbá", "speakers": 28_000_000, "ltdi": 0.5861, "rank": 75,
        "tier": "lc", "dimensions": {"data": {"score": 0.61}, "tech": {"score": 0.56}},
        "gaps": {"llm": "open", "assistant": "none"}, "levels": {"mt": "full", "llm": "open"},
        "countries": [{"name": "Nigeria"}, {"name": "United States", "census_only": True}]}
HOME = ('<title>LTDI</title><meta name="description" content="x"><meta property="og:title" content="x">'
        '<meta property="og:description" content="x"><meta property="og:url" content="https://langtechindex.org/">'
        '<link rel="canonical" href="https://langtechindex.org/"><main id="view"><noscript>top 20</noscript></main>')


class PageTests(unittest.TestCase):
    def test_description(self):
        title, desc, static = describe(LANG, CFG, 6817)
        self.assertEqual(title, "Yoruba: language technology support · LTDI")
        self.assertIn("Yoruba (28 million speakers): LTDI 0.586, ranked 75 of 6,817, Commercial tier.", desc)
        self.assertIn("No commercial service yet for LLMs or voice assistant.", desc)
        self.assertIn("Spoken in Nigeria.", static)  # census-only countries left out
        self.assertNotIn("United States", static)
        self.assertIn('<span lang="yo">Èdè Yorùbá</span>', static)

    def test_head_rewritten(self):
        page = _meta(HOME, "Yoruba & co", 'Says "hi"', "https://langtechindex.org/language/yo", "<p>static</p>")
        self.assertIn('<link rel="canonical" href="https://langtechindex.org/language/yo">', page)
        self.assertIn('<meta property="og:url" content="https://langtechindex.org/language/yo">', page)
        self.assertIn("<title>Yoruba &amp; co</title>", page)
        self.assertIn('content="Says &quot;hi&quot;"', page)
        self.assertIn('<main id="view"><p>static</p></main>', page)
        self.assertNotIn("top 20", page)


if __name__ == "__main__":
    unittest.main()
