"""Speech services sold worldwide by speech specialists: ElevenLabs, Deepgram, AssemblyAI and Speechmatics.

Each list is read from the provider's own documentation, in the Markdown version of the page that each
documentation site publishes (the page's URL with .md added):

  ElevenLabs   speech to text: Scribe's supported languages, with any named only in the accuracy table
               (Yoruba); text to speech: Eleven v4's and Eleven v3's supported languages
  Deepgram     speech to text: Nova-3, Nova-2 and the older general models (Nova, Enhanced, Base); not
               Deepgram's hosted Whisper, which is OpenAI's model and counted as Whisper. Text to speech:
               Aura's languages
  AssemblyAI   speech to text: the languages named in Universal-2's accuracy table. The page says Universal-2
               supports 99 languages but lists them only in a table drawn by script, which can't be read,
               so the 83 named in the accuracy table are counted
  Speechmatics speech to text: the transcription languages (not the bilingual packs, whose languages are
               listed singly). Its text to speech, in preview with English voices only, isn't counted

ElevenLabs and AssemblyAI also publish each language's word error rate as a band ("Moderate (>25% to ≤50%
WER)"). Each band is recorded at its midpoint (37.5 for 25-50%; 60 for "over 50%"), as asr_elevenlabs_wer
and asr_assemblyai_wer, and scales the service's credit as Whisper's FLEURS error rate does (services.csv).
Neither page says what the rates were measured on.

These hosts aren't reachable from every machine; the monthly collectors (GitHub Actions) refresh them.
"""

from __future__ import annotations

import re

from ..http import fetch
from ..records import Record
from ._common import ltdi_codes
from .vendors import UNRESOLVED, _read, code, named, save_entries

ELEVEN_STT = "https://elevenlabs.io/docs/overview/capabilities/speech-to-text.md"
ELEVEN_TTS_V4 = "https://elevenlabs.io/docs/overview/capabilities/text-to-speech/eleven-v4.md"
ELEVEN_TTS = "https://elevenlabs.io/docs/help-center/other/what-languages-do-you-support.md"
DEEPGRAM_STT = "https://developers.deepgram.com/docs/models-languages-overview.md"
DEEPGRAM_TTS = "https://developers.deepgram.com/docs/tts-models.md"
ASSEMBLY = "https://www.assemblyai.com/docs/pre-recorded-audio/supported-languages.md"
SPEECHMATICS = "https://docs.speechmatics.com/speech-to-text/languages.md"

META = {  # indicator: (source, url)
    "asr_elevenlabs": ("ElevenLabs Scribe speech to text", ELEVEN_STT),
    "tts_elevenlabs": ("ElevenLabs text to speech (Eleven v4, Eleven v3)", ELEVEN_TTS_V4),
    "asr_deepgram": ("Deepgram speech to text (Nova-3, Nova-2)", DEEPGRAM_STT),
    "tts_deepgram": ("Deepgram Aura text to speech", DEEPGRAM_TTS),
    "asr_assemblyai": ("AssemblyAI speech to text (Universal-2)", ASSEMBLY),
    "asr_speechmatics": ("Speechmatics speech to text", SPEECHMATICS),
}


def md(url: str) -> str:
    return fetch(url).decode("utf-8", "replace")


def section(text: str, start: str, end: str | None = None) -> str:
    i = text.index(start)
    j = text.find(end, i + len(start)) if end else -1
    return text[i:j if j > 0 else None]


def name_code(text: str) -> list[tuple[str, str]]:
    """'Afrikaans (afr), Amharic (amh) and Zulu (zul)' -> [(name, code), ...]; a name may hold its own
    brackets ('Fula (Pulaar) (ff)')."""
    return [(n.strip(" *,"), c) for n, c in re.findall(r"(?:^|[,*]|\band\b)\s*([^,*()]+(?:\([^()]*\))?)\s*\(([a-z]{2,3})\)", text)]


