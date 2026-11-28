"""Google Translate: the languages in its language menu (machine translation, mt_google).

Read by hand from the Translate web app's language menu (translate.google.com) on the date in
RETRIEVED: 249 entries, the languages people can translate between in Google's own product. The
Cloud Translation API documentation lists fewer, so the app's menu is used, as the ChatGPT and
Claude entries use their apps' settings. Check the menu each edition.

Run:  python -m ltdi.collectors translate_app
"""

from __future__ import annotations

from ..records import Record
from ._common import ltdi_codes
from .vendors import UNRESOLVED, named, save_entries

RETRIEVED = "2026-11-27"
URL = "https://translate.google.com"
NOTE = "Read from the Translate web app's language menu on 27 November 2026: 249 entries."

# The menu's names where they differ from the Index's, or where the plain name would match another
# language (Minang is Minangkabau here; plain "Tamazight" is the Latin-script entry, Central Atlas).
# Marwadi is Marwari of India (rwr), which the name alone doesn't settle; "Zapotec" names no one
# Zapotec language, so it's left out.
ALIASES = {"Minang": "Minangkabau", "Tamazight": "Tamazight (Latin)", "Inuktut (Latin)": "Inuktitut",
           "Inuktut (Syllabics)": "Inuktitut", "Jingpo": "Kachin", "Makassar": "Makasar",
           "Nahuatl (Eastern Huasteca)": "Eastern Huasteca Nahuatl",
           "Nepalbhasa (Newari)": "Newari", "Sami (North)": "Northern Sami"}

MENU = """Abkhaz
Acehnese
Acholi
Afar
Afrikaans
Albanian
Alur
Amharic
Arabic
Armenian
Assamese
Avar
Awadhi
Aymara
Azerbaijani
Balinese
Baluchi
Bambara
Baoulé
Bashkir
Basque
Batak Karo
Batak Simalungun
Batak Toba
Belarusian
Bemba
Bengali
Betawi
Bhojpuri
Bikol
Bosnian
Breton
Bulgarian
Buryat
Cantonese
Catalan
Cebuano
Chamorro
Chechen
Chichewa
Chinese (Simplified)
Chinese (Traditional)
Chuukese
Chuvash
Corsican
Crimean Tatar (Cyrillic)
Crimean Tatar (Latin)
Croatian
Czech
Danish
Dari
Dhivehi
Dinka
Dogri
Dombe
Dutch
Dyula
Dzongkha
English
Esperanto
Estonian
Ewe
Faroese
Fijian
Filipino
Finnish
Fon
French
French (Canada)
Frisian
Friulian
Fulani
Ga
Galician
Georgian
German
Greek
Guarani
Gujarati
Haitian Creole
Hakha Chin
Hausa
Hawaiian
Hebrew
Hiligaynon
Hindi
Hmong
Hungarian
Hunsrik
Iban
Icelandic
Igbo
Ilocano
Indonesian
Inuktut (Latin)
Inuktut (Syllabics)
Irish
Italian
Jamaican Patois
Japanese
Javanese
Jingpo
Kalaallisut
Kannada
Kanuri
Kapampangan
Kazakh
Khasi
Khmer
Kiga
Kikongo
Kinyarwanda
Kituba
Kokborok
Komi
Konkani
Korean
Krio
Kurdish (Kurmanji)
Kurdish (Sorani)
Kyrgyz
Lao
Latgalian
Latin
Latvian
Ligurian
Limburgish
Lingala
Lithuanian
Lombard
Luganda
Luo
Luxembourgish
Macedonian
Madurese
Maithili
Makassar
Malagasy
Malay
Malay (Jawi)
Malayalam
Maltese
Mam
Manx
Maori
Marathi
Marshallese
Marwadi
Mauritian Creole
Meadow Mari
Meiteilon (Manipuri)
Minang
Mizo
Mongolian
Myanmar (Burmese)
Nahuatl (Eastern Huasteca)
Ndau
Ndebele (South)
Nepalbhasa (Newari)
Nepali
NKo
Norwegian
Nuer
Occitan
Odia (Oriya)
Oromo
Ossetian
Pangasinan
Papiamento
Pashto
Persian
Polish
Portuguese (Brazil)
Portuguese (Portugal)
Punjabi (Gurmukhi)
Punjabi (Shahmukhi)
Quechua
Qʼeqchiʼ
Romani
Romanian
Rundi
Russian
Sami (North)
Samoan
Sango
Sanskrit
Santali (Latin)
Santali (Ol Chiki)
Scots Gaelic
Sepedi
Serbian
Sesotho
Seychellois Creole
Shan
Shona
Sicilian
Silesian
Sindhi
Sinhala
Slovak
Slovenian
Somali
Spanish
Sundanese
Susu
Swahili
Swati
Swedish
Tahitian
Tajik
Tamazight
Tamazight (Tifinagh)
Tamil
Tatar
Telugu
Tetum
Thai
Tibetan
Tigrinya
Tiv
Tok Pisin
Tongan
Tshiluba
Tsonga
Tswana
Tulu
Tumbuka
Turkish
Turkmen
Tuvan
Twi
Udmurt
Ukrainian
Urdu
Uyghur
Uzbek
Venda
Venetian
Vietnamese
Waray
Welsh
Wolof
Xhosa
Yakut
Yiddish
Yoruba
Yucatec Maya
Zapotec
Zulu"""


def collect() -> list[Record]:
    menu = [n for n in MENU.split("\n") if n.strip()]
    save_entries({"mt_google": len(menu)})
    have = named([ALIASES.get(n, n) for n in menu if n not in ("Marwadi", "Zapotec")], "mt_google")
    have |= {"rwr"} if "Marwadi" in menu else set()
    for ind, names in UNRESOLVED.items():
        print(f"  unresolved for {ind}: {sorted(names)}")
    return [Record(c, "mt_google", int(c in have), "bool", "Google Translate's language menu", URL, RETRIEVED,
                   "manual", NOTE) for c in ltdi_codes()]
