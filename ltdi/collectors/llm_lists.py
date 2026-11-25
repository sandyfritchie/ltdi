"""Official language lists of the other global LLM services: Claude, Meta AI (Llama), Mistral and Qwen.

Each is the provider's own published list, transcribed from the page on the retrieval date (most of these
pages aren't reachable by the collectors' fetcher); check them against the pages each edition. The lists
are of different kinds, as the providers publish them, and say so in the service's "kind":

  Claude      The apps' language setting (the interface), read from the setting itself (Settings, Language)
              on the date in DATES: 35 languages. support.claude.com "How to use Claude in your preferred
              language" lists only 11 of them, so it lags the app; it says "you can still chat with Claude in
              any language". ChatGPT's list (openai_docs.py) is likewise its app's language setting.
  Meta AI     Llama 4's model card: its 12 supported languages, the model behind Meta AI. Meta publishes
              no current list for the Meta AI app itself. The card says Llama 4 was pre-trained on 200
              languages and that use beyond the 12 is out of scope unless fine-tuned.
  Mistral     docs.mistral.ai "Languages": the language models' "languages with strong expected
              performance", which "can also perform well in additional languages not listed". English,
              not named in the regional table, is added.
  Qwen        The Qwen3 announcement's table of 119 languages and dialects, the latest list Qwen has
              published. Qwen3.5 (2026) says it supports 201 but publishes no list.
  Tiny Aya    docs.cohere.com "Tiny Aya": the open-weight model's supported languages (Cohere Labs,
              2026, CC BY-NC 4.0), counted as an open model. The page says 70 and names 67.

Left out, since their makers publish no list of languages: Gemma 4 ("35+ out of the box, pre-trained on
140+"), Meta's Muse Glimmer ("more than 100"), DeepSeek and Grok.
"""

from __future__ import annotations

from ..records import Record
from ._common import ltdi_codes
from .vendors import UNRESOLVED, named, save_entries

RETRIEVED = "2026-11-21"
DATES = {"llm_app_claude": "2026-11-24"}  # a list read on another day
NOTES = {}  # filled below: what a record should say about where its list came from

CLAUDE = "https://support.claude.com/en/articles/10769299"
# The setting's English names, in its order
CLAUDE_LANGS = """Amharic, Bangla, Bhojpuri, Chinese (Simplified), Chinese (Traditional), Danish, Dutch,
English (United States), Filipino, Finnish, French (France), German (Germany), Gujarati, Hausa, Hindi (India),
Indonesian (Indonesia), Italian (Italy), Japanese (Japan), Kannada, Korean (South Korea), Malayalam, Marathi,
Norwegian Bokmål, Portuguese (Brazil), Russian, Spanish (Latin America), Spanish (Spain), Swahili, Swedish, Tamil,
Telugu, Thai, Turkish, Ukrainian, Vietnamese"""
CLAUDE_NOTE = ("Read from the Claude app's Language setting on 24 November 2026: 35 languages. The help article "
               "linked lists 11 of them.")

LLAMA = "https://github.com/meta-llama/llama-models/blob/main/models/llama4/MODEL_CARD.md"
LLAMA_LANGS = "Arabic, English, French, German, Hindi, Indonesian, Italian, Portuguese, Spanish, Tagalog, Thai, Vietnamese"

MISTRAL = "https://docs.mistral.ai/resources/languages"
# The "Language models" table, by region (the OCR table below it is for Mistral OCR, not counted here)
MISTRAL_LANGS = """French, German, Spanish, Portuguese, Italian, Dutch, Polish, Czech, Danish, Finnish, Greek, Norwegian,
Romanian, Swedish, Croatian, Serbian, Ukrainian, Catalan, Breton,
Arabic, Farsi, Hebrew, Turkish, Urdu,
Hindi, Bengali, Gujarati, Kannada, Marathi, Nepali, Punjabi, Tamil, Telugu,
Indonesian, Lao, Malaysian, Tagalog, Thai, Vietnamese,
Chinese, Japanese, Korean, Russian"""
MISTRAL_EXTRA = ["English"]

