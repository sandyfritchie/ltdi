"""Language Technology Development Index."""

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config"
# LTDI_DATA points scoring at another copy of data/ (tools/edition_diff.py scores an earlier
# edition's records with the current method this way)
DATA = Path(os.environ["LTDI_DATA"]) if os.environ.get("LTDI_DATA") else ROOT / "data"
CACHE = ROOT / ".cache"
