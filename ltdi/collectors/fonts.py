"""Font support: can the language's letters be displayed with Google's open Noto fonts?

  font_noto   1 if one Noto font has every character the language needs (and, where checked, attaches
              its combining marks), else 0; the note names the font, or the characters missing

Noto (notofonts.github.io, pinned below) is the default font family on Android and ChromeOS and is
widely used elsewhere, so it is a fair test of whether a language can be displayed at all.

The characters a language needs come from, in order:
  1. Hyperglot (Rosetta Type's orthography database, about 800 languages): the base characters and
     marks of each primary orthography, checked with Hyperglot's own font checker, which also shapes
     the marks and joining forms with HarfBuzz.
  2. Unicode CLDR's main exemplar characters (cldr-json, pinned), for languages Hyperglot lacks:
     every exemplar character and its capital, each either encoded in the font or composed from
     characters that are (a character map check; marks aren't shaped).
  3. The letters its FineWeb-2 web text uses (data/fineweb_chars.csv, sampled by fineweb_chars.py),
     those of its main script and combining marks: a character map check, as for CLDR. Letters
     from other scripts that look like the language's own (a Greek ε for the Latin ɛ, say) are
     noted, since they break search and spelling tools.
  4. Otherwise only the script is checked: whether a Noto font covers the language's main script.
A language passes if every primary orthography passes with some single font.

Run:  python -m ltdi.collectors fonts   (needs github.com; installs nothing, but needs hyperglot:
      pip install hyperglot; takes about 15 minutes)
"""

from __future__ import annotations

import csv
import json
import logging
import re
import subprocess
import unicodedata
import urllib.request
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from .. import CACHE, DATA
from ..crosswalk import to_ltdi
from ..http import USER_AGENT
from ..records import Record
from ._common import ltdi_codes

NOTO = "notofonts/notofonts.github.io"
NOTO_COMMIT = "3460ae9d93e7ac7a90d38a247d5d4d0f6147d239"
CJK = "notofonts/noto-cjk"
CJK_COMMIT = "f8d157532fbfaeda587e826d4cd5b21a49186f7c"
CJK_FILES = [f"Sans/OTF/{d}/NotoSansCJK{s}-Regular.otf" for d, s in
             [("SimplifiedChinese", "sc"), ("TraditionalChinese", "tc"), ("TraditionalChineseHK", "hk"),
              ("Japanese", "jp"), ("Korean", "kr")]]
CLDR = "unicode-org/cldr-json"
CLDR_COMMIT = "7d2b9cb11cec08f4d333ad73209deb3df0711c3b"
CLDR_GLOB = "/cldr-json/cldr-misc-full/main/*/characters.json"
RAW = "https://raw.githubusercontent.com/{repo}/{commit}/{path}"
PAGE = f"https://github.com/{NOTO}/tree/{NOTO_COMMIT}/fonts"
HYPERGLOT = "https://github.com/rosettatype/hyperglot"
MISSING_SHOWN = 12
# LTDI script codes that Unicode reports under another script
SCRIPT_ALIAS = {"hans": "hani", "hant": "hani", "jpan": "hani", "kore": "hang"}


def _clone(repo: str, commit: str, name: str, sparse: str | None = None) -> Path:
    """A blobless clone of one pinned commit (git's automatic housekeeping off: it stalls lazy fetches)."""
    path = CACHE / name
    if not path.exists():
        path.mkdir(parents=True)
        git = ["git", "-c", "gc.auto=0", "-c", "maintenance.auto=false", "-C", str(path)]
        subprocess.run([*git, "init", "-q"], check=True)
        subprocess.run([*git, "config", "gc.auto", "0"], check=True)
        subprocess.run([*git, "fetch", "-q", "--depth", "1", "--filter=blob:none",
                        f"https://github.com/{repo}", commit], check=True)
        if sparse:
            subprocess.run([*git, "sparse-checkout", "set", "--no-cone", sparse], check=True)
            subprocess.run([*git, "checkout", "-q", "FETCH_HEAD"], check=True)
    return path


def _download(repo: str, commit: str, paths: list[str], folder: Path) -> list[Path]:
    folder.mkdir(parents=True, exist_ok=True)

    def get(p: str) -> Path:
        out = folder / Path(p).name
        if not out.exists():
            req = urllib.request.Request(RAW.format(repo=repo, commit=commit, path=p),
                                         headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=300) as r:
                out.write_bytes(r.read())
        return out

    with ThreadPoolExecutor(12) as pool:
        return list(pool.map(get, paths))


def fonts() -> list[Path]:
    """Every Noto Regular font (one per script family, Sans and Serif), plus Noto Sans CJK."""
    tree = subprocess.run(["git", "-c", "gc.auto=0", "-C", str(_clone(NOTO, NOTO_COMMIT, "noto-fonts")),
                           "ls-tree", "-r", "--name-only", NOTO_COMMIT, "fonts"],
                          check=True, capture_output=True, text=True).stdout.split()
    regular = [p for p in tree if re.search(r"/unhinted/ttf/[^/]+-Regular\.ttf$", p)]
    folder = CACHE / f"noto-{NOTO_COMMIT[:12]}"
    return (_download(NOTO, NOTO_COMMIT, regular, folder)
            + _download(CJK, CJK_COMMIT, CJK_FILES, folder))


