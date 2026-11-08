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

import math

from .records import Record

TYPES = {
    "share": {"label": "Share or ship", "cost": 1, "workstream": "Tools for builders"},
    "measure": {"label": "Measure", "cost": 1, "workstream": "Measurement"},
    "standardise": {"label": "Standardise", "cost": 1, "workstream": "Open language data"},
    "improve": {"label": "Improve", "cost": 2, "workstream": "Tools for builders"},
    "collect": {"label": "Collect", "cost": 3, "workstream": "Open language data"},
}

ASR = ["asr_google", "asr_azure", "asr_apple"]
MT = ["mt_google", "mt_azure", "mt_deepl"]
LLM = ["llm_global_mmlu_rel", "llm_mmmlu_openai"]


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
    """All opportunities for one language's facts. Each has type, technology, title, detail, gap, evidence."""
    out = []

    def add(type_, tech, title, detail, gap, evidence):
        if gap > 0:
            out.append({"type": type_, "technology": tech, "title": title, "detail": detail,
                        "gap": round(min(1.0, gap), 3), "evidence": [e for e in evidence if e in f]})

    cv = _v(f, "cv_validated_hours") or 0
    words = _v(f, "web_text_words") or 0

    # Keyboards
    if _v(f, "kb_gboard") and not _v(f, "kb_apple"):
        add("share", "keyboard", "A keyboard layout exists but isn't on every major platform",
            "A layout ships on Android but not yet on iOS. Contributing it to CLDR Keyboards, the open "
            "interchange format for layouts, would let any platform adopt it.",
            0.5, ["kb_gboard", "kb_apple"])
    feats = _v(f, "kb_apple_features")
    if _v(f, "kb_apple") and feats is not None and feats < 2 and words >= 1e7:
        add("share", "keyboard", "Predictive text and autocorrect could be built from open text",
            f"The iOS keyboard has {feats:.0f} of 4 typing features. FineWeb-2 holds about {_words(words)} words "
            "of openly licensed web text, enough to train word prediction.",
            (4 - feats) / 4, ["kb_apple_features", "web_text_words"])

    # Speech input
    asr_n = sum(1 for i in ASR if _v(f, i))
    if 0 < asr_n < len(ASR):
        add("share", "speech_input", f"Speech input is offered by {asr_n} of {len(ASR)} major services",
            f"Some services already recognise this language. Open training data includes {_hours(cv)} "
            "of transcribed speech on Common Voice.",
            (len(ASR) - asr_n) / len(ASR), ASR + ["cv_validated_hours"])
    elif asr_n == 0 and (cv >= 20 or _v(f, "asr_open_whisper")):
        add("share", "speech_input", "No major speech input service, though open resources exist",
            f"Common Voice holds {_hours(cv)} of transcribed speech"
            + (", and an open model lists the language" if _v(f, "asr_open_whisper") else "") + ".",
            1.0, ASR + ["cv_validated_hours", "asr_open_whisper"])
    wer = _v(f, "asr_whisper_fleurs_wer")
    if wer is not None and wer >= 100:
        add("measure", "speech_input", "No published speech recognition error rate",
            "The language isn't in the published FLEURS error-rate breakdowns we track, so builders can't "
            "tell how usable open speech recognition is.",
            1.0, ["asr_whisper_fleurs_wer"])
    elif wer is not None and wer >= 25:
        add("improve", "speech_input", f"Speech recognition makes about {wer:.0f} errors per 100 words",
            "Measured on FLEURS with a leading open model. Below about 15% is comfortably usable for dictation.",
            (wer - 10) / 40, ["asr_whisper_fleurs_wer"])
    if cv < 20:
        add("collect", "speech_input", f"Only {_hours(cv)} of open transcribed speech",
            "Common Voice is one source among several; other corpora may exist and should be checked first. "
            "Image-prompted field collection has worked at scale for Indian and African languages.",
            1 - cv / 20, ["cv_validated_hours"])

    # Text-to-speech
    if not _v(f, "tts_google"):
        if cv >= 10:
            add("share", "tts", "No cloud text-to-speech voice, though open speech data exists",
                f"Common Voice holds {_hours(cv)} of speech. Multi-speaker crowd recordings suit recognition "
                "more than synthesis, but open multilingual TTS models can adapt from them.",
                1.0, ["tts_google", "cv_validated_hours"])
        else:
            add("collect", "tts", "Record a single-speaker voice for text-to-speech",
                "No cloud voice exists and open speech data is thin. A few hours of clean single-speaker "
                "recordings would unlock a usable voice.",
                1.0, ["tts_google", "cv_validated_hours"])

    # Translation
    mt_n = sum(1 for i in MT if _v(f, i))
    if mt_n < len(MT) and (_v(f, "mt_open_nllb") or mt_n):
        add("share", "mt", f"Translation is offered by {mt_n} of {len(MT)} major services",
            "An open model and the FLORES-200 evaluation set already cover this language, so the main "
            "remaining step is a product launch.",
            (len(MT) - mt_n) / len(MT), MT + ["mt_open_nllb", "flores200"])

    # LLMs
    llm = [i for i in LLM if i in f]
    if not llm:
        add("measure", "llm", "No published LLM benchmark results",
            "Neither of the two multilingual benchmarks we track reports this language. Adding it would give "
            "builders and buyers a baseline.",
            1.0, [])
    else:
        rel = _v(f, "llm_global_mmlu_rel")
        acc = _v(f, "llm_mmmlu_openai")
        weak = [s for s in (f"{rel:.0f}% of English" if rel is not None and rel < 97 else None,
                            f"{acc * 100:.0f}% accuracy" if acc is not None and acc < 0.85 else None) if s]
        if weak:
            add("improve", "llm", "LLMs lag behind their English performance",
                "Benchmark results: " + "; ".join(weak) + ".", 0.5, llm)
    if not _v(f, "belebele"):
        add("measure", "llm", "No reading-comprehension benchmark",
            "Belebele, the widest multilingual reading benchmark, doesn't include this language yet.",
            0.5, ["belebele"])

    # Writing system
    cldr = _v(f, "cldr_coverage")
    if cldr is not None and cldr < 3:
        level = ["missing", "basic", "moderate"][int(cldr)]
        add("standardise", "writing", f"Locale data in Unicode CLDR is {level}",
            "Complete CLDR data (names, dates, numbers, character sets) underpins interface localisation, "
            "keyboards and reading numbers aloud in text-to-speech.",
            (3 - cldr) / 3, ["cldr_coverage"])

    # Text data
    if words and words < 1e8:
        add("collect", "data", f"Only about {_words(words)} words of open web text",
            "Little text online limits language models and word prediction. Digitising books and news archives "
            "is often the fastest route.",
            1 - math.log10(max(words, 1e4) / 1e4) / 4, ["web_text_words"])
    editors = _v(f, "wikipedia_active_editors")
    if editors is not None and editors < 100:
        add("collect", "data", f"Wikipedia has {editors:.0f} active editors",
            "A small editing community limits new open text. Edit-a-thons and translation drives with "
            "universities have grown communities elsewhere.",
            1 - editors / 100, ["wikipedia_active_editors"])
    return out


VOICE = {"speech_input", "tts"}  # usable without reading or writing


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
        base = o["gap"] * need / t["cost"]
        u = users(lang, facts, o["technology"])
        momentum = min(2.0, 1 + math.log2(u["5y"] / u["now"]) / 2) if u["now"] > 0 and u["5y"] > u["now"] else 1.0
        o["users"] = {k: (round(v) if isinstance(v, float) else v) for k, v in u.items()}
        o["momentum"] = round(momentum, 3)
        o["priority"] = round(_reach(u["speakers"]) * base, 3)
        o["priority_now"] = round(_reach(u["now"]) * base, 3)
        o["priority_5y"] = round(_reach(u["5y"]) * base * momentum, 3)
        o["workstream"] = t["workstream"]
    return sorted(opps, key=lambda o: -o["priority_5y"])
