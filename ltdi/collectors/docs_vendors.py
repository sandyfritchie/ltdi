"""More services sold worldwide, each read from its provider's documentation page:

  ABBYY        FineReader Engine's predefined recognition languages usable for OCR (programming languages
               and other formal languages in the same table don't resolve to a language and drop out)
  Mistral AI   Mistral OCR's languages, from the OCR table of the languages page whose language-model
               table llm_lists.py transcribes
  Cohere       Command A+'s 48 languages (its model card on Hugging Face, which the docs' changelog repeats)
               for LLMs, and Command A Translate's 23 for translation
  xAI          Grok speech to text (grok-voice-transcribe) and text to speech
  Samsung      Bixby's languages, from the footnote of Samsung's October 2026 announcement
  Android      the languages Android's system interface is translated into: the values-<language> resource
               folders of the Android Open Source Project's framework (Google publishes no list of Android's
               languages; this is the shipping source). A language counts where it has a folder of its own
               (values-sw), not only a regional one (values-rm-rCH); Chinese is in regional folders only

Like speech_vendors.py, these hosts aren't reachable from every machine; the monthly collectors refresh them.
"""

from __future__ import annotations

import html
import re

from ..http import fetch
from ..names import resolve
from ..records import Record
from ._common import ltdi_codes
from .vendors import UNRESOLVED, _read, code, named, save_entries

ABBYY = "https://docs.abbyy.com/fine-reader/engine/specifications/predefined-languages.md"
MISTRAL = "https://docs.mistral.ai/resources/languages"
COHERE_LLM = "https://huggingface.co/CohereLabs/command-a-plus-05-2026/raw/main/README.md"
COHERE_MT = "https://docs.cohere.com/docs/command-a-translate.md"
XAI_STT = "https://docs.x.ai/developers/model-capabilities/audio/speech-to-text.md"
XAI_TTS = "https://docs.x.ai/developers/model-capabilities/audio/text-to-speech.md"
BIXBY = "https://news.samsung.com/ca/samsung-expands-language-support-across-ai-experiences-on-galaxy"
ANDROID = "https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/core/res/res/?format=JSON"
ANDROID_PAGE = "https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/core/res/res/"

META = {  # indicator: (source, url, fewest languages a healthy read gives)
    "ocr_abbyy": ("ABBYY FineReader Engine recognition languages", ABBYY, 100),
    "ocr_mistral": ("Mistral OCR languages", MISTRAL, 30),
    "llm_app_cohere": ("Cohere Command A+ languages", COHERE_LLM, 40),
    "mt_cohere": ("Cohere Command A Translate languages", COHERE_MT, 20),
    "asr_xai": ("xAI Grok speech to text", XAI_STT, 30),
    "tts_xai": ("xAI Grok text to speech", XAI_TTS, 15),
    "va_bixby": ("Samsung Bixby languages", BIXBY, 10),
    "ui_android": ("Android system translations (AOSP framework resources)", ANDROID_PAGE, 60),
}


def text(url: str) -> str:
    return fetch(url).decode("utf-8", "replace")


def plain(page: str) -> str:
    """An HTML page as text, cells and blocks separated by '|'."""
    t = re.sub(r"<(script|style)\b.*?</\1>", "", page, flags=re.S)
    t = html.unescape(re.sub(r"<[^>]+>", "|", t))
    return re.sub(r"\|(\s*\|)+", "|", t)


def split(names: str) -> list[str]:
    return [n.strip(" .*") for n in re.split(r",|\band\b", names) if n.strip(" .*")]


# ABBYY's own names for languages whose usual names differ (or that it lists together)
ABBYY_NAMES = {"Chukcha": ["ckt"], "Kasub": ["csb"], "Sunda": ["su"], "Rhaeto-Romanic": ["rm"], "Jingpo": ["kac"],
               "Sioux (Dakota)": ["dak"], "Ido": ["io"], "Occidental": ["ie"], "Bugotu": ["bgt"],
               "NorwegianNynorsk and NorwegianBokmal": ["nn", "nb"], "Norwegian (Nynorsk)": ["nn"],
               "Maya": ["yua"], "Mongol": ["mn"], "Buryat": ["bxr"], "Armenian (Western)": ["hyw"],
               # names that could be any of several languages: left out rather than guessed
               "Zapotec": [], "Romany": []}


def abbyy() -> tuple[set[str], int]:
    out, n = set(), 0
    for row in text(ABBYY).split("\n"):
        cells = [c.strip() for c in row.strip().strip("|").split("|")]
        if len(cells) < 3 or cells[2] != "+":
            continue
        n += 1
        name = cells[1]
        _read.add(name)
        if name in ABBYY_NAMES:
            out.update(ABBYY_NAMES[name])
            continue
        # 'Armenian (Western)' and 'Azerbaijani (Latin)': the full name first, then without the brackets
        c = resolve(name) or resolve(re.sub(r"\s*\(.*\)$", "", name))
        if c:
            out.add(c)
        elif c is None:
            UNRESOLVED["ocr_abbyy"].add(name)
    return out, n


