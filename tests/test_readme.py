"""README's sources table names every service that's scored, so it can't drift from config/services.csv."""
import unittest

from ltdi import ROOT
from ltdi.config import load_config, services


class ReadmeTests(unittest.TestCase):
    def test_every_service_is_in_the_sources_table(self):
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        rows = [line for line in readme.splitlines() if line.startswith("| Tech |")]
        techs = load_config()["dimensions"]["tech"]["technologies"]
        missing = []
        for s in services():
            label = "Regional providers" if s["role"] == "regional" else techs[s["technology"]]["label"]
            row = next((r for r in rows if r.split("|")[2].strip().startswith(label)), "")
            names = [s["name"], s["provider"].capitalize()] if s["role"] == "measured" else [s["name"]]
            if not any(n.lower() in row.lower() for n in names):
                missing.append(f"{s['id']} ({s['name']}) not in README row {label!r}")
        self.assertEqual(missing, [])


if __name__ == "__main__":
    unittest.main()
