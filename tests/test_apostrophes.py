import unittest

from ltdi.backbone import fix_apostrophes


class ApostropheTests(unittest.TestCase):
    def test_lowercases_after_apostrophe(self):
        self.assertEqual(fix_apostrophes("Q'Anjob'Al"), "Q'anjob'al")
        self.assertEqual(fix_apostrophes("Brooke'S Point Palawano"), "Brooke's Point Palawano")
        self.assertEqual(fix_apostrophes("Hawai'I Creole English"), "Hawai'i Creole English")

    def test_leaves_correct_names(self):
        self.assertEqual(fix_apostrophes("N'Ko"), "N'Ko")
        self.assertEqual(fix_apostrophes("'Are'are"), "'Are'are")
        self.assertEqual(fix_apostrophes("Tohono O'odham"), "Tohono O'odham")


if __name__ == "__main__":
    unittest.main()
