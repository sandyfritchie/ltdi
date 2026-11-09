"""Commercial language support, read from each company's own published lists.

One indicator per service (asr_google, kb_apple, ...), 1 if the service lists the language and 0
otherwise, plus depth indicators for services that publish more than a yes or no (Azure speech
features, Google voice types, Windows full or partial translation, ...). Pages that give language
codes are read by code; pages that give only names are resolved with ltdi.names, and names that
resolve to nothing are printed so config/language_names.csv can grow.

Run:  python -m ltdi.collectors vendors   (needs the vendors' documentation sites)
"""

from __future__ import annotations

import re
from collections import defaultdict

from ..crosswalk import to_ltdi
from ..htmltables import tables, text
from ..http import fetch
from ..names import resolve
from ..records import Record
from ._common import ltdi_codes

UNRESOLVED: dict[str, set[str]] = defaultdict(set)


def page(url: str) -> str:
    return fetch(url).decode("utf-8", "replace")


def table(url: str, heading: str | None = None, first: str | None = None) -> list[dict]:
    """Rows (as {header: cell}) of the tables on a page whose heading or first header matches."""
    out = []
    for t in tables(page(url)):
        rows = t["rows"]
        if not rows or (heading and not t["heading"].startswith(heading)) or (first and rows[0][0] != first):
            continue
        out += [dict(zip(rows[0], r)) for r in rows[1:]]
    return out


def code(label: str) -> str | None:
    """LTDI code for a code cell; a cell can give alternatives ("iw or he")."""
    for part in label.split(" or "):
        if part.strip() and (c := to_ltdi(part.strip().replace("_", "-"))):
            return c
    return None


def named(names, indicator: str) -> set[str]:
    out = set()
    for n in names:
        n = n.strip()
        if not n:
            continue
        c = resolve(n)
        if c:
            out.add(c)
        elif c is None:
            UNRESOLVED[indicator].add(n)
    return out


def between(url: str, start: str, end: str) -> list[str]:
    """Lines of a page's text after the first `start` line and before the next `end` line."""
    lines = [l.strip() for l in text(page(url)).split("\n") if l.strip()]
    i = lines.index(start) + 1
    j = next(k for k in range(i, len(lines)) if lines[k].startswith(end))
    return lines[i:j]


# --- Apple ---------------------------------------------------------------------------------------

APPLE = "https://www.apple.com/ios/feature-availability/"
# Siri lists countries; a country named without languages means its main language
SIRI_COUNTRY = {"Australia": "en", "Austria": "de", "Brazil": "pt", "Chile": "es", "Denmark": "da",
                "France": "fr", "Germany": "de", "Italy": "it", "Japan": "ja", "Mexico": "es",
                "Netherlands": "nl", "New Zealand": "en", "Norway": "nb", "Russia": "ru", "South Korea": "ko",
                "Spain": "es", "Sweden": "sv", "Thailand": "th", "Türkiye": "tr", "United Kingdom": "en"}


def apple(section: str) -> list[str]:
    h = page(APPLE)
    i = h.index(f'<section id="{section}"')
    j = h.find("<section", i + 10)
    return [re.sub(r"<[^>]+>", "", li).strip() for li in re.findall(r"(?s)<li[^>]*>(.*?)</li>", h[i:j])]


def siri() -> set[str]:
    out = set()
    for item in apple("siri"):
        m = re.match(r"(.*?)\s*\((.*)\)$", item)
        if m:
            out |= named(m.group(2).split(","), "va_siri")
        elif item in SIRI_COUNTRY:
            out.add(SIRI_COUNTRY[item])
        else:
            UNRESOLVED["va_siri"].add(item)
    return out


# --- Collect ------------------------------------------------------------------------------------

GOOGLE_STT = "https://docs.cloud.google.com/speech-to-text/docs/languages"
GOOGLE_TTS = ["https://docs.cloud.google.com/text-to-speech/docs/voices",
              "https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd",
              "https://docs.cloud.google.com/text-to-speech/docs/gemini-tts"]
