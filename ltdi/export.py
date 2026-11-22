"""The LTDI database: every data point the Index records, as plain tables for analysis and for sourcing
data, without the Index's own scores. Written when the site is published (pages.yml runs
python -m ltdi.export), from the committed data and config, to

    site/data/ltdi-database-<edition>.zip      the tables as CSV, with README.md and datapackage.json
    site/data/ltdi-database-<edition>.sqlite   the same tables in one SQLite file

Tables (README.md, written below, describes every column):
    languages           one row per language or variety
    technologies        the technologies tracked
    services            each product, open model or benchmark checked
    service_languages   which service offers or measures which language, with its source
    datasets            each dataset: what it holds, its licence, whether it's open and counted
    dataset_languages   how much of each dataset each language has, how that was obtained, and where
                        to get it (repository, subset, URL)
    language_facts      every other recorded value (Wikipedia, Hugging Face, fonts, service features, ...)
    not_collected       values the Index didn't collect for a language (so their absence means nothing)
    indicators          what each value in language_facts and the other tables means

A language missing from service_languages or dataset_languages has nothing recorded there: the
service's list was checked and doesn't include it, or the dataset has none of it, unless not_collected
says the value wasn't collected for that language.
"""

from __future__ import annotations

import csv
import io
import json
import re
import sqlite3
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

from . import CONFIG, DATA, ROOT

LICENCE = "CC BY-SA 4.0"  # as the site's data: its scripts come from QQ (CC BY-SA 4.0)
SITE = "https://langtechindex.org"

