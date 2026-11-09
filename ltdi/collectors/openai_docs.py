"""OpenAI's published language lists: ChatGPT's supported languages and the API's text-to-speech languages.

Both pages are read by hand (they aren't reachable by the collectors' fetcher), so the lists below are
transcribed from them as published on the retrieval date; check them against the pages each edition.

  ChatGPT: help.openai.com "How to change your language setting in ChatGPT" lists the languages ChatGPT
  currently supports, which counts like the Gemini and Copilot app language lists.
  Text to speech: the API guide's "Supported languages" section ("The TTS model generally follows the
  Whisper model in terms of language support").
"""

from __future__ import annotations

from ..records import Record
from ._common import ltdi_codes
from .vendors import UNRESOLVED, named

RETRIEVED = "2026-11-09"
CHATGPT = "https://help.openai.com/en/articles/8357869-how-to-change-your-language-setting-in-chatgpt"
TTS = "https://developers.openai.com/api/docs/guides/text-to-speech"

CHATGPT_LANGS = """Albanian, Amharic, Arabic, Armenian, Bengali, Bosnian, Bulgarian, Burmese, Catalan, Chinese, Croatian,
Czech, Danish, Dutch, Estonian, Finnish, French, Georgian, German, Greek, Gujarati, Hindi, Hungarian, Icelandic,
Indonesian, Italian, Japanese, Kannada, Kazakh, Korean, Latvian, Lithuanian, Macedonian, Malay, Malayalam, Marathi,
Mongolian, Norwegian, Persian, Polish, Portuguese, Punjabi, Romanian, Russian, Serbian, Slovak, Slovenian, Somali,
Spanish, Swahili, Swedish, Tagalog, Tamil, Telugu, Thai, Turkish, Ukrainian, Urdu, Vietnamese"""
# English isn't named in the list (it's the default language)
CHATGPT_EXTRA = ["English"]

TTS_LANGS = """Afrikaans, Arabic, Armenian, Azerbaijani, Belarusian, Bosnian, Bulgarian, Catalan, Chinese, Croatian,
Czech, Danish, Dutch, English, Estonian, Finnish, French, Galician, German, Greek, Hebrew, Hindi, Hungarian,
Icelandic, Indonesian, Italian, Japanese, Kannada, Kazakh, Korean, Latvian, Lithuanian, Macedonian, Malay, Marathi,
Maori, Nepali, Norwegian, Persian, Polish, Portuguese, Romanian, Russian, Serbian, Slovak, Slovenian, Spanish, Swahili,
Swedish, Tagalog, Tamil, Thai, Turkish, Ukrainian, Urdu, Vietnamese, Welsh"""


def _names(s: str) -> list[str]:
    return [n.strip() for n in s.replace("\n", " ").split(",") if n.strip()]


def collect() -> list[Record]:
    out = []
    for ind, source, url, names in (
            ("llm_app_chatgpt", "ChatGPT supported languages", CHATGPT, _names(CHATGPT_LANGS) + CHATGPT_EXTRA),
            ("tts_openai", "OpenAI API text to speech", TTS, _names(TTS_LANGS))):
        have = named(names, ind)
        out += [Record(c, ind, int(c in have), "bool", source, url, RETRIEVED, "manual") for c in ltdi_codes()]
    for ind, names in UNRESOLVED.items():
        print(f"  unresolved for {ind}: {sorted(names)}")
    return out