GOOGLE_MT = "https://docs.cloud.google.com/translate/docs/languages"
GOOGLE_OCR = "https://cloud.google.com/vision/docs/languages"
GBOARD = "https://support.google.com/gboard/answer/6380730"
GEMINI = "https://support.google.com/gemini/answer/13575153?hl=en"
ASSISTANT = "https://support.google.com/googlenest/answer/7550584"
AZURE_SPEECH = "https://learn.microsoft.com/azure/ai-services/speech-service/language-support"
AZURE_MT = "https://learn.microsoft.com/azure/ai-services/Translator/language-support"
AZURE_OCR = "https://learn.microsoft.com/azure/ai-services/computer-vision/language-support"
SWIFTKEY = "https://support.microsoft.com/en-us/swiftkey-keyboard/what-languages-are-currently-supported-for-microsoft-swiftkey-keyboard"
COPILOT = "https://support.microsoft.com/en-us/Microsoft-Copilot/supported-regions-and-languages-in-microsoft-copilot"
OFFICE = "https://support.microsoft.com/en-us/office/language-accessory-pack-for-microsoft-365-82ee1236-0f9a-45ee-9c72-05b026ee809f"
WINDOWS = "https://learn.microsoft.com/en-us/windows-hardware/manufacture/desktop/available-language-packs-for-windows"
TRANSCRIBE = "https://docs.aws.amazon.com/transcribe/latest/dg/supported-languages.html"
POLLY = "https://docs.aws.amazon.com/polly/latest/dg/supported-languages.html"
ALEXA = "https://developer.amazon.com/en-US/docs/alexa/custom-skills/develop-skills-in-multiple-languages.html"

# indicator: (unit, source, url)
META = {
    "asr_google": ("bool", "Google Cloud Speech-to-Text", GOOGLE_STT),
    "asr_azure": ("bool", "Azure AI Speech (speech to text)", AZURE_SPEECH + "?tabs=stt"),
    "asr_azure_features": ("features of 10", "Azure speech to text features", AZURE_SPEECH + "?tabs=stt"),
    "asr_apple": ("bool", "Apple iOS dictation", APPLE + "#dictation"),
    "asr_amazon": ("bool", "Amazon Transcribe", TRANSCRIBE),
    "tts_google": ("bool", "Google Cloud Text-to-Speech", " ".join(GOOGLE_TTS)),
    "tts_google_voice_types": ("types of 9", "Google Cloud TTS voice types", " ".join(GOOGLE_TTS)),
    "tts_azure": ("bool", "Azure AI Speech (text to speech)", AZURE_SPEECH + "?tabs=tts"),
    "tts_amazon": ("bool", "Amazon Polly", POLLY),
    "mt_google": ("bool", "Google Cloud Translation", GOOGLE_MT),
    "mt_azure": ("bool", "Azure AI Translator", AZURE_MT),
    "mt_azure_features": ("features of 6", "Azure Translator language features", AZURE_MT),
    "kb_gboard": ("bool", "Gboard (Android)", GBOARD),
    "kb_swiftkey": ("bool", "Microsoft SwiftKey (Android)", SWIFTKEY),
    "kb_apple": ("bool", "Apple iOS QuickType keyboard", APPLE + "#quicktype-keyboard-language-support"),
    "kb_apple_features": ("features of 4", "Apple iOS QuickType keyboard features", APPLE + "#quicktype-keyboard-autocorrection"),
    "llm_app_gemini": ("bool", "Gemini web app", GEMINI),
    "llm_app_copilot": ("bool", "Microsoft Copilot app (text)", COPILOT),
    "ui_ios": ("bool", "Apple iOS system language", APPLE + "#system-language-system-language"),
    "ui_windows": ("bool", "Windows display language", WINDOWS),
    "ui_windows_level": ("levels of 2", "Windows display language", WINDOWS),
    "ui_office": ("bool", "Microsoft 365 display language", OFFICE),
    "ui_office_level": ("levels of 2", "Microsoft 365 display language", OFFICE),
    "proof_office": ("bool", "Microsoft 365 proofing tools", OFFICE),
    "ocr_google": ("bool", "Google Cloud Vision OCR", GOOGLE_OCR),
    "ocr_google_level": ("levels of 2", "Google Cloud Vision OCR", GOOGLE_OCR),
    "ocr_azure": ("bool", "Azure AI Vision OCR (printed text)", AZURE_OCR),
    "ocr_azure_handwriting": ("bool", "Azure AI Vision OCR (handwriting)", AZURE_OCR),
    "ocr_apple": ("bool", "Apple iOS Live Text", APPLE + "#live-text-live-text"),
    "va_google_assistant": ("bool", "Google Assistant (speakers and displays)", ASSISTANT),
    "va_siri": ("bool", "Apple Siri", APPLE + "#siri"),
    "va_alexa": ("bool", "Amazon Alexa", ALEXA),
}
DEPTH = {"asr_azure_features", "tts_google_voice_types", "mt_azure_features", "kb_apple_features",
         "ui_windows_level", "ui_office_level", "ocr_google_level"}