# name, columns: (name, type, description)
TABLES: dict[str, list[tuple[str, str, str]]] = {
    "languages": [
        ("code", "string", "The Index's code: ISO 639-1 where there is one, else ISO 639-3, or a code for a variety"),
        ("name", "string", "English name"), ("autonym", "string", "Name in the language itself, where known"),
        ("iso_639_3", "string", "ISO 639-3 code"), ("glottocode", "string", "Glottolog code"),
        ("scope", "string", "LANGUAGE, MACROLANGUAGE or another LinguaMeta scope"),
        ("speakers", "integer", "Speakers, first and second language (LinguaMeta, Wikipedia where it has none)"),
        ("region", "string", "World region"), ("countries", "string", "Countries where it's spoken, ISO 3166 codes separated by ;"),
        ("scripts", "string", "Scripts it's written in, ISO 15924 codes separated by ;"),
        ("endangerment", "string", "Endangerment level (LinguaMeta, Glottolog where it has none)"),
        ("written_standard", "string", "For a spoken variety: the code of the standard its speakers write"),
        ("members", "string", "For a macrolanguage: its member languages' codes, separated by ;"),
        ("other_names", "string", "Other names, separated by ;"), ("extinct", "boolean", "No first-language speakers"),
    ],
    "technologies": [
        ("id", "string", "Technology id"), ("name", "string", "Name"),
        ("group", "string", "main, or more (technologies outside the main group)"),
    ],
    "services": [
        ("id", "string", "Service id"), ("name", "string", "Product, model or benchmark name"),
        ("technology", "string", "technologies.id"), ("provider", "string", "Company or project"),
        ("role", "string", "consumer (a major company's product), regional, open (an open model), or measured (a benchmark result)"),
        ("kind", "string", "What it is"),
        ("listed_only", "boolean", "An app's interface language setting, where absence doesn't mean the language can't be used"),
        ("source_url", "string", "The page its language list usually comes from (service_languages has each language's)"),
        ("quality_measure", "string", "For a service with a published quality figure per language: what it is (indicators.id)"),
        ("quality_test_set", "string", "The test data that figure comes from"),
        ("note", "string", "How the listing is read"),
    ],
    "service_languages": [
        ("service", "string", "services.id"), ("language", "string", "languages.code"),
        ("listing", "string", "listed (the service's list names it), listed_as_standard (a country locale the service doesn't name "
                              "as this variety, counted for the standard language), or result (a benchmark result)"),
        ("counted_as", "string", "For listed_as_standard: the code of the language it counts for"),
        ("result", "number", "For a benchmark or quality figure: the value"), ("result_unit", "string", "Its unit"),
        ("quality_year", "integer", "Year the quality figure was measured"),
        ("quality_by", "string", "independent, or own (measured by the service's maker)"),
        ("source_url", "string", "Where this was read"), ("retrieved", "date", "When"), ("note", "string", "Note"),
    ],
    "datasets": [
        ("id", "string", "Dataset id"), ("name", "string", "Name"), ("organisation", "string", "Who made or shares it"),
        ("category", "string", "speech, web text, parallel text, treebank, lexicon, encyclopedia or benchmark"),
        ("speech_type", "string", "For speech: read, spontaneous or broadcast"), ("description", "string", "What it holds"),
        ("licence", "string", "Licence"), ("commercial_use", "string", "yes, no, or varies"),
        ("access", "string", "open (free to download, perhaps after accepting terms), or licence (sold or shared under a data "
                             "licence agreement)"),
        ("counted", "boolean", "Counted in the Index's open data; licensed datasets are listed but not counted"),
        ("url", "string", "Its main page"),
    ],
    "dataset_languages": [
        ("dataset", "string", "datasets.id"), ("language", "string", "languages.code"),
        ("amount", "number", "How much it holds for the language"), ("unit", "string", "hours, words, sentence pairs, ..."),
        ("how_counted", "string", "measured (from every clip or document), sampled (a sample, scaled up), published (as its makers "
                                  "publish it), listing (read from its listing's text), or counted (from the source's own files)"),
        ("repository", "string", "Where to get it: huggingface:<owner>/<name>, commonvoice, openslr, mozilladatacollective, or a site"),
        ("subset", "string", "What the repository calls this language: a config, folder, locale or download URL (several separated by spaces)"),
        ("access_url", "string", "A page to start from"), ("source_url", "string", "Where the amount was read"),
        ("retrieved", "date", "When"), ("note", "string", "Note"),
    ],
    "language_facts": [
        ("language", "string", "languages.code"), ("indicator", "string", "indicators.id"),
        ("value", "number", "The value; empty where it wasn't collected for this language"), ("unit", "string", "Unit"),
        ("source", "string", "Source"), ("source_url", "string", "Where it was read"), ("retrieved", "date", "When"),
        ("note", "string", "Note"),
    ],
    "not_collected": [
        ("language", "string", "languages.code"), ("indicator", "string", "indicators.id"), ("note", "string", "Why"),
    ],
    "indicators": [
        ("id", "string", "Indicator id"), ("label", "string", "What it measures"), ("unit", "string", "Unit"),
        ("table", "string", "The table its values are in"),
    ],
}

PROVIDERS = {"google": "Google", "microsoft": "Microsoft", "amazon": "Amazon", "openai": "OpenAI", "anthropic": "Anthropic",
             "apple": "Apple", "meta": "Meta", "deepl": "DeepL", "mistral": "Mistral AI", "alibaba": "Alibaba",
             "elevenlabs": "ElevenLabs", "deepgram": "Deepgram", "assemblyai": "AssemblyAI", "speechmatics": "Speechmatics",
             "abbyy": "ABBYY", "cohere": "Cohere", "xai": "xAI", "samsung": "Samsung", "open": "Open source", "yandex": "Yandex",
             "baidu": "Baidu", "naver": "Naver", "sarvam": "Sarvam AI", "lelapa": "Lelapa AI", "ghananlp": "GhanaNLP",
             "sunbird": "Sunbird AI"}

