import unittest

from ltdi.collectors.opus import counts_as
from ltdi.collectors.opus_lid import short


class TestCountsAs(unittest.TestCase):
    def test_same_language(self):
        self.assertTrue(counts_as("ig", "ibo_Latn"))

    def test_member_and_macrolanguage(self):
        self.assertTrue(counts_as("ps", "pbt_Arab"))   # Southern Pashto for Pashto
        self.assertTrue(counts_as("prs", "fas_Arab"))  # Persian for Dari
        self.assertTrue(counts_as("ff", "fuv_Latn"))   # a Fulah variety for Fulah

    def test_not_siblings_or_other_languages(self):
        self.assertFalse(counts_as("min", "ind_Latn"))  # both Malay-group members, not the same
        self.assertFalse(counts_as("ms", "ind_Latn"))   # Indonesian is a standard of its own
        self.assertFalse(counts_as("kr", "arb_Arab"))

    def test_close_languages(self):
        self.assertTrue(counts_as("bs", "hrv_Latn"))
        self.assertTrue(counts_as("sr", "bos_Latn"))


class TestShort(unittest.TestCase):
    def test_short(self):
        self.assertTrue(short("Mmanụ Rod"))
        self.assertFalse(short("Kukuthandiza zozitetezera"))
        self.assertFalse(short("这是一个很好的句子我们去吧吧吧"))


if __name__ == "__main__":
    unittest.main()
