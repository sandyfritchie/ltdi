"""Open-source language tools, read from their public language lists.

  ui_firefox          Firefox: shipped interface translations (browser/locales/all-locales)
  ocr_open_tesseract  Tesseract OCR: trained models in tessdata_best
  proof_hunspell      Spell-check dictionaries shipped with LibreOffice (Hunspell format)
  proof_languagetool  LanguageTool: grammar and style checker language modules
  lid_glotlid         GlotLID v3: open language identification model (labels with test scores)
  lid_cld3            CLD3: compact open language identification model
  kb_open_keyman      Keyman: open keyboard layouts (language tags in each package's .kps file)

Run:  python -m ltdi.collectors open_tools   (reads four repos with git; needs git)
"""

from __future__ import annotations

import re

from ..http import fetch_text
from ..records import Record
from . import present
from ._common import git_files, git_tree, presence

FIREFOX = "https://raw.githubusercontent.com/mozilla-firefox/firefox/main/browser/locales/all-locales"
TESSERACT = "https://github.com/tesseract-ocr/tessdata_best"
DICTIONARIES = "https://github.com/LibreOffice/dictionaries"
LANGUAGETOOL = "https://github.com/languagetool-org/languagetool"
GLOTLID = "https://raw.githubusercontent.com/cisnlp/GlotLID/main/languages-v3.md"
CLD3 = "https://raw.githubusercontent.com/google/cld3/master/README.md"
KEYMAN = "https://github.com/keymanapp/keyboards"

SOURCES = {
    "ui_firefox": ("Firefox interface translations", FIREFOX),
    "ocr_open_tesseract": ("Tesseract OCR (tessdata_best)", TESSERACT),
    "proof_hunspell": ("LibreOffice spelling dictionaries (Hunspell)", DICTIONARIES),
    "proof_languagetool": ("LanguageTool language modules", LANGUAGETOOL),
    "lid_glotlid": ("GlotLID v3", GLOTLID),
    "lid_cld3": ("CLD3", CLD3),
    "kb_open_keyman": ("Keyman keyboards", KEYMAN),
}


KEYBOARDS: dict[str, int] = {}  # Keyman packages per language, filled by lists()


def lists() -> dict[str, set[str]]:
    firefox = fetch_text(FIREFOX).split()
    tess = [n.removesuffix(".traineddata") for n in git_tree(TESSERACT) if n.endswith(".traineddata")]
    tess = [n for n in tess if n not in ("osd", "equ")]  # orientation and equation models, not languages
    dicts = [n for n in git_tree(DICTIONARIES, dirs=True) if not n.startswith(".") and n != "util"]
    lt = [n for n in git_tree(LANGUAGETOOL, "languagetool-language-modules", dirs=True) if n != "all"]
    glot = re.findall(r"^\|\s*\d+\s*\|\s*([a-z]{3}_[A-Z][a-z]{3})\s*\|", fetch_text(GLOTLID), flags=re.M)
    cld3 = re.findall(r"^\|?\s*([a-z]{2,3}(?:-Latn)?)\s*\|", fetch_text(CLD3), flags=re.M)
    keyman: dict[str, int] = {}
    for text in git_files(KEYMAN, "/release/**/*.kps").values():
        for code in present(set(re.findall(r'<Language ID="([^"]+)"', text))):
            keyman[code] = keyman.get(code, 0) + 1
    KEYBOARDS.clear()
    KEYBOARDS.update(keyman)
    return {"kb_open_keyman": set(keyman), "ui_firefox": present(firefox), "ocr_open_tesseract": present(tess), "proof_hunspell": present(dicts),
            "proof_languagetool": present(lt), "lid_glotlid": present(glot), "lid_cld3": present(cld3)}


def collect() -> list[Record]:
    have = lists()
    notes = {"kb_open_keyman": {c: f"{n} keyboard packages" for c, n in KEYBOARDS.items()}}
    return [r for ind in SOURCES for r in presence(ind, have[ind], *SOURCES[ind], notes=notes.get(ind))]