LABELS = {  # indicators the site labels in its own text
    "open_speech_hours": "Open transcribed speech, all datasets combined, overlaps removed (hours)",
    "web_text_words": "Web text: the larger of FineWeb-2 and MADLAD-400 (words)",
    "asr_azure_features": "Azure speech to text: features offered",
    "kb_apple_features": "iOS keyboard: features offered", "mt_azure_features": "Azure Translator: features offered",
    "mt_deepl_features": "DeepL: features offered", "ocr_azure_handwriting": "Azure OCR reads handwriting",
    "ocr_google_level": "Google Cloud Vision OCR: support level", "tts_google_voice_types": "Google Cloud TTS: voice types offered",
    "ui_office_level": "Microsoft 365 display language: level", "ui_windows_level": "Windows display language: level",
    "font_noto": "A Noto font displays the language's main script correctly", "script_encoded": "Main script is in Unicode",
    "cldr_coverage": "Unicode CLDR locale data level", "hf_datasets": "Datasets on the Hugging Face Hub (weighted)",
    "hf_models": "Models on the Hugging Face Hub", "hf_model_downloads": "Downloads of its Hugging Face models, last 30 days",
    "web_text_bible_share": "Share of FineWeb-2 documents from Bible sites", "wikipedia_pageviews": "Wikipedia page views, 12 months",
    "wordlist_corpuscrawler": "Corpus Crawler word list (tokens)",
    "reach_voice_share": "Estimated share of speakers who use the internet (World Bank data, weighted by country)",
    "reach_text_share": "Estimated share of speakers who use the internet and can text on a phone (World Bank data)",
    "speaker_growth_5y": "Population growth over 5 years where it's spoken (World Bank data)",
}
SKIP = {"belebele", "flores200", "eval_benchmarks", "reach_voice_share_5y", "reach_text_share_5y"}  # repeats, or the Index's own projections

META = {  # datasets with no row in config/resources.csv: organisation, licence, commercial use, url
    "parallel_sentences": ("OPUS (University of Helsinki)", "varies by corpus", "varies", "https://opus.nlpl.eu/"),
    "ud_treebank_words": ("Universal Dependencies contributors", "varies by treebank", "varies", "https://universaldependencies.org/"),
    "lexicon_panlex": ("PanLex", "CC0 1.0", "yes", "https://panlex.org/"),
    "bench_belebele": ("Meta AI", "", "", "https://github.com/facebookresearch/belebele"),
    "bench_flores200": ("Meta AI", "", "", "https://github.com/facebookresearch/flores"),
    "bench_fleurs": ("Google Research", "CC BY 4.0", "yes", "https://huggingface.co/datasets/google/fleurs"),
}

TEXT = {  # datasets counted outside the speech and benchmark lists: indicator -> (id, category, unit)
    "parallel_sentences": ("opus", "parallel text"), "ud_treebank_words": ("universal_dependencies", "treebank"),
    "lexicon_panlex": ("panlex", "lexicon"), "wikipedia_articles": ("wikipedia", "encyclopedia"),
}


def _url(url: str, code: str) -> str:
    return (url or "").split(" ")[0].replace("{lang}", code)


