"""F10 and F11: family paths for macrolanguages, and the engineering flags' rules."""

import unittest

from ltdi.engineering import flags
from ltdi.families import _common


class FamilyTests(unittest.TestCase):
    def test_common_path_of_members(self):
        self.assertEqual(_common([["afro", "semi", "arab", "egyp"], ["afro", "semi", "arab", "levn"]]),
                         ["afro", "semi", "arab"])
        self.assertEqual(_common([["a", "b"], ["c", "d"]]), [])


class FlagTests(unittest.TestCase):
    META = {"arab": {"rtl": "YES", "shapingReq": "YES", "lbLetters": "NO", "ime": "NO"},
            "thai": {"rtl": "NO", "shapingReq": "MIN", "lbLetters": "YES", "ime": "NO"},
            "latn": {"rtl": "NO", "shapingReq": "MIN", "lbLetters": "NO", "ime": "NO"}}

    def test_main_script_decides(self):
        self.assertEqual(flags({"code": "ur", "scripts": ["arab"]}, self.META, {}), ["rtl", "shaping"])
        self.assertEqual(flags({"code": "th", "scripts": ["thai"]}, self.META, {}), ["nospace"])
        self.assertEqual(flags({"code": "sd", "scripts": ["arab", "deva"]}, self.META, {}), ["rtl", "shaping", "scripts"])

    def test_lookalikes_and_none(self):
        self.assertEqual(flags({"code": "fat", "scripts": ["latn"]}, self.META, {"fat": [("ε", "ɛ")]}), ["lookalike"])
        self.assertEqual(flags({"code": "en", "scripts": ["latn"]}, self.META, {}), [])


if __name__ == "__main__":
    unittest.main()
