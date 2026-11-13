"""Opportunities: where an intervention would most improve a language's support.

Each rule compares what a language has with what the technology needs (after
van Esch, Ritchie et al. 2024, section 2: keyboards need text and a character
set; speech recognition needs transcribed audio; TTS needs clean speech;
translation needs parallel text) and proposes one of five kinds of action:

  share     Share or ship: the resources exist; make them open or launch the product
  measure   Measure: no public benchmark or error rate yet
  standardise  Standardise: foundational locale data is incomplete
  improve   Improve: support exists but quality lags
  collect   Collect: the data really is scarce

Priority = reach x gap x need / cost (see rank), so cheap actions for large,
under-served languages rise to the top. Wording is neutral about vendors: it names platforms and
open resources, never companies.
"""

from __future__ import annotations

import csv
import math
from functools import lru_cache

from . import CONFIG
from .config import load_config
from .records import Record

TYPES = {
    "share": {"label": "Share or ship", "cost": 1, "workstream": "Tools for builders"},
    "measure": {"label": "Measure", "cost": 1, "workstream": "Measurement"},
    "standardise": {"label": "Standardise", "cost": 1, "workstream": "Open language data"},
    "improve": {"label": "Improve", "cost": 2, "workstream": "Tools for builders"},
    "collect": {"label": "Collect", "cost": 3, "workstream": "Open language data"},
}

TEAMS = {
    "keyboards": "Keyboards and input",
    "speech": "Speech recognition",
    "tts": "Text-to-speech",
    "translation": "Translation",
    "llm": "LLMs",
    "data": "Data collection",
    "evaluation": "Evaluation and benchmarks",
    "standards": "Standards and localisation",
    "ocr": "Text recognition (OCR)",
    "proofing": "Spelling and grammar",
    "assistants": "Voice assistants",
    "funding": "Funding",
}