def _csv_rows(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as f:
        return list(csv.DictReader(l for l in f if not l.startswith("#")))


def build(scores: dict) -> dict[str, list[dict]]:
    from .build_site import SPEECH_KIND  # the speech datasets' kinds, as the Plan tab uses them

    langs = {l["code"]: l for l in json.loads((DATA / "languages.json").read_text(encoding="utf-8"))}
    facts: dict[str, dict] = scores["facts"]
    res = scores["resources"]
    orgs = {r["id"]: r for r in _csv_rows(CONFIG / "organisations.csv")}
    access = {(r["indicator"], r["language"]): r for r in _csv_rows(DATA / "dataset_access.csv")}
    techs = scores["config"]["dimensions"]["tech"]["technologies"]
    out: dict[str, list[dict]] = {t: [] for t in TABLES}
    used: set[str] = set()  # indicators exported in a table of their own

    for l in scores["languages"]:
        m = langs.get(l["code"], {})
        out["languages"].append({
            "code": l["code"], "name": l["name"], "autonym": l.get("autonym") or "", "iso_639_3": l.get("iso_639_3") or "",
            "glottocode": l.get("glottocode") or "", "scope": l.get("scope") or "", "speakers": l.get("speakers") or "",
            "region": l.get("region") or "", "countries": ";".join(c["code"].upper() for c in l.get("countries") or []),
            "scripts": ";".join(s.title() for s in l.get("scripts") or []), "endangerment": l.get("endangerment") or "",
            "written_standard": l.get("written_in") or "", "members": ";".join(l.get("members") or []),
            "other_names": ";".join(m.get("alt_names") or l.get("alt_names") or []), "extinct": bool(l.get("extinct"))})

    listed_only = set()
    for t, spec in techs.items():
        out["technologies"].append({"id": t, "name": spec["label"], "group": spec.get("group", "main")})
        listed_only |= set(spec.get("listed_only", []))
    svc_ids = set()
    quality = {}  # quality indicator -> service
    unnamed = defaultdict(dict)
    for r in _csv_rows(DATA / "unnamed_locales.csv"):
        unnamed[r["indicator"]][r["language"]] = r["counted_as"]
    svc_notes = {r["id"]: r["note"] for r in _csv_rows(CONFIG / "services.csv")}
    for s in scores["services"]:
        sid = s["id"]
        svc_ids.add(sid)
        urls = Counter(re.sub(r"(?<=[=:&/#])[a-z]{2,3}(?=$|[/&#?.])", "{lang}", _url(f[sid]["url"], ""))
                       for f in facts.values() if sid in f and f[sid]["value"])
        out["services"].append({"id": sid, "name": s["name"], "technology": s["technology"],
                                "provider": PROVIDERS.get(s.get("provider") or "", s.get("provider") or ""),
                                "role": s["role"], "kind": s.get("kind") or "", "listed_only": sid in listed_only,
                                "source_url": urls.most_common(1)[0][0] if urls else "", "quality_measure": s.get("quality") or "",
                                "quality_test_set": s.get("test_set") or "", "note": svc_notes.get(sid, "")})
        if s.get("quality"):
            quality[s["quality"]] = s
    used |= svc_ids | set(quality)
    for code, fs in facts.items():
        for s in scores["services"]:
            sid, f = s["id"], fs.get(s["id"])
            q = fs.get(s.get("quality") or "")
            if f and f["value"] and s["role"] != "measured":
                out["service_languages"].append({
                    "service": sid, "language": code, "listing": "listed", "counted_as": "",
                    "result": q["value"] if q and q["value"] else "", "result_unit": q["unit"] if q and q["value"] else "",
                    "quality_year": s.get("quality_year") or "" if q and q["value"] else "",
                    "quality_by": s.get("quality_by") or "" if q and q["value"] else "",
                    "source_url": _url(f["url"], code), "retrieved": f["retrieved"], "note": f["note"]})
            elif f and f["value"] and s["role"] == "measured":
                out["service_languages"].append({
                    "service": sid, "language": code, "listing": "result", "counted_as": "", "result": f["value"],
                    "result_unit": f["unit"], "quality_year": s.get("quality_year") or "", "quality_by": s.get("quality_by") or "",
                    "source_url": _url(f["url"], code), "retrieved": f["retrieved"], "note": f["note"]})
            elif code in unnamed.get(sid, {}):
                out["service_languages"].append({
                    "service": sid, "language": code, "listing": "listed_as_standard", "counted_as": unnamed[sid][code],
                    "result": "", "result_unit": "", "quality_year": "", "quality_by": "", "source_url": "", "retrieved": "",
                    "note": "The service lists a country locale where this variety is spoken but doesn't name the variety"})

    # Datasets: speech (resources.csv), the Data Collective's one by one, the licensed ones, text and benchmarks
    def dataset(id_, name, org, category, speech_type, description, licence, commercial, acc, counted, url):
        out["datasets"].append({"id": id_, "name": name, "organisation": org, "category": category, "speech_type": speech_type,
                                "description": description, "licence": licence, "commercial_use": commercial, "access": acc,
                                "counted": counted, "url": url})

    def row(ds, code, amount, unit, how, ind, f=None, note="", src="", acc=None, retrieved=""):
        if f and "nominal" in f["note"]:  # English's placeholder in FineWeb-2 and OPUS, not a count
            return
        a = acc or access.get((ind, code), {})
        out["dataset_languages"].append({
            "dataset": ds, "language": code, "amount": amount, "unit": unit, "how_counted": how,
            "repository": a.get("repository", ""), "subset": a.get("subset", ""), "access_url": a.get("url", ""),
            "source_url": src or (_url(f["url"], code) if f else ""), "retrieved": retrieved or (f["retrieved"] if f else ""),
            "note": note or (f["note"] if f else "")})

    speech_ids = [i for i in res if i.startswith(("speech_", "cv_")) and not i.startswith("speech_mdc")]
    for i in speech_ids:
        r, o = res[i], orgs.get(i, {})
        dataset(i, r["name"], o.get("organisation", ""), "speech", SPEECH_KIND.get(i, ""), r["what"], r["licence"],
                r["commercial"], "open", True, r["link"])
        for code, fs in facts.items():
            f = fs.get(i)
            if f and f["value"]:
                how = "published" if i.startswith("cv_") else f["method"] if f["method"] in ("measured", "sampled", "published", "listing") else "counted"
                row(i, code, f["value"], f["unit"], how, i, f)
    used |= set(speech_ids) | {i for i in res if i.startswith("speech_mdc")} | {"open_speech_hours"}
    mdc_ids = {}
    for r in _csv_rows(DATA / "mdc_datasets.csv"):
        did = "mdc_" + r["url"].rstrip("/").split("/")[-1]
        if did not in mdc_ids:
            mdc_ids[did] = r
            dataset(did, r["name"], r["steward"], "speech", SPEECH_KIND.get(r["indicator"], ""), "Shared on the Mozilla Data Collective",
                    r["licence"], "no" if r["indicator"].endswith("_nc") else "yes", "open", True, r["url"])
        row(did, r["language"], float(r["hours"]), "hours", "listing", "", note="", src=r["url"],
            acc={"repository": "mozilladatacollective", "subset": "", "url": r["url"]})
    for r in _csv_rows(DATA / "licensed_speech.csv"):
        did = "mdc_" + r["url"].rstrip("/").split("/")[-1]
        if did not in mdc_ids:
            mdc_ids[did] = r
            dataset(did, r["name"], r["steward"], "speech", "", f"For {r['task']}; on the Mozilla Data Collective",
                    r["licence"], "varies", "licence", False, r["url"])
        row(did, r["language"], float(r["hours"]) if r["hours"] else "", "hours", "listing", "",
            note="for a fee" if r["paid"] == "yes" else "under a data licence agreement", src=r["url"],
            acc={"repository": "mozilladatacollective", "subset": "", "url": r["url"]})

    # Web text: FineWeb-2 and MADLAD-400, each with its own count (the Index uses the larger, never both)
    dataset("fineweb2", "FineWeb-2", "Hugging Face", "web text", "", "Filtered web text from Common Crawl", "ODC-By 1.0", "yes", "open", True,
            "https://huggingface.co/datasets/HuggingFaceFW/fineweb-2")
    dataset("madlad400", "MADLAD-400 (clean)", "Google", "web text", "", "Audited web text from Common Crawl; counted where it holds more than FineWeb-2",
            "CC BY 4.0", "yes", "open", True, "https://huggingface.co/datasets/allenai/MADLAD-400")
    for code, fs in facts.items():
        f = fs.get("web_text_words")
        if not f or not f["value"]:
            continue
        if f["source"].startswith("MADLAD"):
            m = re.search(r"FineWeb-2's ([\d,]+) words", f["note"])
            if m and int(m.group(1).replace(",", "")):
                row("fineweb2", code, int(m.group(1).replace(",", "")), "words", "published", "web_text_fineweb2",
                    note="Train split, all scripts summed", src="https://huggingface.co/datasets/HuggingFaceFW/fineweb-2",
                    retrieved=f["retrieved"])
        else:
            row("fineweb2", code, f["value"], "words", "published", "web_text_fineweb2", f)
    madlad = defaultdict(list)  # a language can have several MADLAD labels (qu and quy), summed as the Index sums them
    for r in _csv_rows(CONFIG / "madlad_words.csv"):
        madlad[r["language"]].append(r)
    for code, rs in madlad.items():
        notes = [f"{r['label']}: {int(r['documents']):,} documents" + (f", auditors' note: {r['audit_note']}" if r["audit_note"] else "")
                 for r in rs]
        row("madlad400", code, sum(int(r["words"]) for r in rs), "words", "measured", "web_text_madlad",
            note="; ".join(notes) if len(rs) > 1 else notes[0].split(": ", 1)[1], src="https://huggingface.co/datasets/allenai/MADLAD-400")
    used |= {"web_text_words"}
    for ind, (did, cat) in TEXT.items():
        r = res.get(ind, {})
        sample = next((fs[ind] for fs in facts.values() if ind in fs and fs[ind]["value"]), None)
        m = META.get(ind, ("", "", "", ""))
        dataset(did, (r.get("name") or (sample or {}).get("source") or did), orgs.get(ind, {}).get("organisation", "") or m[0], cat, "",
                r.get("what", "") or LABELS.get(ind) or scores.get("labels", {}).get(ind, ""), r.get("licence", "") or m[1],
                r.get("commercial", "") or m[2], "open", True, r.get("link", "") or m[3])
        for code, fs in facts.items():
            f = fs.get(ind)
            if f and f["value"]:
                u = _url(f["url"], code)
                if ind == "wikipedia_articles":
                    wiki = u.split("#")[-1]
                    acc = {"repository": "dumps.wikimedia.org", "subset": f"{wiki.replace('-', '_')}wiki", "url": f"https://{wiki}.wikipedia.org/"}
                elif ind == "parallel_sentences":
                    m = re.search(r"OPUS codes? ([\w, ]+)$", f["note"])
                    acc = {"repository": "opus.nlpl.eu", "subset": " ".join(m.group(1).split(", ")) if m else code, "url": u}
                elif ind == "lexicon_panlex":
                    acc = {"repository": "panlex.org", "subset": u.rstrip("/").split("/")[-1], "url": u}
                else:
                    acc = access.get((ind, code)) or {"repository": re.sub(r"^https?://(www\.)?", "", u).split("/")[0], "subset": "", "url": u}
                row(did, code, f["value"], f["unit"], "counted", ind, f, acc=acc)
        used.add(ind)
    benches = sorted({i for fs in facts.values() for i in fs if i.startswith("bench_")})
    for i in benches:
        sample = next((fs[i] for fs in facts.values() if i in fs and fs[i]["value"]), None)
        url = (sample or {}).get("url") or META.get(i, ("", "", "", ""))[3]
        repo = url.split("huggingface.co/datasets/")[-1] if "huggingface.co/datasets/" in url else ""
        m = META.get(i, ("", "", "", ""))
        dataset(i, (sample or {}).get("source", i), m[0], "benchmark", "", "Public evaluation set (licence on its page)", m[1], m[2],
                "open", True, url)
        for code, fs in facts.items():
            f = fs.get(i)
            if f and f["value"]:
                row(i, code, "", "", "counted", i, f, note="Covered",
                    acc={"repository": f"huggingface:{repo}" if repo else re.sub(r"^https?://", "", url), "subset": "", "url": url})
    used |= set(benches)

    # Everything else, and what wasn't collected
    units = {}
    for fs in facts.values():
        for i, f in fs.items():
            units.setdefault(i, f["unit"])
    for l in scores["languages"]:
        for i in l.get("missing") or []:
            out["not_collected"].append({"language": l["code"], "indicator": i, "note": "Not collected for this language"})
    for code, fs in facts.items():
        for i, f in sorted(fs.items()):
            if (i in used and i not in ("open_speech_hours", "web_text_words")) or i in SKIP:
                continue
            if f["value"]:
                out["language_facts"].append({"language": code, "indicator": i, "value": f["value"], "unit": f["unit"],
                                              "source": f["source"], "source_url": _url(f["url"], code), "retrieved": f["retrieved"],
                                              "note": f["note"]})
    labels = {**scores.get("labels", {}), **LABELS}
    svc = {s["id"]: s for s in scores["services"]}
    for s in scores["services"]:
        if s.get("quality"):
            labels.setdefault(s["quality"], f"{s['name']} ({PROVIDERS.get(s['provider'], s['provider'])}): published quality per language")
    table_of = {**{i: "service_languages" for i in svc_ids | set(quality)}, **{i: "dataset_languages" for i in used - svc_ids - set(quality)},
                "open_speech_hours": "language_facts", "web_text_words": "language_facts"}
    for i in sorted(units):
        if i in SKIP:
            continue
        label = labels.get(i) or (res.get(i) or {}).get("name", "")
        if not label and i in svc:
            prov = PROVIDERS.get(svc[i]["provider"], svc[i]["provider"])
            label = f"{svc[i]['name']}{'' if prov in svc[i]['name'] else f' ({prov})'}: {svc[i]['kind']}"
        if not label and i.startswith("bench_"):
            label = f"Benchmark: {next(d['name'] for d in out['datasets'] if d['id'] == i)}"
        out["indicators"].append({"id": i, "label": label, "unit": units[i], "table": table_of.get(i, "language_facts")})
    return out


def readme(edition: str, counts: dict[str, int]) -> str:
    lines = [f"# LTDI database, edition {edition}", "",
             "Every data point the Language Technology Development Index records about the world's languages: which products and",
             "open models support each language, what open data exists for it and where to get it, and other facts about it.",
             f"The Index's own scores and recommendations aren't included; they're on {SITE}.", "",
             f"Licence: {LICENCE} (cite: Ritchie, Sandy ({edition[:4]}). Language Technology Development Index (LTDI) database, edition {edition}. {SITE}).",
             "The datasets listed keep their own licences: check each one's before using it.", "",
             "A language missing from service_languages or dataset_languages has nothing recorded there: the service's list",
             "doesn't include it, or the dataset has none of it, unless not_collected says the value wasn't collected for that",
             "language. Likewise, a language with no row in language_facts for an indicator has a zero or nothing for it.",
             "Join every table to languages on its language code. Amounts are as each source states or as the Index measured",
             "them (how_counted says which); datasets overlap, so don't sum them across datasets without checking.", "",
             "Example (SQLite): every openly licensed speech dataset for Hausa that permits commercial use, with where to get it:", "",
             "    SELECT d.name, dl.amount, dl.unit, d.licence, dl.repository, dl.subset, dl.access_url",
             "    FROM dataset_languages dl JOIN datasets d ON d.id = dl.dataset",
             "    WHERE dl.language = 'ha' AND d.category = 'speech' AND d.counted AND d.commercial_use = 'yes'",
             "    ORDER BY dl.amount DESC;", ""]
    for t, cols in TABLES.items():
        lines += [f"## {t} ({counts[t]:,} rows)", "", "| column | type | meaning |", "|---|---|---|"]
        lines += [f"| {n} | {ty} | {d} |" for n, ty, d in cols]
        lines.append("")
    return "\n".join(lines)


def datapackage(edition: str) -> dict:
    types = {"string": "string", "integer": "integer", "number": "number", "boolean": "boolean", "date": "date"}
    return {"name": f"ltdi-database-{edition.replace('-', '')}", "title": f"LTDI database, edition {edition}", "homepage": SITE,
            "licenses": [{"name": "CC-BY-SA-4.0", "path": "https://creativecommons.org/licenses/by-sa/4.0/"}],
            "resources": [{"name": t, "path": f"{t}.csv", "format": "csv", "mediatype": "text/csv", "encoding": "utf-8",
                           "schema": {"fields": [{"name": n, "type": types[ty], "description": d} for n, ty, d in cols]}}
                          for t, cols in TABLES.items()]}


def _cell(v):
    return "true" if v is True else "false" if v is False else v


def write(site: Path, scores: dict) -> tuple[Path, Path]:
    edition = scores["edition"]
    tables = build(scores)
    counts = {t: len(rows) for t, rows in tables.items()}
    (site / "data").mkdir(parents=True, exist_ok=True)
    zpath = site / "data" / f"ltdi-database-{edition}.zip"
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
        def put(name: str, text: str) -> None:
            info = zipfile.ZipInfo(f"ltdi-database-{edition}/{name}", date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, text)
        put("README.md", readme(edition, counts))
        put("datapackage.json", json.dumps(datapackage(edition), indent=1, ensure_ascii=False))
        for t, cols in TABLES.items():
            buf = io.StringIO()
            w = csv.writer(buf, lineterminator="\n")
            w.writerow([c[0] for c in cols])
            w.writerows([[_cell(r[c[0]]) for c in cols] for r in tables[t]])
            put(f"{t}.csv", buf.getvalue())
    spath = site / "data" / f"ltdi-database-{edition}.sqlite"
    spath.unlink(missing_ok=True)
    (site / "data" / f"ltdi-database-{edition}-sqlite.zip").unlink(missing_ok=True)
    db = sqlite3.connect(spath)
    sql = {"string": "TEXT", "integer": "INTEGER", "number": "REAL", "boolean": "INTEGER", "date": "TEXT"}
    for t, cols in TABLES.items():
        db.execute(f"CREATE TABLE {t} (" + ", ".join(f'"{n}" {sql[ty]}' for n, ty, _ in cols) + ")")
        db.executemany(f"INSERT INTO {t} VALUES ({', '.join('?' * len(cols))})",
                       [[None if r[n] == "" else (1 if r[n] is True else 0 if r[n] is False else r[n]) for n, _, _ in cols] for r in tables[t]])
    for t, col in [("service_languages", "language"), ("dataset_languages", "language"), ("language_facts", "language"),
                   ("service_languages", "service"), ("dataset_languages", "dataset"), ("language_facts", "indicator")]:
        db.execute(f"CREATE INDEX {t}_{col} ON {t} ({col})")
    db.execute("CREATE TABLE about (key TEXT, value TEXT)")
    db.executemany("INSERT INTO about VALUES (?, ?)", [("edition", edition), ("licence", LICENCE), ("homepage", SITE),
                                                       ("readme", readme(edition, counts))])
    db.commit()
    db.execute("VACUUM")
    db.close()
    qpath = site / "data" / f"ltdi-database-{edition}-sqlite.zip"
    with zipfile.ZipFile(qpath, "w", zipfile.ZIP_DEFLATED) as z:
        info = zipfile.ZipInfo(spath.name, date_time=(2026, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        z.writestr(info, spath.read_bytes())
    size = spath.stat().st_size
    spath.unlink()
    (site / "data" / "database.json").write_text(json.dumps({
        "edition": edition, "licence": LICENCE, "csv": {"file": zpath.name, "bytes": zpath.stat().st_size},
        "sqlite": {"file": qpath.name, "bytes": qpath.stat().st_size, "unzipped_bytes": size},
        "tables": [{"name": t, "rows": counts[t], "columns": [{"name": n, "type": ty, "description": d} for n, ty, d in cols]}
                   for t, cols in TABLES.items()]}, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {zpath} ({zpath.stat().st_size / 1e6:.1f} MB) and {qpath.name} ({qpath.stat().st_size / 1e6:.1f} MB): "
          + ", ".join(f"{t} {n:,}" for t, n in counts.items()))
    return zpath, qpath


def main() -> None:
    scores = json.loads((DATA / "scores.json").read_text(encoding="utf-8"))
    write(ROOT / "site", scores)


if __name__ == "__main__":
    main()
