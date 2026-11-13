"""Regional providers: language lists from each provider's official documentation.

These pages aren't reachable by the collectors' fetcher, so the lists are transcribed from them on
the retrieval date; check them against the pages each edition. Languages are given as the provider
gives them (codes where it lists codes, names where it lists names), and mapped to LTDI's codes by
the crosswalk. Constructed, historical and joke entries (Klingon, Elvish, Emoji, Old English) are
left out. Beta services count; "coming soon" ones don't.

Russia and Central Asia
  Yandex Translate     yandex.com/support/translate-app-android/supported-langs.html
  Yandex SpeechKit     aistudio.yandex.ru/docs/en/speechkit/stt/models (recognition),
                       aistudio.yandex.ru/en/docs/speechkit/tts/voices (synthesis)
East Asia
  Baidu Translate      ai.baidu.com/ai-doc/MT/4kqryjku9 (Baidu's own codes, mapped to ISO below)
  Alibaba Qwen-MT      alibabacloud.com/help/en/model-studio/machine-translation (qwen-mt-plus)
  Naver Papago         api.ncloud-docs.com/docs/en/ai-naver-papagonmt-translation
India
  Sarvam AI            docs.sarvam.ai/api-reference-docs/getting-started/models (Saaras speech
                       recognition, Bulbul v3 speech synthesis, Sarvam-Translate)
Africa
  Lelapa AI Vulavula   docs.lelapa.ai/overview/language-support
  GhanaNLP Khaya       khaya-sdk.readthedocs.io/en/latest/languages/ (the Khaya-AI organisation's SDK)
  Sunbird AI           docs.sunbird.ai/languages (Uganda)
"""

from __future__ import annotations

from ..crosswalk import to_ltdi
from ..names import resolve
from ..records import Record
from ._common import ltdi_codes

RETRIEVED = "2026-11-12"


def _codes(s: str) -> list[str]:
    return [c.strip() for c in s.replace("\n", " ").split(",") if c.strip()]


YANDEX_TRANSLATE = "https://yandex.com/support/translate-app-android/supported-langs.html"
YANDEX_TRANSLATE_NAMES = """Azerbaijani, Albanian, Amharic, English, Arabic, Armenian, Afrikaans, Basque, Bashkir,
Belarusian, Bengali, Burmese, Bulgarian, Bosnian, Welsh, Hungarian, Vietnamese, Haitian Creole, Galician, Hill Mari,
Greek, Georgian, Gujarati, Danish, Hebrew, Yiddish, Indonesian, Irish, Icelandic, Spanish, Italian, Kazakh, Kannada,
Catalan, Kyrgyz, Chinese, Korean, Xhosa, Khmer, Lao, Latin, Latvian, Lithuanian, Luxembourgish, Macedonian, Malagasy,
Malay, Malayalam, Maltese, Maori, Marathi, Meadow Mari, Mongolian, German, Nepali, Dutch, Norwegian, Ossetian, Punjabi,
Papiamento, Persian, Polish, Portuguese, Romanian, Russian, Cebuano, Serbian, Sinhala, Slovak, Slovenian, Swahili,
Sundanese, Tagalog, Tajik, Thai, Tamil, Tatar, Telugu, Turkish, Udmurt, Uzbek, Ukrainian, Urdu, Finnish, French, Hindi,
Croatian, Czech, Chuvash, Swedish, Scottish Gaelic, Esperanto, Estonian, Javanese, Yakut, Japanese"""
# The page's "Mari" is Meadow Mari, "Farsi" Persian, "Sinhalese" Sinhala, "Scottish (Gaelic)" Scottish Gaelic;
# "Elvish (Sindarin)" and "Emoji" are left out