# Per rule: which teams can act, which open resources to start from, what's still missing, and
# optionally a cost that overrides the type's (building a voice assistant is more than a launch).
RULES = {
    "kb-platform": {"teams": ["keyboards", "standards"], "starter": ["kb_open_keyman", "cldr_coverage", "web_text_words"],
        "missing": "An openly licensed version of the layout in CLDR Keyboards format, then a launch on the "
                   "remaining platforms."},
    "kb-open": {"teams": ["keyboards", "standards"], "starter": ["kb_open_keyman", "cldr_coverage", "web_text_words"],
        "missing": "Agreement from speakers on one layout, converted to CLDR Keyboards format, then a launch on the "
                   "major phone keyboards."},
    "kb-features": {"teams": ["keyboards"], "starter": ["web_text_words", "wikipedia_articles"],
        "missing": "A word list and prediction model built from the open text, and native speakers to review the "
                   "suggestions."},
    "asr-vendors": {"teams": ["speech"], "starter": ["cv_validated_hours", "asr_open_omnilingual", "asr_open_whisper"],
        "missing": "Launches in the remaining services, each checked against a held-out test set in the main "
                   "regional accents."},
    "asr-none": {"teams": ["speech"], "starter": ["cv_validated_hours", "asr_open_omnilingual", "asr_open_whisper"],
        "missing": "A production model and a launch. If the open recordings come from few speakers, more varied "
                   "voices first."},
    "asr-measure": {"teams": ["evaluation", "speech"], "starter": ["cv_validated_hours", "flores200"],
        "missing": "A public test set of read speech (FLORES sentences can serve as prompts) and published error "
                   "rates for open and commercial models."},
    "asr-improve": {"teams": ["speech", "data"], "starter": ["cv_validated_hours", "asr_open_omnilingual", "asr_open_whisper"],
        "missing": "More transcribed speech in everyday domains, and fine-tuning of open models on it."},
    "asr-collect": {"teams": ["data", "funding", "speech"], "starter": ["cv_validated_hours", "web_text_words"],
        "missing": "Tens of hours of transcribed speech from many speakers, collected with informed consent and an "
                   "open licence."},
    "tts-vendors": {"teams": ["tts"], "starter": ["tts_open_mms", "cv_validated_hours"],
        "missing": "Launches in the remaining services, with native speakers rating naturalness and how numbers "
                   "and names are read."},
    "tts-share": {"teams": ["tts"], "starter": ["tts_open_mms", "cv_validated_hours", "cldr_coverage"],
        "missing": "Studio-quality recordings from one or two voice talents for a production voice, plus rules for "
                   "reading numbers and dates aloud."},
    "tts-collect": {"teams": ["tts", "data", "funding"], "starter": ["cv_validated_hours", "cldr_coverage"],
        "missing": "Several hours of clean single-speaker studio recordings, licensed for commercial use, plus "
                   "rules for reading numbers and dates aloud."},
    "mt-vendors": {"teams": ["translation"], "starter": ["mt_open_nllb", "flores200", "wikipedia_articles"],
        "missing": "Launches in the remaining services. The open model's licence is non-commercial, so a product "
                   "needs its own training data; FLORES-200 gives a shared yardstick for quality."},
    "llm-measure": {"teams": ["evaluation", "llm"], "starter": ["flores200", "belebele", "web_text_words"],
        "missing": "Professionally translated benchmark items, for example a Global-MMLU or MMMLU edition, and "
                   "published results for leading models."},
    "llm-apps": {"teams": ["llm", "evaluation"], "starter": ["belebele", "flores200"],
        "missing": "Testing by native speakers on everyday tasks, then listing the language in the apps' "
                   "supported languages."},
    "llm-improve": {"teams": ["llm", "data"], "starter": ["web_text_words", "wikipedia_articles"],
        "missing": "More high-quality text and instruction data, and evaluation by native speakers."},
    "llm-reading": {"teams": ["evaluation"], "starter": ["flores200"],
        "missing": "Belebele's questions translated into this language. Belebele is built on FLORES-200 passages, "
                   "so where those exist only the questions are needed."},
    "font": {"teams": ["standards"], "starter": ["cldr_coverage"],
        "missing": "The missing characters added to a Noto font (requests go to github.com/notofonts), "
                   "checked by a native reader."},
    "cldr": {"teams": ["standards", "keyboards"], "starter": ["cldr_coverage"],
        "missing": "Native speakers contributing through the CLDR Survey Tool to reach modern coverage."},
    "text-collect": {"teams": ["data", "funding"], "starter": ["web_text_words", "wikipedia_articles"],
        "missing": "Digitised books, news and public-sector text, with OCR where needed and clear licences."},
    "ui-platforms": {"teams": ["standards"], "starter": ["ui_firefox", "cldr_coverage"],
        "missing": "Translators and reviewers for the remaining platforms, and a shared glossary of interface terms "
                   "so the same button reads the same everywhere."},
    "ui-community": {"teams": ["standards"], "starter": ["ui_firefox", "cldr_coverage"],
        "missing": "Permission to reuse the volunteer translations and terminology, and paid review before a "
                   "platform launch."},
    "ui-none": {"teams": ["standards", "funding"], "starter": ["cldr_coverage", "web_text_words"],
        "missing": "A localisation community: a terminology list, a few paid translators, and an open project "
                   "(such as a browser or office suite) to start on."},
    "ocr-vendors": {"teams": ["ocr"], "starter": ["ocr_open_tesseract", "web_text_words"],
        "missing": "Launches in the remaining services, tested on scanned books and phone photos of signs and "
                   "forms."},
    "ocr-open": {"teams": ["ocr"], "starter": ["ocr_open_tesseract", "web_text_words"],
        "missing": "A production model trained on the open model's data or on rendered text, and a test set of "
                   "real scans."},
    "ocr-collect": {"teams": ["ocr", "data", "funding"], "starter": ["web_text_words", "cldr_coverage"],
        "missing": "A few thousand scanned or photographed pages with transcriptions, under an open licence. "
                   "Text rendered in common fonts can bootstrap a first model."},
    "proof-share": {"teams": ["proofing"], "starter": ["proof_hunspell", "proof_languagetool"],
        "missing": "Checking the open dictionary's licence and quality with native speakers, then packaging it "
                   "for the major office suites and phone keyboards."},
    "proof-build": {"teams": ["proofing", "data"], "starter": ["web_text_words", "wikipedia_articles"],
        "missing": "A word list built from the open text and reviewed by native speakers, in the open Hunspell "
                   "format that most spell-checkers read."},
    "va-vendors": {"teams": ["assistants"], "starter": ["cv_validated_hours"],
        "missing": "Launches on the remaining assistants, with test commands from speakers of the main regional "
                   "accents."},
    "va-ready": {"teams": ["assistants", "speech"], "starter": ["cv_validated_hours", "asr_open_omnilingual", "asr_open_whisper"], "cost": 2,
        "missing": "Spoken-command data (how people actually phrase requests), and local content such as names, "
                   "places and services."},
    "lid-none": {"teams": ["data", "evaluation"], "starter": ["web_text_words", "wikipedia_articles"],
        "missing": "A few thousand sentences of verified text, contributed to an open language identification "
                   "model's training set."},
    "wiki-community": {"teams": ["data", "funding"], "starter": ["wikipedia_articles", "wikipedia_active_editors"],
        "missing": "Editor training and outreach with universities and community groups."},
}