def cmap(path: Path) -> set[int]:
    from fontTools.ttLib import TTFont
    return set(TTFont(str(path), lazy=True)["cmap"].getBestCmap())


def covered(chars: set[str], font: set[int]) -> set[str]:
    """The characters (each a string of one or more code points) a font can display: encoded, or
    composed from code points it encodes."""
    return {c for c in chars if all(ord(x) in font for x in c)
            or all(ord(x) in font for x in unicodedata.normalize("NFD", c))}


def best(chars: set[str], cmaps: dict[str, set[int]]) -> tuple[str, set[str]]:
    """(the font displaying most of the characters, the characters it can't)"""
    name = max(cmaps, key=lambda f: (len(covered(chars, cmaps[f])), -len(f)))
    return name, chars - covered(chars, cmaps[name])


def unicode_set(s: str) -> set[str]:
    """Characters of a CLDR exemplar set such as "[a-c {ch} \\u0301 ʼ]"."""
    s = s.strip()[1:-1]
    s = re.sub(r"\\u([0-9a-fA-F]{4})", lambda m: chr(int(m.group(1), 16)), s)
    s = re.sub(r"\\U([0-9a-fA-F]{8})", lambda m: chr(int(m.group(1), 16)), s)
    out, i = set(), 0
    while i < len(s):
        c = s[i]
        if c == "{":
            j = s.index("}", i)
            out.add(s[i + 1:j].replace("\\", ""))
            i = j + 1
        elif c == "\\" and i + 1 < len(s):
            out.add(s[i + 1])
            i += 2
        elif c.isspace():
            i += 1
        elif i + 2 < len(s) and s[i + 1] == "-" and not s[i + 2].isspace():
            out.update(chr(x) for x in range(ord(c), ord(s[i + 2]) + 1))
            i += 3
        else:
            out.add(c)
            i += 1
    return {c for c in out if c.strip()}


def cldr_exemplars() -> dict[str, set[str]]:
    """{LTDI code: main exemplar characters and their capitals} from each language's base CLDR locale
    (or a script locale in the language's main script)."""
    root = _clone(CLDR, CLDR_COMMIT, "cldr-json-characters", CLDR_GLOB) / "cldr-json/cldr-misc-full/main"
    scripts = {l["code"]: l["scripts"] for l in json.loads((DATA / "languages.json").read_text(encoding="utf-8"))}
    out: dict[str, set[str]] = {}
    for f in sorted(root.glob("*/characters.json")):
        loc = f.parent.name
        parts = loc.split("-")
        if len(parts) > 2 or (len(parts) == 2 and len(parts[1]) != 4):
            continue  # regional locales repeat their language's set
        code = to_ltdi(parts[0])
        main = (scripts.get(code) or [""])[0]
        if not code or (len(parts) == 2 and parts[1].lower() != main) or (len(parts) == 1 and code in out):
            continue
        chars = unicode_set(json.loads(f.read_text(encoding="utf-8"))["main"][loc]["characters"]["exemplarCharacters"])
        out[code] = chars | {c.upper() for c in chars if len(c.upper()) == 1}
    return out


def web_letters() -> dict[str, tuple[str, set[str], set[str]]]:
    """{LTDI code: (subset, letters of its main script and combining marks, letters of other scripts)}
    from the FineWeb-2 samples, using the language's largest subset in its main script."""
    from fontTools import unicodedata as fud
    path = DATA / "fineweb_chars.csv"
    if not path.exists():
        return {}
    scripts = {l["code"]: l["scripts"] for l in json.loads((DATA / "languages.json").read_text(encoding="utf-8"))}
    best_rows: dict[str, dict] = {}
    with path.open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            code, main = r["language"], (scripts.get(r["language"]) or [""])[0]
            if r["subset"].split("_")[-1].lower() != main and SCRIPT_ALIAS.get(main) != r["subset"].split("_")[-1].lower():
                continue
            if code not in best_rows or float(r["words"]) > float(best_rows[code]["words"]):
                best_rows[code] = r
    out = {}
    for code, r in best_rows.items():
        sc = r["subset"].split("_")[-1]
        own = {ch for ch in r["letters"] if fud.script(ch) in (sc, "Zinh", "Zyyy")}
        other = set(r["letters"]) - own
        out[code] = (r["subset"], own, other)
    return out


