"""Corpus Crawler's word lists and PanLex's dictionary entries, read without the network."""

import io
import unittest
from unittest import mock

from ltdi.collectors import corpuscrawler, panlex

README = """| IETF BCP47 Code     | Language                     |  Tokens¹  |
| :------------------ | :--------------------------- | --------: |
| `ace`               | Aceh/Acehnese                |    817K  [💾](http://www.gstatic.com/i18n/corpora/wordcounts/ace.txt) |
| `yo`                | Yoruba                       |    1.2M  [💾](http://www.gstatic.com/i18n/corpora/wordcounts/yo.txt) |
"""

TSV = "id\tlangvar\ttxt\ttxt_degr\tmeaning\tlangvar_uid\n1\t9\tilé\tile\t100\tyor-000\n2\t9\tilé\tile\t101\tyor-000\n3\t9\tomi\tomi\t102\tyor-000\n"


class CorpusCrawlerTests(unittest.TestCase):
    def test_table(self):
        with mock.patch.object(corpuscrawler, "fetch_text", return_value=README):
            self.assertEqual(corpuscrawler.table(), [("ace", "Aceh/Acehnese", 817000.0), ("yo", "Yoruba", 1200000.0)])


class PanLexTests(unittest.TestCase):
    def test_counts_distinct_expressions(self):
        with mock.patch.object(panlex, "_open", return_value=io.BytesIO(TSV.encode())):
            self.assertEqual(panlex.count("yor.tsv"), ("yor", 2, 3, ["yor-000"]))


class TemplatingTests(unittest.TestCase):
    def test_a_code_before_a_file_extension_is_shared(self):
        import re
        from pathlib import Path
        src = Path(__file__).parents[1].joinpath("ltdi", "build_site.py").read_text(encoding="utf-8")
        pattern = re.search(r're\.sub\(rf"(.*?)", "\{lang\}"', src).group(1).replace("{re.escape(code)}", "ace")
        self.assertEqual(re.sub(pattern, "{lang}", "https://www.gstatic.com/i18n/corpora/wordcounts/ace.txt"),
                         "https://www.gstatic.com/i18n/corpora/wordcounts/{lang}.txt")


if __name__ == "__main__":
    unittest.main()