# Coverage rules: one per technology and situation, applied by the same code.
#   some  offered by some of the technology's commercial services, not all
#   open  offered by none, but an open model exists (or enough open speech: "hours")
#   none  offered by none, and no open model
# Titles and details are functions of c: n and of (services offering / checked), open (an open
# model exists), hours and sets (open transcribed speech and how many datasets it spans).
COVERAGE = {
    "kb-platform": ("keyboard", "some", "share",
        lambda c: "A keyboard layout exists but isn't on every major platform",
        lambda c: f"A layout ships on {c['n']} of {c['of']} major keyboards. Contributing it to CLDR Keyboards, the "
                  "open interchange format for layouts, would let any platform adopt it."),
    "kb-open": ("keyboard", "open", "share",
        lambda c: "Open keyboard layouts exist, but no major phone keyboard",
        lambda c: "Community layouts are published under an open licence. Converting one to CLDR Keyboards format "
                  "would let phone keyboards adopt it."),
    "asr-vendors": ("speech_input", "some", "share",
        lambda c: f"Speech input is offered by {c['n']} of {c['of']} major services",
        lambda c: f"Some services already recognise this language. Open training data includes {_hours(c['hours'])} "
                  f"of transcribed speech {c['sets']}."),
    "asr-none": ("speech_input", "open", "share",
        lambda c: "No major speech input service, though open resources exist",
        lambda c: f"Open datasets hold {_hours(c['hours'])} of transcribed speech"
                  + (", and an open model lists the language" if c["open"] else "") + "."),
    "tts-vendors": ("tts", "some", "share",
        lambda c: f"Text-to-speech is offered by {c['n']} of {c['of']} major services",
        lambda c: "Some cloud services already have a voice for this language"
                  + (", and an open model can speak it." if c["open"] else ".")),
    "tts-share": ("tts", "open", "share",
        lambda c: "No cloud text-to-speech voice found, though open resources exist",
        lambda c: "None of the cloud services checked has a voice for this language. "
                  + ("An open text-to-speech model already speaks it. " if c["open"] else "")
                  + f"Open datasets hold {_hours(c['hours'])} of transcribed speech."),
    "tts-collect": ("tts", "none", "collect",
        lambda c: "Record a single-speaker voice for text-to-speech",
        lambda c: "No cloud or open voice was found and open speech data is thin. A few hours of clean single-speaker "
                  "recordings would unlock a usable voice."),
    "ui-platforms": ("interface", "some", "share",
        lambda c: f"The interface is translated on {c['n']} of {c['of']} major platforms",
        lambda c: "People can already use some phone and computer platforms in this language. Shared terminology "
                  "would make the remaining ones faster to translate."),
    "ui-community": ("interface", "open", "share",
        lambda c: "Volunteers translate an open browser, but no major platform",
        lambda c: "A volunteer community already maintains a full browser translation, with terminology a platform "
                  "could build on."),
    "ui-none": ("interface", "none", "standardise",
        lambda c: "No major platform or open project offers this interface language",
        lambda c: "Phones and computers can't be set to this language, so every app is used in a second language."),
    "ocr-vendors": ("ocr", "some", "share",
        lambda c: f"Text recognition is offered by {c['n']} of {c['of']} major services",
        lambda c: "Some services already read printed text in this language"
                  + (", and an open OCR model covers it." if c["open"] else ".")),
    "ocr-open": ("ocr", "open", "share",
        lambda c: "An open text recognition model exists, but no major service",
        lambda c: "An open OCR model reads printed text in this language. Text recognition also turns printed books "
                  "into training data for every other technology."),
    "ocr-collect": ("ocr", "none", "collect",
        lambda c: "No text recognition, open or commercial",
        lambda c: "Printed books, signs and forms can't be read by phone cameras or digitised at scale."),
    "proof-share": ("proofing", "open", "share",
        lambda c: "An open spell-checker exists that more word processors could adopt",
        lambda c: "An open dictionary or grammar checker covers this language, but the most widely used word "
                  "processors don't check it yet."),
    "va-vendors": ("assistant", "some", "share",
        lambda c: f"{c['n']} of {c['of']} major voice assistants understand this language",
        lambda c: "One assistant already works in this language, so speech recognition, a voice and language "
                  "understanding have been shown to be feasible."),
}
OPEN_HOURS = {"speech_input": 20, "tts": 10}  # this much open speech also counts as an open resource


