"""OpenAI's published language lists: ChatGPT's supported languages and the API's text-to-speech languages.

Both pages are read by hand (they aren't reachable by the collectors' fetcher), so the lists below are
transcribed from them as published on the retrieval date; check them against the pages each edition.

  ChatGPT: help.openai.com "How to change your language setting in ChatGPT" lists the languages ChatGPT
  currently supports, which counts like the Gemini and Copilot app language lists.
  ChatGPT Voice: the app's Voice language setting, read from the app (help.openai.com publishes no list);
  counted as a voice assistant.
  Text to speech: the API guide's "Supported languages" section ("The TTS model generally follows the
  Whisper model in terms of language support").
"""

from __future__ import annotations

from ..records import Record
from ._common import ltdi_codes
from .vendors import UNRESOLVED, named, save_entries

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

# ChatGPT Voice's language setting (Settings, Voice, Language), read from the app; counted as a voice assistant
VOICE = "https://help.openai.com/en/articles/20001274-chatgpt-voice"
VOICE_RETRIEVED = "2026-11-24"
VOICE_LANGS = """Afrikaans, Amharic, Arabic, Armenian, Azerbaijani, Bangla, Belarusian, Bosnian, Bulgarian, Burmese, Cantonese,
Catalan, Croatian, Czech, Danish, Dutch, English, Estonian, Filipino, Finnish, French, Galician, Georgian, German, Greek,
Gujarati, Hebrew, Hindi, Hungarian, Icelandic, Indonesian, Irish, Italian, Japanese, Kannada, Kazakh, Korean, Latvian,
Lithuanian, Macedonian, Malay, Malayalam, Mandarin Chinese, Māori, Marathi, Mongolian, Nepali, Norwegian, Norwegian Bokmål,
Persian, Polish, Portuguese, Romanian, Russian, Serbian, Chinese (Simplified), Slovak, Slovenian, Somali, Spanish, Swahili,
Swedish, Tamil, Telugu, Thai, Chinese (Traditional Hong Kong), Chinese (Traditional Taiwan), Turkish, Ukrainian, Urdu,
Vietnamese, Welsh"""
VOICE_NOTE = ("Read from the ChatGPT app's Voice language setting on 24 November 2026: 72 entries. The ChatGPT Voice "
              "article linked publishes no list.")

TTS_LANGS = """Afrikaans, Arabic, Armenian, Azerbaijani, Belarusian, Bosnian, Bulgarian, Catalan, Chinese, Croatian,
Czech, Danish, Dutch, English, Estonian, Finnish, French, Galician, German, Greek, Hebrew, Hindi, Hungarian,
Icelandic, Indonesian, Italian, Japanese, Kannada, Kazakh, Korean, Latvian, Lithuanian, Macedonian, Malay, Marathi,
Maori, Nepali, Norwegian, Persian, Polish, Portuguese, Romanian, Russian, Serbian, Slovak, Slovenian, Spanish, Swahili,
Swedish, Tagalog, Tamil, Thai, Turkish, Ukrainian, Urdu, Vietnamese, Welsh"""


def _names(s: str) -> list[str]:
    return [n.strip() for n in s.replace("\n", " ").split(",") if n.strip()]


def collect() -> list[Record]:
    out = []
    save_entries({"llm_app_chatgpt": len(set(_names(CHATGPT_LANGS))), "tts_openai": len(set(_names(TTS_LANGS))),
                  "va_chatgpt_voice": len(set(_names(VOICE_LANGS)))})
    for ind, source, url, names in (
            ("llm_app_chatgpt", "ChatGPT supported languages", CHATGPT, _names(CHATGPT_LANGS) + CHATGPT_EXTRA),
            ("tts_openai", "OpenAI API text to speech", TTS, _names(TTS_LANGS))):
        have = named(names, ind)
        out += [Record(c, ind, int(c in have), "bool", source, url, RETRIEVED, "manual") for c in ltdi_codes()]
    have = named(_names(VOICE_LANGS), "va_chatgpt_voice")
    out += [Record(c, "va_chatgpt_voice", int(c in have), "bool", "ChatGPT Voice's language setting", VOICE, VOICE_RETRIEVED,
                   "manual", VOICE_NOTE) for c in ltdi_codes()]
    for ind, names in UNRESOLVED.items():
        print(f"  unresolved for {ind}: {sorted(names)}")
    return out
