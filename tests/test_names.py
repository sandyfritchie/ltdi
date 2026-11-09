import unittest

from ltdi.crosswalk import to_ltdi
from ltdi.names import resolve


class NameTests(unittest.TestCase):
    def test_vendor_names(self):
        cases = {"Swahili (Kenya)": "sw", "Chinese (Traditional)": "cmn", "Cantonese (Traditional) \u2014 Cangjie": "yue",
                 "Albanian, Gheg": "aln", "Kurdish (Sorani)": "ckb", "Norwegian Bokm\u00e5l": "nb", "Emoji": ""}
        for name, code in cases.items():
            self.assertEqual(resolve(name), code, name)
        self.assertIsNone(resolve("Not a language at all"))

    def test_codes(self):
        cases = {"zh-HK": "yue", "pa-PK": "pnb", "iw": "he", "swh": "sw", "quz": "qu", "fil": "fil", "tl": "fil", "tgl": "fil", "pa-Arab": "pnb", "sr-Latn": "sr"}
        for label, code in cases.items():
            self.assertEqual(to_ltdi(label), code, label)


if __name__ == "__main__":
    unittest.main()