def _consumer(tech: str, key: str = "consumer") -> list[str]:
    """A technology's service list from config/services.csv, so rules follow the config."""
    return list(load_config()["dimensions"]["tech"]["technologies"][tech].get(key, []))


ASR = _consumer("speech_input")
TTS = _consumer("tts")
MT = _consumer("mt")
LLM = list(_consumer("llm", "measured"))
APPS = _consumer("llm")
VA = _consumer("assistant")
LID = _consumer("langid", "open")


def _v(f: dict[str, Record], ind: str) -> float | None:
    return f[ind].value if ind in f else None


def _words(n: float) -> str:
    for size, unit in ((1e9, "billion"), (1e6, "million"), (1e3, "thousand")):
        if n >= size:
            return f"{n / size:.0f} {unit}"
    return f"{n:.0f}"


def _hours(h: float | None) -> str:
    h = h or 0
    return f"{h:,.0f} hours" if h >= 10 else f"{h:.1f} hours"


def find(f: dict[str, Record]) -> list[dict]:
    """All opportunities for one language's facts, each with a rule key, type, technology, title,
    detail, gap, evidence, teams, starter kit (indicators of open resources) and what's still missing."""
    out = []

    def add(key, type_, tech, title, detail, gap, evidence):
        if gap > 0:
            rule = RULES[key]
            out.append({"key": key, "type": type_, "technology": tech, "title": title, "detail": detail,
                        "gap": round(min(1.0, gap), 3), "evidence": [e for e in evidence if e in f],
                        "teams": rule["teams"], "missing": rule["missing"], "cost": rule.get("cost"),
                        "starter": [i for i in _expand(rule["starter"]) if _v(f, i)]})

    # Open speech datasets for this language, largest first; they replace Common Voice in starter kits
    speech_sets = sorted((i for i in f if i.startswith("speech_") and _v(f, i)), key=lambda i: -f[i].value)

    def _expand(starter):
        return [x for i in starter for x in ([*speech_sets[:3], i] if i == "cv_validated_hours" else [i])]

    cv = _v(f, "open_speech_hours")
    cv = (_v(f, "cv_validated_hours") or 0) if cv is None else cv
    n_sets = len(speech_sets) + (1 if _v(f, "cv_validated_hours") else 0)
    sets = f"across {n_sets} open dataset{'s' if n_sets != 1 else ''}"
    words = _v(f, "web_text_words") or 0

    # Coverage across each technology's services (COVERAGE)
    tech_cfg = load_config()["dimensions"]["tech"]["technologies"]
    offered = {}
    for name, t in tech_cfg.items():
        cons, opn = t.get("consumer", []), t.get("open", [])
        n = offered[name] = sum(1 for i in cons if _v(f, i))
        if not cons or not any(i in f for i in cons):
            continue
        has_open = any(_v(f, i) for i in opn)
        c = {"n": n, "of": len(cons), "open": has_open, "hours": cv, "sets": sets}
        when = ("some" if n < len(cons) else None) if n else \
            "open" if has_open or cv >= OPEN_HOURS.get(name, math.inf) else "none"
        for key, (tech, w, type_, title, detail) in COVERAGE.items():
            if tech == name and w == when:
                gap = (len(cons) - n) / len(cons) if when == "some" else 1.0
                ev = cons + opn + (["open_speech_hours"] if name in OPEN_HOURS else [])
                add(key, type_, tech, title(c), detail(c), gap, ev)

    # Keyboard features
    feats = _v(f, "kb_apple_features")
    if _v(f, "kb_apple") and feats is not None and feats < 2 and words >= 1e7:
        add("kb-features", "share", "keyboard", "Predictive text and autocorrect could be built from open text",
            f"The iOS keyboard has {feats:.0f} of 4 typing features. FineWeb-2 holds about {_words(words)} words "
            "of openly licensed web text, enough to train word prediction.",
            (4 - feats) / 4, ["kb_apple_features", "web_text_words"])

    # Speech input: error rates and data
    wer = _v(f, "asr_whisper_fleurs_wer")
    if wer is not None and wer >= 100:
        add("asr-measure", "measure", "speech_input", "No published speech recognition error rate",
            "The language isn't in the published FLEURS error-rate breakdowns we track, so builders can't "
            "tell how usable open speech recognition is.",
            1.0, ["asr_whisper_fleurs_wer"])
    elif wer is not None and wer >= 25:
        add("asr-improve", "improve", "speech_input", f"Speech recognition makes about {wer:.0f} errors per 100 words",
            "Measured on FLEURS with a leading open model. Below about 15% is comfortably usable for dictation.",
            (wer - 10) / 40, ["asr_whisper_fleurs_wer"])
    if cv < 20:
        add("asr-collect", "collect", "speech_input", f"Only {_hours(cv)} of open transcribed speech" if cv else "No open transcribed speech found",
            "Counted across the open speech datasets we track. Image-prompted field collection has worked at "
            "scale for Indian and African languages.",
            1 - cv / 20, ["open_speech_hours"])

    # Translation: the open model and FLORES-200 make every gap a launch
    mt_n = offered["mt"]
    if mt_n < len(MT) and (_v(f, "mt_open_nllb") or mt_n):
        add("mt-vendors", "share", "mt", f"Translation is offered by {mt_n} of {len(MT)} major services",
            "An open model and the FLORES-200 evaluation set already cover this language, so the main "
            "remaining step is a product launch.",
            (len(MT) - mt_n) / len(MT), MT + ["mt_open_nllb", "flores200"])

    # LLMs
    llm = [i for i in LLM if i in f]
    if not llm:
        add("llm-measure", "measure", "llm", "No published LLM benchmark results",
            "Neither of the two multilingual benchmarks we track reports this language. Adding it would give "
            "builders and buyers a baseline.",
            1.0, [])
    else:
        rel = _v(f, "llm_global_mmlu_rel")
        acc = _v(f, "llm_mmmlu_openai")
        weak = [s for s in (f"{rel:.0f}% of English" if rel is not None and rel < 97 else None,
                            f"{acc * 100:.0f}% accuracy" if acc is not None and acc < 0.85 else None) if s]
        if weak:
            add("llm-improve", "improve", "llm", "LLMs lag behind their English performance",
                "Benchmark results: " + "; ".join(weak) + ".", 0.5, llm)
    apps_n = offered["llm"]
    if any(i in f for i in APPS) and apps_n < len(APPS) and (apps_n or llm):
        add("llm-apps", "share", "llm", (f"{apps_n} of {len(APPS)} major AI assistant apps list this language" if apps_n
                                    else "No major AI assistant app lists this language yet"),
            ("Some assistant apps already offer it. " if apps_n else "")
            + ("Benchmarks show models already work in it, so listing it could be a short step."
               if llm else "Listing it would tell speakers they can rely on it."),
            (len(APPS) - apps_n) / len(APPS), APPS + llm)
    if not _v(f, "belebele"):
        add("llm-reading", "measure", "llm", "No reading-comprehension benchmark",
            "Belebele, the widest multilingual reading benchmark, doesn't include this language yet.",
            0.5, ["belebele"])

    # Spelling and grammar: nothing open either, but enough text for a word list
    if "proof_office" in f and not _v(f, "proof_office") and not (_v(f, "proof_hunspell") or _v(f, "proof_languagetool")) \
            and words >= 1e7:
        add("proof-build", "share", "proofing", "A spell-checker could be built from open text",
            f"No spell-checker was found. FineWeb-2 holds about {_words(words)} words of open web text, "
            "enough for a first word list.",
            1.0, ["proof_office", "proof_hunspell", "web_text_words"])

    # Voice assistants: none yet, but speech recognition and a voice exist
    if any(i in f for i in VA) and not offered["assistant"] and offered["speech_input"] and offered["tts"]:
        add("va-ready", "share", "assistant", "The building blocks for a voice assistant exist",
            "Commercial speech recognition and a synthetic voice both exist, but no major assistant "
            "understands spoken requests in this language yet.",
            1.0, VA + ASR + TTS)

    # Language identification (open tools only)
    if any(i in f for i in LID) and not any(_v(f, i) for i in LID) and words:
        add("lid-none", "share", "langid", "Open language identifiers don't recognise this language",
            "Web-scale data collection starts by identifying each page's language, so text in this language "
            "is lost from open datasets.",
            1.0, LID + ["web_text_words"])

    # Writing system
    cldr = _v(f, "cldr_coverage")
    if cldr is not None and cldr < 3:
        level = ["missing", "basic", "moderate"][int(cldr)]
        add("cldr", "standardise", "writing", f"Locale data in Unicode CLDR is {level}",
            "Complete CLDR data (names, dates, numbers, character sets) underpins interface localisation, "
            "keyboards and reading numbers aloud in text-to-speech.",
            (3 - cldr) / 3, ["cldr_coverage"])

    if _v(f, "font_noto") == 0:
        add("font", "standardise", "writing", "Google's open Noto fonts can't display all its letters",
            "Without a font that has every character, text shows as empty boxes or wrongly placed accents "
            "on Android and other systems that rely on Noto, and people fall back on look-alike characters "
            "that break search and spelling tools.",
            1.0, ["font_noto"])

    # Text data
    if words and words < 1e8:
        add("text-collect", "collect", "data", f"Only about {_words(words)} words of open web text",
            "Little text online limits language models and word prediction. Digitising books and news archives "
            "is often the fastest route.",
            1 - math.log10(max(words, 1e4) / 1e4) / 4, ["web_text_words"])
    editors = _v(f, "wikipedia_active_editors")
    if editors is not None and editors < 100:
        add("wiki-community", "collect", "data", f"Wikipedia has {editors:.0f} active editors",
            "A small editing community limits new open text. Edit-a-thons and translation drives with "
            "universities have grown communities elsewhere.",
            1 - editors / 100, ["wikipedia_active_editors"])
    return out