def by_codes(pairs: list[tuple[str, str]], speech: bool = True) -> set[str]:
    """LTDI codes for (name, code) pairs, by the code, or by the name where the code doesn't resolve."""
    out = set()
    for n, c in pairs:
        _read.add(n)
        got = code(c, speech, n) or next(iter(named([n], "", speech)), None)
        if got:
            out.add(got)
    return out


def band(heading: str) -> tuple[float, str] | None:
    """A WER band heading -> (midpoint, label): 'Moderate (>25% to ≤50% WER)' -> (37.5, '25-50%')."""
    nums = [float(x) for x in re.findall(r"(\d+(?:\.\d+)?)\s*%", heading)]
    if re.search(r"[≤<]\s*\d", heading) and len(nums) == 1 and not re.search(r">\s*\d", heading):
        return nums[0], f"{nums[0]:g}% or less"
    if len(nums) == 2:
        return (nums[0] + nums[1]) / 2, f"{nums[0]:g}\u2011{nums[1]:g}%"  # a non-breaking hyphen
    if len(nums) == 1:  # '>50% WER'
        return nums[0] + 10, f"over {nums[0]:g}%"
    return None


WER: dict[str, dict[str, tuple[float, str]]] = {}  # indicator: {code: (midpoint, band)}


V3_ONLY: set[str] = set()


def elevenlabs() -> tuple[set[str], set[str], int, int]:
    stt = md(ELEVEN_STT)
    listed = name_code(section(stt, "## Supported languages", "### Breakdown"))
    tiers = name_code(section(stt, "### Breakdown", "## FAQ"))
    wer = WER.setdefault("asr_elevenlabs_wer", {})
    for head, body in re.findall(r"#### ([^\n]+)\n+(.+?)(?=\n#### |\n## )", section(stt, "### Breakdown", "## FAQ") + "\n## ", flags=re.S):
        b = band(head)
        for c in (by_codes([p]) for p in name_code(body)) if b else ():
            for x in c:
                wer[x] = b
    seen = {c for _, c in listed}
    asr_pairs = listed + [(n, c) for n, c in tiers if c not in seen and c != "cmn"]  # cmn: Mandarin, listed as zho
    tts_pairs = name_code(section(md(ELEVEN_TTS_V4), "Which languages does Eleven v4 support", "> **Note**"))
    v3 = name_code(section(md(ELEVEN_TTS), "The Eleven v3 model supports", "> **Note**"))
    have = by_codes(tts_pairs)
    tts_pairs += [(n, c) for n, c in v3 if c not in {x for _, x in tts_pairs}]
    V3_ONLY.update(by_codes(tts_pairs) - have)  # cited to the page that names them
    return by_codes(asr_pairs), by_codes(tts_pairs), len(asr_pairs), len(tts_pairs)


def deepgram() -> tuple[set[str], set[str], int, int]:
    text = section(md(DEEPGRAM_STT), "## Nova-3", "## Deepgram Whisper Cloud")
    rows = [l for l in text.split("\n") if re.match(r"\|\s*`(nova-3|nova-2|nova|enhanced|base)`", l)]
    pairs = []
    for r in rows:
        for m in re.finditer(r"([A-Z][^:`|\[\]*]*?):\s*((?:`[^`]+`,?\s*)+)", r):
            name = re.sub(r"\d+$", "", m.group(1).strip(" ,"))  # 'Catalan1': a footnote mark
            if name.startswith("Multilingual"):
                continue
            pairs += [(name, c) for c in re.findall(r"`([^`]+)`", m.group(2))]
    asr = by_codes(pairs)
    # Nova-3's multilingual model names its languages in a list of its own: Xhosa is only there
    for r in rows:
        for m in re.finditer(r"Multilingual \(", r):
            depth, i, buf, names = 1, m.end(), "", []
            while i < len(r) and depth:
                ch = r[i]
                depth += (ch == "(") - (ch == ")")
                if depth == 1 and ch == ",":
                    names.append(buf); buf = ""
                elif depth:
                    buf += ch
                i += 1
            names.append(buf)
            asr |= named([re.sub(r"^and ", "", n.strip()) for n in names if n.strip()], "asr_deepgram", speech=True)
    tts = re.findall(r"\*\s+\*\*([^*(]+)\(([a-z]{2,3})\)\*\*", section(md(DEEPGRAM_TTS), "## Language support", "> **Info**"))
    return asr, by_codes([(n.strip(), c) for n, c in tts]), len({n for n, _ in pairs}), len(tts)


