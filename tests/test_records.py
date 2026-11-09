import tempfile
import unittest
from pathlib import Path

from ltdi.records import Record, read_lists, read_records, write_lists, write_records

LANGS = ["en", "hi", "sw"]


def rec(lang, ind, value, unit="bool", note=""):
    return Record(lang, ind, value, unit, "Src", "https://example.org", "2026-11-08", "manual", note)


class RecordFileTests(unittest.TestCase):
    def roundtrip(self, records, write, read):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "x.csv"
            write(p, records)
            return {(r.language, r.indicator): r for r in read(p, LANGS)}

    def test_zero_rows_fold_and_expand(self):
        recs = [rec("en", "a", 1), rec("hi", "a", 0), rec("sw", "a", 0, note="Beta only")]
        back = self.roundtrip(recs, write_records, read_records)
        self.assertEqual(back, {(r.language, r.indicator): r for r in recs})

    def test_common_zero_note_folds(self):
        recs = [rec("en", "a", 3), rec("hi", "a", 0, note="Not listed"), rec("sw", "a", 0, note="Not listed")]
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "x.csv"
            self.assertEqual(write_records(p, recs), 2)  # en, and one "*" row for the two zeros
            back = {(r.language, r.indicator): r for r in read_records(p, LANGS)}
        self.assertEqual(back, {(r.language, r.indicator): r for r in recs})

    def test_vendor_lists_round_trip(self):
        recs = [rec("en", "f", 4, "features of 4", "All"), rec("hi", "f", 2, "features of 4", "All"),
                rec("sw", "f", 0, "features of 4", "None"), rec("en", "b", 1), rec("hi", "b", 0), rec("sw", "b", 1)]
        back = self.roundtrip(recs, write_lists, read_lists)
        self.assertEqual(back, {(r.language, r.indicator): r for r in recs})


if __name__ == "__main__":
    unittest.main()