VOICE = {"speech_input", "tts", "assistant"}  # usable without reading or writing


def users(lang: dict, facts: dict[str, Record], technology: str) -> dict:
    """Potential users of a technology: all speakers, connected now, and connected in five years.

    Text technologies count speakers online who can read and write text on a phone;
    voice technologies count everyone online. Falls back to all speakers where
    connectivity data is missing.
    """
    sp = float(lang.get("speakers") or 0)
    kind = "voice" if technology in VOICE else "text"
    now, later = facts.get(f"reach_{kind}_share"), facts.get(f"reach_{kind}_share_5y")
    growth = facts["speaker_growth_5y"].value if "speaker_growth_5y" in facts else 1.0
    if now is None or later is None:
        return {"speakers": sp, "now": sp, "5y": sp, "kind": kind, "estimated": False}
    return {"speakers": sp, "now": sp * now.value, "5y": sp * growth * later.value, "kind": kind, "estimated": True}


def _reach(n: float) -> float:
    """log10(people) - 4: 10K scores 0, 1 billion scores 5."""
    return max(0.0, math.log10(max(n, 1)) - 4)


def rank(lang: dict, opps: list[dict], scores: dict, facts: dict[str, Record] | None = None) -> list[dict]:
    """Priority = reach x gap x need / cost, computed three ways.

    priority     reach from all speakers
    priority_now reach from speakers who can use the technology today (see users)
    priority_5y  reach from those expected to in five years, times momentum:
                 1 + log2(growth in users) / 2, capped at 2, so a user base set to
                 double scores 1.5x and one set to quadruple scores 2x
    need:  1 minus the language's current score for that technology (or its
           overall LTDI where unmeasured), floored at 0.1, so the same gap matters
           more where support is weakest.
    """
    facts = facts or {}
    tech = scores["dimensions"]["tech"]["indicators"]
    for o in opps:
        t = TYPES[o["type"]]
        if o["technology"] in tech:
            current = tech[o["technology"]]
        elif o["technology"] == "writing":
            current = scores["dimensions"]["writing"]["score"]
        elif o["technology"] == "data":
            current = scores["dimensions"]["data"]["score"]
        else:
            current = scores["ltdi"]
        need = max(0.1, 1 - current)
        cost = o.get("cost") or t["cost"]  # a rule can override its type's cost (an assistant is a bigger build)
        base = o["gap"] * need / cost
        u = users(lang, facts, o["technology"])
        momentum = min(2.0, 1 + math.log2(u["5y"] / u["now"]) / 2) if u["now"] > 0 and u["5y"] > u["now"] else 1.0
        o["users"] = {k: (round(v) if isinstance(v, float) else v) for k, v in u.items()}
        o["need"] = round(need, 3)
        o["cost"] = cost
        o["reach"] = {"speakers": round(_reach(u["speakers"]), 3), "now": round(_reach(u["now"]), 3),
                      "5y": round(_reach(u["5y"]), 3)}
        o["momentum"] = round(momentum, 3)
        o["priority"] = round(_reach(u["speakers"]) * base, 3)
        o["priority_now"] = round(_reach(u["now"]) * base, 3)
        o["priority_5y"] = round(_reach(u["5y"]) * base * momentum, 3)
        o["workstream"] = t["workstream"]
    return sorted(opps, key=lambda o: (-o["priority_5y"], o.get("key", "")))  # ties in rule-name order, so output is stable