YANDEX_STT = "https://aistudio.yandex.ru/docs/en/speechkit/stt/models"
YANDEX_STT_CODES = "de-DE, en-US, es-ES, fi-FI, fr-FR, he-IL, it-IT, kk-KZ, nl-NL, pl-PL, pt-PT, pt-BR, ru-RU, sv-SE, tr-TR, uz-UZ"
YANDEX_TTS = "https://aistudio.yandex.ru/en/docs/speechkit/tts/voices"
YANDEX_TTS_CODES = "de-DE, en-US, he-IL, kk-KZ, ru-RU, uz-UZ"

BAIDU = "https://ai.baidu.com/ai-doc/MT/4kqryjku9"
# Baidu's own code -> ISO 639 code, for every entry on the page except constructed and historical
# languages (Klingon kli, Lojban loj, Interlingua ina, Ido ido, Ancient Greek gra, Old English eno,
# Middle French frm, Classical Chinese wyw), regional spellings of a language already listed
# (Brazilian Portuguese pot, Canadian French frn, Traditional Chinese cht, Serbian in Cyrillic src),
# and the groupings Berber (ber) and Serbo-Croatian (sec)
BAIDU_CODES = {
    "ara": "ar", "gle": "ga", "oci": "oc", "alb": "sq", "arq": "arq", "aka": "ak", "arg": "an", "amh": "am",
    "asm": "as", "aym": "ay", "aze": "az", "ast": "ast", "oss": "os", "est": "et", "oji": "oj", "ori": "or",
    "orm": "om", "pl": "pl", "per": "fa", "bre": "br", "bak": "ba", "baq": "eu", "bel": "be", "pam": "pam",
    "bul": "bg", "sme": "se", "ped": "nso", "bem": "bem", "bli": "byn", "bis": "bi", "bal": "bal", "ice": "is",
    "bos": "bs", "bho": "bho", "chv": "cv", "tso": "ts", "dan": "da", "de": "de", "tat": "tt", "sha": "shn",
    "tet": "tet", "div": "dv", "log": "nds", "ru": "ru", "fra": "fr", "fil": "fil", "fin": "fi", "san": "sa",
    "fri": "fur", "ful": "ff", "fao": "fo", "gla": "gd", "kon": "kg", "ups": "hsb", "hkm": "km", "kal": "kl",
    "geo": "ka", "guj": "gu", "grn": "gn", "kor": "ko", "nl": "nl", "hup": "hup", "hak": "cnh", "ht": "ht",
    "mot": "cnr", "hau": "ha", "kir": "ky", "glg": "gl", "cat": "ca", "cs": "cs", "kab": "kab", "kan": "kn",
    "kau": "kr", "kah": "csb", "cor": "kw", "xho": "xh", "cos": "co", "cre": "cr", "cri": "crh", "hrv": "hr",
    "que": "qu", "kas": "ks", "kok": "kok", "kur": "ku", "lat": "la", "lao": "lo", "rom": "ro", "lag": "ltg",
    "lav": "lv", "lim": "li", "lin": "ln", "lug": "lg", "ltz": "lb", "ruy": "rue", "kin": "rw", "lit": "lt",
    "roh": "rm", "ro": "rom", "may": "ms", "bur": "my", "mar": "mr", "mg": "mg", "mal": "ml", "mac": "mk",
    "mah": "mh", "mai": "mai", "glv": "gv", "mau": "mfe", "mao": "mi", "ben": "bn", "mlt": "mt", "hmn": "hmn",
    "nor": "no", "nea": "nap", "nbl": "nr", "afr": "af", "sot": "st", "nep": "ne", "pt": "pt", "pan": "pa",
    "pap": "pap", "pus": "ps", "nya": "ny", "twi": "tw", "chr": "chr", "jp": "ja", "swe": "sv", "srd": "sc",
    "sm": "sm", "srp": "sr", "sol": "son", "sin": "si", "epo": "eo", "nob": "nb", "sk": "sk", "slo": "sl",
    "swa": "sw", "som": "so", "sco": "sco", "th": "th", "tr": "tr", "tgk": "tg", "tam": "ta", "tgl": "tl",
    "tir": "ti", "tel": "te", "tua": "aeb", "tuk": "tk", "ukr": "uk", "wln": "wa", "wel": "cy", "ven": "ve",
    "wol": "wo", "urd": "ur", "spa": "es", "heb": "he", "el": "el", "hu": "hu", "fry": "fy", "sil": "szl",
    "hil": "hil", "los": "dsb", "haw": "haw", "nno": "nn", "nqo": "nqo", "snd": "sd", "sna": "sn", "ceb": "ceb",
    "syr": "syr", "sun": "su", "en": "en", "hi": "hi", "id": "id", "it": "it", "vie": "vi", "yid": "yi",
    "ach": "ace", "ing": "inh", "ibo": "ig", "yor": "yo", "arm": "hy", "iku": "iu", "zh": "zh", "yue": "yue",
    "zaz": "zza", "zul": "zu", "jav": "jv",
}