QWEN = "https://qwenlm.github.io/blog/qwen3/"
# By family, as the table gives them; a language with varieties in brackets is listed once per variety
QWEN_LANGS = """English, French, Portuguese, German, Romanian, Swedish, Danish, Bulgarian, Russian, Czech, Greek, Ukrainian,
Spanish, Dutch, Slovak, Croatian, Polish, Lithuanian, Norwegian Bokmål, Norwegian Nynorsk, Persian, Slovenian, Gujarati,
Latvian, Italian, Occitan, Nepali, Marathi, Belarusian, Serbian, Luxembourgish, Venetian, Assamese, Welsh, Silesian,
Asturian, Chhattisgarhi, Awadhi, Maithili, Bhojpuri, Sindhi, Irish, Faroese, Hindi, Punjabi, Bengali, Oriya, Tajik,
Eastern Yiddish, Lombard, Ligurian, Sicilian, Friulian, Sardinian, Galician, Catalan, Icelandic, Tosk Albanian, Limburgish,
Dari, Afrikaans, Macedonian, Sinhala, Urdu, Magahi, Bosnian, Armenian,
Chinese, Cantonese, Burmese,
Arabic, Najdi Arabic, Levantine Arabic, Egyptian Arabic, Moroccan Arabic, Mesopotamian Arabic, Ta'izzi-Adeni Arabic,
Tunisian Arabic, Hebrew, Maltese,
Indonesian, Malay, Tagalog, Cebuano, Javanese, Sundanese, Minangkabau, Balinese, Banjar, Pangasinan, Iloko, Waray,
Tamil, Telugu, Kannada, Malayalam,
Turkish, North Azerbaijani, Northern Uzbek, Kazakh, Bashkir, Tatar,
Thai, Lao,
Finnish, Estonian, Hungarian,
Vietnamese, Khmer,
Japanese, Korean, Georgian, Basque, Haitian, Papiamento, Kabuverdianu, Tok Pisin, Swahili"""
# The table's "Chinese (Simplified Chinese, Traditional Chinese, Cantonese)" is Chinese and Cantonese here, and
# "Arabic (Standard, Najdi, ...)" Arabic and each named variety; "Waray (Philippines)" is Waray.

TINY_AYA = "https://docs.cohere.com/docs/tiny-aya"
TINY_AYA_LANGS = """English, Dutch, French, Italian, Portuguese, Romanian, Spanish, Czech, Polish, Ukrainian,
Russian, Greek, German, Danish, Swedish, Norwegian, Catalan, Galician, Welsh, Irish,
Basque, Croatian, Latvian, Lithuanian, Slovak, Slovenian, Estonian, Finnish, Hungarian, Serbian,
Bulgarian, Arabic, Persian, Urdu, Turkish, Maltese, Hebrew, Hindi, Marathi, Bengali,
Gujarati, Punjabi, Tamil, Telugu, Nepali, Tagalog, Malay, Indonesian, Vietnamese, Javanese,
Khmer, Thai, Lao, Chinese, Burmese, Japanese, Korean, Amharic, Hausa, Igbo,
Malagasy, Shona, Swahili, Wolof, Xhosa, Yoruba, Zulu"""

LISTS = (
    ("llm_app_claude", "Claude app's language setting", CLAUDE, CLAUDE_LANGS, []),
    ("llm_app_meta", "Llama 4 supported languages (Meta AI)", LLAMA, LLAMA_LANGS, []),
    ("llm_app_mistral", "Mistral language models' languages", MISTRAL, MISTRAL_LANGS, MISTRAL_EXTRA),
    ("llm_app_qwen", "Qwen3 languages and dialects", QWEN, QWEN_LANGS, []),
    ("llm_open_aya", "Tiny Aya supported languages (Cohere Labs)", TINY_AYA, TINY_AYA_LANGS, []),
)


NOTES["llm_app_claude"] = CLAUDE_NOTE


def _names(s: str) -> list[str]:
    return [n.strip() for n in s.replace("\n", " ").split(",") if n.strip()]


def collect() -> list[Record]:
    out = []
    save_entries({ind: len(set(_names(names))) for ind, _, _, names, _ in LISTS})  # the list's own entries, not extras
    for ind, source, url, names, extra in LISTS:
        have = named(_names(names) + extra, ind)
        out += [Record(c, ind, int(c in have), "bool", source, url, DATES.get(ind, RETRIEVED), "manual", NOTES.get(ind, ""))
                for c in ltdi_codes()]
    for ind, names in UNRESOLVED.items():
        print(f"  unresolved for {ind}: {sorted(names)}")
    return out