def assemblyai() -> tuple[set[str], int]:
    text = section(md(ASSEMBLY), "## Universal-2", "## Unsupported feature behavior")
    names = []
    for block in re.findall(r"> \[accordion\][^\n]*\n>\s*\n((?:>[^\n]*\n?)+)", text):
        names += [n.strip() for n in re.sub(r"^>\s?", "", block, flags=re.M).replace("\n", " ").split(",")]
    names = [re.sub(r"\s*\(Farsi\)$", "", n) for n in names if n]
    wer = WER.setdefault("asr_assemblyai_wer", {})
    for head, block in re.findall(r"> \[accordion\]([^\n]*)\n>\s*\n((?:>[^\n]*\n?)+)", text):
        b = band(head)
        for n in re.sub(r"^>\s?", "", block, flags=re.M).replace("\n", " ").split(","):
            for c in named([re.sub(r"\s*\(Farsi\)$", "", n.strip())], "", speech=True) if b and n.strip() else ():
                wer[c] = b
    return named(names, "asr_assemblyai", speech=True), len(names)


def speechmatics() -> tuple[set[str], int]:
    text = section(md(SPEECHMATICS), "## Transcription languages", "## Medical languages")
    pairs = []
    for name, c in re.findall(r"^\|\s*([^|]+?)\s*\|\s*`([a-z_]+)`", text, flags=re.M):
        if c == "auto" or "_" in c or ("&" in name and c != "tl"):  # bilingual packs: their languages are listed singly
            continue
        pairs.append((name.replace(" (Filipino) & English bilingual", ""), c))
    return by_codes(pairs), len(pairs)


def collect() -> list[Record]:
    e_asr, e_tts, e_asr_n, e_tts_n = elevenlabs()
    d_asr, d_tts, d_asr_n, d_tts_n = deepgram()
    a_asr, a_n = assemblyai()
    s_asr, s_n = speechmatics()
    found = {"asr_elevenlabs": e_asr, "tts_elevenlabs": e_tts, "asr_deepgram": d_asr, "tts_deepgram": d_tts,
             "asr_assemblyai": a_asr, "asr_speechmatics": s_asr}
    save_entries({"asr_elevenlabs": e_asr_n, "tts_elevenlabs": e_tts_n, "asr_deepgram": d_asr_n, "tts_deepgram": d_tts_n,
                  "asr_assemblyai": a_n, "asr_speechmatics": s_n})
    out = []
    for ind, (source, url) in META.items():
        if len(found[ind]) < (5 if ind == "tts_deepgram" else 20):
            raise RuntimeError(f"{ind}: only {len(found[ind])} languages read from {url}; has the page changed?")
        out += [Record(c, ind, int(c in found[ind]), "bool", source,
                       ELEVEN_TTS if ind == "tts_elevenlabs" and c in V3_ONLY else url, method="scrape") for c in ltdi_codes()]
    for ind, by in WER.items():
        who = "ElevenLabs" if "eleven" in ind else "AssemblyAI"
        url = ELEVEN_STT if "eleven" in ind else ASSEMBLY
        out += [Record(c, ind, mid, "WER band", f"{who}'s published word error rate band", url, method="scrape",
                       note=f"Word error rate {label}, as {who} publishes it") for c, (mid, label) in sorted(by.items())]
    for ind, names in UNRESOLVED.items():
        print(f"  unresolved for {ind or 'speech'}: {sorted(names)}")
    return out
