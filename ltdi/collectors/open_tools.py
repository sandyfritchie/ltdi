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

# Every source is pinned to the commit read (update a pin deliberately, and re-run the collector)
FIREFOX = "https://raw.githubusercontent.com/mozilla-firefox/firefox/6beeccd5eef3aa453b1a9bd267f6410b0f38121e/browser/locales/all-locales"
TESSERACT, TESSERACT_COMMIT = "https://github.com/tesseract-ocr/tessdata_best", "e12c65a915945e4c28e237a9b52bc4a8f39a0cec"
DICTIONARIES, DICTIONARIES_COMMIT = "https://github.com/LibreOffice/dictionaries", "c0865a85eb67dc377f2cf8e8fe2c4fa9e53f0dcb"
LANGUAGETOOL, LANGUAGETOOL_COMMIT = "https://github.com/languagetool-org/languagetool", "108f3543d4e413413700e1c9259a81460a7f05a5"
GLOTLID = "https://raw.githubusercontent.com/cisnlp/GlotLID/8e1992af81842155d2a48d9087b223bca66b1f13/languages-v3.md"
CLD3 = "https://raw.githubusercontent.com/google/cld3/b48dc46512566f5a2d41118c8c1116c4f96dc661/README.md"
KEYMAN, KEYMAN_COMMIT = "https://github.com/keymanapp/keyboards", "87aca49ac813fd7ff68a2c9ef030440e99b49af8"

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
    tess = [n.removesuffix(".traineddata") for n in git_tree(TESSERACT, TESSERACT_COMMIT) if n.endswith(".traineddata")]
    tess = [n for n in tess if n not in ("osd", "equ")]  # orientation and equation models, not languages
    dicts = [n for n in git_tree(DICTIONARIES, DICTIONARIES_COMMIT, dirs=True) if not n.startswith(".") and n != "util"]
    lt = [n for n in git_tree(LANGUAGETOOL, LANGUAGETOOL_COMMIT, "languagetool-language-modules", dirs=True) if n != "all"]
    glot = re.findall(r"^\|\s*\d+\s*\|\s*([a-z]{3}_[A-Z][a-z]{3})\s*\|", fetch_text(GLOTLID), flags=re.M)
    cld3 = re.findall(r"^\|?\s*([a-z]{2,3}(?:-Latn)?)\s*\|", fetch_text(CLD3), flags=re.M)
    keyman: dict[str, int] = {}
    for text in git_files(KEYMAN, "/release/**/*.kps", KEYMAN_COMMIT).values():
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