ALIBABA = "https://www.alibabacloud.com/help/en/model-studio/machine-translation"
ALIBABA_CODES = """en, zh, ru, ja, ko, es, fr, pt, de, it, th, vi, id, ms, ar, hi, he, my, ta, ur, bn, pl, nl, ro, tr,
km, lo, yue, cs, el, sv, hu, da, fi, uk, bg, sr, te, af, hy, as, ast, eu, be, bs, ca, ceb, hr, arz, et, gl, ka, gu,
is, jv, kn, kk, lv, lt, lb, mk, mai, mt, mr, acm, ary, ars, ne, az, apc, uz, nb, nn, oc, or, pag, scn, sd, si, sk, sl,
ajp, sw, tl, acq, sq, aeb, vec, war, cy, fa"""

PAPAGO = "https://api.ncloud-docs.com/docs/en/ai-naver-papagonmt-translation"
PAPAGO_CODES = "ko, en, ja, zh-CN, vi, th, id, fr, es, ru, de, it"

SARVAM = "https://docs.sarvam.ai/api-reference-docs/getting-started/models"
SARVAM_23 = """hi, bn, kn, ml, mr, or, pa, ta, te, en, gu, as, ur, ne, kok, ks, sd, sa, sat, mni, brx, mai, doi"""
SARVAM_TTS = "hi, bn, ta, te, gu, en, kn, ml, mr, pa, or"   # Bulbul v3 (the page's Odia code is od-IN)

LELAPA = "https://docs.lelapa.ai/overview/language-support"
LELAPA_ASR = "zul, eng, sot, afr, fra"                        # production ready and beta
LELAPA_MT = "zul, eng, sot, afr, swh, yor, hau, xho, nso"     # production ready and beta

KHAYA = "https://khaya-sdk.readthedocs.io/en/latest/languages/"
KHAYA_MT = "en, dag, ee, fat, gaa, gur, ki, mer, kus, luo, tw, yo"
KHAYA_ASR = """eng, fra, atw, bwu, dga, dag, ada, ewe, fat, gaa, gjn, gur, hau, ibo, xsm, kik, kin, xon, kri, kus, luo,
maw, men, mer, pcm, nzi, sna, swa, tem, twi, wlx, wol, yor"""
KHAYA_TTS = """atw, twi, dga, dag, ada, eng, ewe, fat, fra, gaa, gjn, gur, hau, ibo, xsm, kik, lxn, xon, kri, kus, luo,
maw, men, mer, nzi, pcm, sna, swa, tem, wlx, wol, yor"""