TICK = ("✅", "✔", "Yes")
VOICE_TYPE = {"Standard": "Standard", "Wavenet": "WaveNet", "Neural2": "Neural2", "Studio": "Studio",
              "Polyglot": "Polyglot", "News": "News", "Chirp-HD": "Chirp HD", "Chirp3-HD": "Chirp3-HD"}


def _codes(rows, col) -> set[str]:
    return {c for c in (code(r.get(col, "")) for r in rows) if c}


def _features(found, notes, indicator, by_lang: dict[str, set[str]], weights: dict | None = None):
    for c, feats in by_lang.items():
        found[indicator][c] = sum((weights or {}).get(f, 1) for f in feats)
        notes[indicator][c] = "Has: " + ", ".join(sorted(feats)) if feats else "None counted"


def collect() -> list[Record]:
    found: dict[str, dict[str, float]] = defaultdict(dict)
    notes: dict[str, dict[str, str]] = defaultdict(dict)

    def mark(indicator, codes, note=None):
        for c in codes:
            found[indicator][c] = 1
            if note:
                notes[indicator].setdefault(c, note)

    # Google
    mark("asr_google", _codes(table(GOOGLE_STT, first="Location"), "BCP-47"))
    types: dict[str, set[str]] = defaultdict(set)
    for r in table(GOOGLE_TTS[0], first="Language"):  # the type is in the voice name: en-US-Neural2-A
        if (c := code(r.get("Language code", ""))):
            m = re.match(r"[a-z]{2,3}-[A-Za-z]{2,4}-(.+)-[^-]+$", r["Voice name"])
            t = VOICE_TYPE.get(m.group(1)) if m else "Gemini-TTS"  # Gemini voices have bare names
            if t:
                types[c].add(t)
    for r in table(GOOGLE_TTS[1], heading="Language availability"):
        if (c := code(r.get("BCP-47 Code", ""))):
            types[c].add("Chirp3-HD")
    for r in table(GOOGLE_TTS[2], heading="Available languages"):
        if (c := code(r.get("BCP-47 code", ""))):
            types[c].add("Gemini-TTS" + ("" if r.get("Launch readiness") == "GA" else " (preview)"))
    mark("tts_google", types)
    _features(found, notes, "tts_google_voice_types",
              {c: {t.replace(" (preview)", "") for t in ts} for c, ts in types.items()})
    mark("mt_google", _codes(table(GOOGLE_MT, first="Language"), "ISO-639 code")
         | _codes(table(GOOGLE_MT, heading="Translation LLM"), "Language code"))
    for r in table(GOOGLE_OCR, heading="Supported languages"):
        if (c := code(r["languageHints code"])):
            found["ocr_google"][c] = 1
            found["ocr_google_level"][c] = 2
    for r in table(GOOGLE_OCR, heading="Experimental languages"):
        if (c := code(r["languageHints code"])) and c not in found["ocr_google_level"]:
            found["ocr_google"][c] = 1
            found["ocr_google_level"][c] = 1
            notes["ocr_google"][c] = notes["ocr_google_level"][c] = "Experimental"
    mark("kb_gboard", named(between(GBOARD, "Find supported languages", "Android phone"), "kb_gboard"))
    gemini = [n for t in tables(page(GEMINI)) if t["heading"].startswith("Supported languages")
              for row in t["rows"] for cell in row for n in cell.split("\n")]
    mark("llm_app_gemini", named(gemini, "llm_app_gemini"))
    va = set()
    for r in table(ASSISTANT, heading="Google Assistant"):
        va |= named(re.split(r",|\n", r.get("Supported Languages", "")), "va_google_assistant")
    mark("va_google_assistant", va)

    # Microsoft
    stt = defaultdict(set)
    for r in table(AZURE_SPEECH + "?tabs=stt", first="Locale (BCP-47)"):
        c = code(r["Locale (BCP-47)"])
        if not c:
            continue
        for col, feat in (("Real-time transcription support", "real-time"), ("Batch transcription support", "batch"),
                          ("Monolingual post-stream refinement support", "monolingual refinement"),
                          ("Multilingual post-stream refinement support", "multilingual refinement"),
                          ("Fast transcription support", "fast transcription"),
                          ("Azure LLM Speech transcription support", "LLM speech")):
            if r.get(col, "").startswith(TICK):
                stt[c].add(feat)
        custom = r.get("Custom speech support", "")
        for word, feat in (("Labeled audio", "custom speech with labeled audio"),
                           ("Pronunciation", "custom pronunciation"), ("Output format", "display format")):
            if word in custom:
                stt[c].add(feat)
        if "Real-time transcription support" in r or "Batch transcription support" in r:
            stt.setdefault(c, set())
    for r in table(AZURE_SPEECH + "?tabs=stt", heading="MAI-Transcribe"):
        if (c := code(r["Language code"])) and any(v.startswith(TICK) for v in r.values()):
            stt.setdefault(c, set()).add("MAI-Transcribe")
    asr = {c for c, f in stt.items() if f & {"real-time", "batch", "fast transcription"}}
    mark("asr_azure", asr)
    _features(found, notes, "asr_azure_features", {c: stt[c] for c in asr})
    mark("tts_azure", _codes(table(AZURE_SPEECH + "?tabs=tts", heading="Text to speech voices"), "Locale (BCP-47)"))
    mt = defaultdict(set)
    for r in table(AZURE_MT, heading="Translation"):
        c = code(r["Language code"])
        if not c or not r.get("Cloud – Text translation and Document translation", "").startswith(TICK):
            continue
        mt[c]
        for col in ("Custom Translator", "Auto Language Detection", "Dictionary", "LLM translation",
                    "Adaptive custom translation"):
            if r.get(col, "").startswith(TICK):
                mt[c].add(col.lower())
    for r in table(AZURE_MT, heading="Document translation"):
        if (c := code(r["Language Code"])) in mt:
            if r.get("Supported for target language?") == "Yes":
                mt[c].add("scanned documents")
            elif r.get("Supported for source language?") == "Yes":
                mt[c].add("scanned documents (source only)")
    mark("mt_azure", mt)
    _features(found, notes, "mt_azure_features", mt, {"scanned documents (source only)": 0.5})
    for heading, ind in (("Printed text", "ocr_azure"), ("Handwritten text", "ocr_azure_handwriting")):
        for t in tables(page(AZURE_OCR)):
            if t["heading"].startswith(heading):
                mark(ind, {c for r in t["rows"][1:] for c in map(code, r[1::2]) if c})
    mark("kb_swiftkey", named(between(SWIFTKEY, "The following list is regularly updated.", "(* = no Flow)"),
                              "kb_swiftkey"))
    copilot = between(COPILOT, "What languages are currently supported in Microsoft Copilot prompts and responses?",
                      "Copilot Voice languages")
    mark("llm_app_copilot", named([n for n in copilot if "accounts" not in n], "llm_app_copilot"))
    seen = set()
    for t in tables(page(OFFICE)):  # one table per language, for each Office version; the first set is current
        rows = t["rows"]
        if len(rows) < 2 or rows[0][:2] != ["Language", "Culture (ll-cc)"]:
            continue
        if t["heading"] in seen:
            break
        seen.add(t["heading"])
        r = dict(zip(rows[0], rows[1]))
        c = code(r["Culture (ll-cc)"])
        if not c:
            continue
        extent, desc = r["Extent of localization"], r["Description"]
        if extent == "Proofing Tools only" or "roofing" in desc and "not include proofing" not in desc.lower():
            found["proof_office"][c] = 1
        if extent in ("Full", "Partial"):
            found["ui_office"][c] = 1
            level = 2 if extent == "Full" else 1
            found["ui_office_level"][c] = max(found["ui_office_level"].get(c, 0), level)
            if found["ui_office_level"][c] == 1:
                notes["ui_office_level"][c] = "Partial: some apps and menus stay in another language"
    for t in tables(page(WINDOWS)):
        if not t["rows"] or t["rows"][0][:2] != ["Language/region", "Language/region tag"]:
            continue
        full = t["heading"].startswith("Language Packs")
        for r in t["rows"][1:]:
            if (c := code(r[1])):
                found["ui_windows"][c] = 1
                level = 2 if full else 1
                if level > found["ui_windows_level"].get(c, 0):
                    found["ui_windows_level"][c] = level
                    notes["ui_windows_level"][c] = "" if full else \
                        "Language interface pack: partly translated, over a base language"

    # Apple
    mark("asr_apple", named(apple("dictation"), "asr_apple"))
    mark("kb_apple", named(apple("quicktype-keyboard-language-support"), "kb_apple"))
    feats = defaultdict(set)
    for section, feat in (("quicktype-keyboard-autocorrection", "Autocorrection"),
                          ("quicktype-keyboard-predictive-typing", "Predictive typing"),
                          ("quicktype-keyboard-multilingual-typing", "Multilingual typing"),
                          ("quicktype-keyboard-quickpath", "QuickPath")):
        for c in named(apple(section), "kb_apple_features"):
            feats[c].add(feat)
    _features(found, notes, "kb_apple_features", {c: feats.get(c, set()) for c in found["kb_apple"]})
    mark("ocr_apple", named(apple("live-text-live-text"), "ocr_apple"))
    mark("ui_ios", named(apple("system-language-system-language"), "ui_ios"))
    mark("va_siri", siri())

    # Amazon
    mark("asr_amazon", _codes(table(TRANSCRIBE, heading="Supported languages"), "Language code"))
    mark("tts_amazon", _codes(table(POLLY, first="Language"), "Language code"))
    mark("va_alexa", _codes(table(ALEXA, first="Locale code"), "Locale code"))

    for ind, names in sorted(UNRESOLVED.items()):
        print(f"  {ind}: {len(names)} names not resolved, e.g. {', '.join(sorted(names)[:12])}")
    out = []
    for ind, (unit, source, url) in META.items():
        if not found.get(ind):
            raise RuntimeError(f"{ind}: nothing read from {url}; has the page changed?")
        langs = sorted(found[ind]) if ind in DEPTH else ltdi_codes()
        out += [Record(c, ind, found[ind].get(c, 0), unit, source, url, method="scrape",
                       note=notes[ind].get(c, "")) for c in langs]
    return out