@lru_cache(maxsize=1)
def resources() -> dict[str, dict]:
    with (CONFIG / "resources.csv").open(encoding="utf-8") as f:
        return {r["indicator"]: r for r in csv.DictReader(f)}


def _size(fact: Record) -> str:
    v, u = fact.value, fact.unit
    if u == "hours":
        return _hours(v) + " of transcribed speech"
    if u == "words":
        return _words(v) + " words"
    if u == "articles":
        return _words(v) + " articles"
    if u == "editors":
        return f"{v:.0f} active editors"
    if u == "level 0-3":
        return ["no locale data", "basic coverage", "moderate coverage", "modern coverage"][int(v)]
    return "covers this language"


def _people(n: float) -> str:
    for size, unit in ((1e9, "billion"), (1e6, "million"), (1e3, "thousand")):
        if n >= size:
            return f"{n / size:.0f} {unit}" if n / size >= 10 else f"{n / size:.1f} {unit}"
    return f"{n:.0f}"


def starter_kit(o: dict, facts: dict[str, Record]) -> list[dict]:
    res = resources()
    return [{"indicator": i, "name": res[i]["name"], "what": res[i]["what"], "licence": res[i]["licence"],
             "link": res[i]["link"], "size": _size(facts[i])} for i in o["starter"] if i in res and i in facts]