def mistral_ocr() -> tuple[set[str], int]:
    t = plain(text(MISTRAL))
    t = t[t.index("|OCR|"):]
    t = t[:t.index("|Performance")] if "|Performance" in t else t
    names = []
    for region, langs in re.findall(r"\|(European|Middle Eastern|South Asian|Southeast Asian|East Asian|Central Asian)\|([^|]+)", t):
        names += split(langs)
    return named(names, "ocr_mistral"), len(names)


def cohere() -> tuple[set[str], int, set[str], int]:
    m = re.search(r"trained on \d+ languages:\s*([^\n]+)", text(COHERE_LLM))
    llm = split(m.group(1)) if m else []
    t = text(COHERE_MT)
    mt = re.findall(r"^\*\s+(.+)$", t[t.index("Supported Languages"):t.index("## Getting Started")], flags=re.M)
    return named(llm, "llm_app_cohere"), len(llm), named(mt, "mt_cohere"), len(mt)


def table_codes(t: str, start: str, speech: bool = True) -> tuple[set[str], int]:
    """(name, `code`) cells of the first table after start, both halves of a two-column-pair table."""
    t = t[t.index(start):]
    rows = []
    for line in t.split("\n")[1:]:
        if line.startswith("|"):
            rows.append(line)
        elif rows:
            break
    pairs = [(n.strip(), c) for r in rows for n, c in re.findall(r"\|\s*([^|`]+?)\s*\|\s*`([A-Za-z-]+)`", r) if c != "auto"]
    out = set()
    for n, c in pairs:
        _read.add(n)
        got = code(c, speech, n) or next(iter(named([n], "", speech)), None)
        if got:
            out.add(got)
    return out, len(pairs)


def xai() -> tuple[set[str], int, set[str], int]:
    asr, an = table_codes(text(XAI_STT), "## Supported Languages")
    # "Arabic | `ar` (Egyptian Arabic, `ar-EG`) | `ar-AE` (Emirati Arabic)": the regional codes name varieties
    t = text(XAI_STT)
    t = t[t.find("regional codes:"):][:1500]
    for n, c in re.findall(r"\(([^,()]+), `([A-Za-z-]+)`\)", t) + [(n, c) for c, n in re.findall(r"`([A-Za-z-]+)` \(([^)]+)\)", t)]:
        if (got := code(c, True, n)):
            asr.add(got)
    tts, tn = table_codes(text(XAI_TTS), "| Language | Language Code |")
    return asr, an, tts, tn


def bixby() -> tuple[set[str], int]:
    m = re.search(r"Bixby supports \d+ languages:\s*(.+?)\.\s*Regions in parentheses", plain(text(BIXBY)))
    names = split(re.sub(r"\s*\([^)]*\)", "", m.group(1))) if m else []  # 'English (India, UK, U.S.)': English
    return named(names, "va_bixby"), len(names)


def android() -> tuple[set[str], int]:
    names = re.findall(r'"name":\s*"(values-[^"]+)"', text(ANDROID))
    base = {m.group(1) for n in names if (m := re.fullmatch(r"values-([a-z]{2,3})", n))}
    chinese = {f"zh-{m.group(1)}" for n in names if (m := re.fullmatch(r"values-zh-r([A-Z]{2})", n))}
    out = {"en"}  # the default resources (values/) are English
    if chinese:  # written Chinese, whichever region: Hong Kong's is Traditional Chinese text, not Cantonese
        out.add("cmn")
    for c in sorted(base - {"ldrtl", "land", "port", "night", "car", "television", "watch", "desk", "round"}):
        _read.add(c)
        got = code({"in": "id", "iw": "he", "tl": "fil"}.get(c, c))
        if got:
            out.add(got)
    return out, len(base) + len(chinese) + 1


def collect() -> list[Record]:
    found, entries = {}, {}
    found["ocr_abbyy"], entries["ocr_abbyy"] = abbyy()
    found["ocr_mistral"], entries["ocr_mistral"] = mistral_ocr()
    found["llm_app_cohere"], entries["llm_app_cohere"], found["mt_cohere"], entries["mt_cohere"] = cohere()
    found["asr_xai"], entries["asr_xai"], found["tts_xai"], entries["tts_xai"] = xai()
    found["va_bixby"], entries["va_bixby"] = bixby()
    found["ui_android"], entries["ui_android"] = android()
    save_entries(entries)
    out = []
    for ind, (source, url, least) in META.items():
        if len(found[ind]) < least:
            raise RuntimeError(f"{ind}: only {len(found[ind])} languages read from {url}; has the page changed?")
        out += [Record(c, ind, int(c in found[ind]), "bool", source, url, method="scrape") for c in ltdi_codes()]
    for ind, names in UNRESOLVED.items():
        print(f"  unresolved for {ind or 'docs'}: {sorted(names)}")
    return out