def hyperglot_support(paths: list[Path]) -> tuple[dict, dict[tuple[str, str], str]]:
    """(Hyperglot's languages, {(ISO 639-3, script): a Noto font supporting that orthography})"""
    from hyperglot.checker import FontChecker
    from hyperglot.languages import Languages
    logging.disable(logging.WARNING)
    ok: dict[tuple[str, str], str] = {}
    for i, p in enumerate(paths):
        res = FontChecker(str(p)).get_supported_languages(check=["base"], decomposed=True, marks=True, shaping=True)
        for script, langs in res.items():
            for iso in langs:
                ok.setdefault((iso, script), p.stem)
        if i % 25 == 0:
            print(f"  {i}/{len(paths)} fonts checked", flush=True)
    return Languages(), ok


def collect() -> list[Record]:
    from fontTools import unicodedata as fud
    from hyperglot.orthography import Orthography

    paths = fonts()
    print(f"{len(paths)} fonts", flush=True)
    cmaps = {p.stem: cmap(p) for p in paths}
    langs, ok = hyperglot_support(paths)
    exemplars = cldr_exemplars()
    info = {l["code"]: l for l in json.loads((DATA / "languages.json").read_text(encoding="utf-8"))}
    # Scripts each font covers well (at least 20 characters), for the script-only fallback
    by_script: dict[str, set[str]] = defaultdict(set)
    for name, cps in cmaps.items():
        n = Counter(fud.script(chr(c)) for c in cps)
        for sc, k in n.items():
            if k >= 20:
                by_script[sc.lower()].add(name)

    hg: dict[str, list[str]] = defaultdict(list)
    for iso in langs:
        code = to_ltdi(iso)
        if code:
            hg[code].append(iso)

    out = []
    src_h = f"Noto fonts, checked with Hyperglot ({HYPERGLOT})"
    src_c = "Noto fonts, checked against Unicode CLDR exemplar characters"
    src_w = "Noto fonts, checked against the letters in its FineWeb-2 web text"
    src_s = "Noto fonts, script only"
    web = web_letters()
    for code in ltdi_codes():
        isos = sorted(hg.get(code, []), key=lambda i: (i != info.get(code, {}).get("iso_639_3"), i))
        if isos:
            iso = isos[0]
            orths = [o for o in langs[iso].get("orthographies", []) if o.get("status", "primary") == "primary"]
            good, bad = [], []
            for o in orths:
                font = ok.get((iso, o["script"]))
                if font:
                    good.append(font)
                else:
                    chars = set(Orthography(o).get_chars("base"))
                    name, missing = best(chars, cmaps)
                    bad.append((o["script"], name, missing))
            if bad:
                notes = []
                for script, name, missing in bad:
                    if missing:
                        shown = " ".join(f"{c} (U+{'+'.join(f'{ord(x):04X}' for x in c)})"
                                         for c in sorted(missing)[:MISSING_SHOWN])
                        more = f" and {len(missing) - MISSING_SHOWN} more" if len(missing) > MISSING_SHOWN else ""
                        notes.append(f"{script}: no Noto font has {shown}{more} (closest: {name})")
                    else:
                        notes.append(f"{script}: {name} has the characters but doesn't attach all the marks "
                                     "or joining forms correctly")
                out.append(Record(code, "font_noto", 0, "bool", src_h, PAGE, note="; ".join(notes)))
            else:
                out.append(Record(code, "font_noto", 1, "bool", src_h, PAGE,
                                  note="Displayed with " + ", ".join(sorted(set(good)))))
        elif code in exemplars:
            name, missing = best(exemplars[code], cmaps)
            if missing:
                shown = " ".join(f"{c} (U+{'+'.join(f'{ord(x):04X}' for x in c)})" for c in sorted(missing)[:MISSING_SHOWN])
                out.append(Record(code, "font_noto", 0, "bool", src_c, PAGE,
                                  note=f"No Noto font has {shown} (closest: {name})"))
            else:
                out.append(Record(code, "font_noto", 1, "bool", src_c, PAGE, note=f"Displayed with {name}"))
        elif code in web:
            subset, letters, other = web[code]
            looks = f"; letters from other scripts in its text: {' '.join(sorted(other))}" if other else ""
            name, missing = best(letters, cmaps)
            if missing:
                shown = " ".join(f"{c} (U+{ord(c):04X})" for c in sorted(missing)[:MISSING_SHOWN])
                out.append(Record(code, "font_noto", 0, "bool", src_w, PAGE,
                                  note=f"No Noto font has {shown} (closest: {name}){looks}"))
            else:
                out.append(Record(code, "font_noto", 1, "bool", src_w, PAGE,
                                  note=f"The {len(letters)} letters and marks seen in its FineWeb-2 text "
                                       f"({subset}) display with {name}{looks}"))
        else:
            main = (info.get(code, {}).get("scripts") or [""])[0]
            fonts_for = sorted(by_script.get(SCRIPT_ALIAS.get(main, main), []))
            if main and fonts_for:
                out.append(Record(code, "font_noto", 1, "bool", src_s, PAGE,
                                  note=f"The script is covered ({fonts_for[0]}); the language's own characters "
                                       "aren't listed in Hyperglot or CLDR, so weren't checked"))
    return out