def explain(lang: dict, o: dict, facts: dict[str, Record]) -> str:
    """One plain sentence or three on why this opportunity matters."""
    u = o.get("users", {})
    name = lang["name"]
    if u.get("estimated"):
        who = "online and able to text" if u["kind"] == "text" else "online"
        if u["5y"] > u["now"] * 1.05:
            people = (f"About {_people(u['now'])} {name} speakers are {who} today, and that should reach "
                      f"{_people(u['5y'])} within five years.")
        else:
            people = f"About {_people(u['now'])} {name} speakers are {who} today."
    elif lang.get("speakers"):
        people = f"{name} has about {_people(lang['speakers'])} speakers."
    else:
        people = f"LinguaMeta has no speaker count for {name}, so this can't be ranked by reach yet."
    kit = [k for k in starter_kit(o, facts) if k["indicator"] not in ("kb_gboard", "wikipedia_active_editors")]
    ready = ""
    if kit and o["type"] != "collect":
        ready = " Ready to use: " + "; ".join(f"{k['name']} ({k['size']})" for k in kit[:2]) + "."
    return f"{people}{ready}"


def reach_by_country(lang: dict, countries: dict[str, dict[str, float]]) -> list[dict]:
    rows = []
    for c in lang["countries"]:
        d = countries.get(c["code"], {})
        if not c.get("speakers") or "internet" not in d:
            continue
        phone, text = d.get("phone"), d.get("can_text")
        ability = min(1.0, text / phone) if phone and text is not None else (d["literacy"] / 100 if "literacy" in d else 1.0)
        rows.append({"code": c["code"], "name": c["name"], "speakers": c["speakers"],
                     "online": round(d["internet"] / 100, 3), "text": round(d["internet"] / 100 * ability, 3),
                     "online_5y": round(d.get("internet_5y", d["internet"]) / 100, 3)})
    return sorted(rows, key=lambda r: -r["speakers"])[:6]