SUNBIRD = "https://docs.sunbird.ai/languages"
SUNBIRD_TTS = """ach, afr, teo, eng, ewe, ful, hau, ibo, kik, kin, lin, lug, luo, nyn, swa, xho, yor"""  # with voices
SUNBIRD_ASR = """ach, afr, aka, amh, teo, bam, bem, nya, dga, dag, eng, ewe, fra, ful, hau, ibo, kpo, kab, kln, kau,
kik, kin, rwm, led, lin, lgg, lug, luy, myx, luo, xog, mlg, nbl, pcm, orm, cgg, koo, nyn, ruc, ttj, sot, tsn, sna, som,
swa, lth, wol, xho, yor, zul"""
SUNBIRD_MT = """ach, afr, aka, alz, amh, luc, teo, bam, bfa, bem, nya, dga, dag, din, eng, ewe, ful, hau, ibo, ikx, adh,
kab, keo, kln, kau, kdj, kik, kin, run, kdi, kpz, rwm, laj, led, lin, tlj, lgg, rub, gwr, lug, luy, myx, nuj, luo, xog,
mhi, mlg, nbl, pcm, orm, pok, cgg, koo, nyn, nyo, ruc, ttj, lsm, sot, tsn, sna, som, swa, wol, xho, yor, zul"""

# (indicator, source, url, labels, labels are names rather than codes)
LISTS = [
    ("mt_yandex", "Yandex Translate", YANDEX_TRANSLATE, _codes(YANDEX_TRANSLATE_NAMES), True),
    ("asr_yandex", "Yandex SpeechKit", YANDEX_STT, _codes(YANDEX_STT_CODES), False),
    ("tts_yandex", "Yandex SpeechKit", YANDEX_TTS, _codes(YANDEX_TTS_CODES), False),
    ("mt_baidu", "Baidu Translate", BAIDU, list(BAIDU_CODES.values()), False),
    ("mt_alibaba", "Alibaba Cloud Qwen-MT", ALIBABA, _codes(ALIBABA_CODES), False),
    ("mt_papago", "Naver Papago", PAPAGO, _codes(PAPAGO_CODES), False),
    ("asr_sarvam", "Sarvam AI Saaras", SARVAM, _codes(SARVAM_23), False),
    ("tts_sarvam", "Sarvam AI Bulbul", SARVAM, _codes(SARVAM_TTS), False),
    ("mt_sarvam", "Sarvam-Translate", SARVAM, _codes(SARVAM_23), False),
    ("asr_lelapa", "Lelapa AI Vulavula", LELAPA, _codes(LELAPA_ASR), False),
    ("mt_lelapa", "Lelapa AI Vulavula", LELAPA, _codes(LELAPA_MT), False),
    ("mt_khaya", "GhanaNLP Khaya", KHAYA, _codes(KHAYA_MT), False),
    ("asr_khaya", "GhanaNLP Khaya", KHAYA, _codes(KHAYA_ASR), False),
    ("tts_khaya", "GhanaNLP Khaya", KHAYA, _codes(KHAYA_TTS), False),
    ("mt_sunbird", "Sunbird AI Sunflower", SUNBIRD, _codes(SUNBIRD_MT), False),
    ("asr_sunbird", "Sunbird AI", SUNBIRD, _codes(SUNBIRD_ASR), False),
    ("tts_sunbird", "Sunbird AI", SUNBIRD, _codes(SUNBIRD_TTS), False),
]
SPEECH = ("asr_", "tts_")  # speech locales name the variety spoken there (crosswalk.to_ltdi)
# Provider codes that mean something else in ISO 639-3: Khaya's atw is Akuapem Twi (ISO atw is Atsugewi, California)
PROVIDER_CODES = {"atw": "tw"}


def resolved(labels: list[str], names: bool, speech: bool) -> tuple[set[str], list[str]]:
    have, missing = set(), []
    for label in labels:
        c = resolve(label) if names else to_ltdi(PROVIDER_CODES.get(label, label), speech)
        if c:
            have.add(c)
        else:
            missing.append(label)
    return have, missing


def collect() -> list[Record]:
    codes = ltdi_codes()
    out = []
    for ind, source, url, labels, names in LISTS:
        have, missing = resolved(labels, names, ind.startswith(SPEECH))
        if missing:
            print(f"  {ind}: not matched {missing}")
        out += [Record(c, ind, int(c in have), "bool", source, url, RETRIEVED, "manual") for c in codes]
    return out
