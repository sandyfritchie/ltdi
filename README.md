# Language Technology Development Index (LTDI)

How well technology supports each of the world's languages, and how much data
exists to build more. Modelled on the UN's Human Development Index: two
dimension indices, each 0–1, combined with a geometric mean so a gap in either
pulls the score down.

    LTDI = √(data × technology)

Whether a language's main script is encoded in Unicode is reported, not scored:
nearly every recorded script is, so it told languages apart only by whether a
script was recorded at all. Locale data (CLDR) counts as a technology.

Builds on van Esch, Ritchie et al. (2024),
[Connecting Language Technologies with Rich, Diverse Data Sources Covering Thousands of Languages](https://aclanthology.org/2024.lrec-main.331/),
with language metadata from [LinguaMeta](https://github.com/google-research/url-nlp/tree/main/linguameta),
including its endangerment levels (UNESCO's scale), and scripts from [QQ](https://github.com/WPoelman/qwanqwa) (Poelman, Chen & de Lhoneux,
[arXiv:2603.00620](https://arxiv.org/abs/2603.00620)) where LinguaMeta has none. QQ's data is CC BY-SA 4.0, so
LTDI data derived from it carries the same licence (see [Licence](#licence)).

## Status

Every language in LinguaMeta (7,453 after macrolanguage rules), ten technologies and about 80 indicators
from some 40 sources, scored end to end with a static site. Commercial coverage is read from each
company's published language lists; data from FineWeb-2, OPUS, Universal Dependencies, Wikipedia,
open speech datasets, the Hugging Face Hub and public benchmarks.

## Pipeline

```
python -m ltdi.wikipedia_speakers   # speaker counts from Wikipedia infoboxes where LinguaMeta has none
python -m ltdi.qq              # scripts from QQ where LinguaMeta has none -> data/qq.csv (pip install qwanqwa)
python -m ltdi.backbone        # every LinguaMeta language (macrolanguage rules in config/macrolanguages.csv)
python -m ltdi.collectors      # every collector -> data/records/*.csv (git, plus the sites each one names)
python -m ltdi.collectors.history     # coverage history -> data/history.csv (clones two repos)
python -m ltdi.geo             # map: a point for every LinguaMeta language + Natural Earth basemap
python -m ltdi.areas           # map's tier view: Glottography language areas, projected and simplified
python -m ltdi.collectors.census_languages  # census languages by country -> data/census_languages.csv
python -m ltdi.collectors.udhr # Article 1 of the UDHR for each language's page -> data/udhr_article1.csv
python -m ltdi.collectors.lingualibre  # a few spoken words per language (GitHub Actions) -> data/lingualibre.csv
python -m ltdi.score           # records + config/methodology.toml -> data/scores.json
python -m ltdi.build_site      # data/scores.json -> site/index.html + site/data/lang/*.json
```

No dependencies beyond the Python 3.11+ standard library (pytest for the tests).

Every push and pull request is checked on GitHub Actions (`.github/workflows/check.yml`): the tests
run, then scoring and the site build, and the check fails if the committed `site/` differs from what
the build makes. So after changing data, config or code, run `python -m ltdi.score` and
`python -m ltdi.build_site` and commit `site/` with the change. The build gives the same bytes on
every run.

The page carries an index of every language (scores, coverage, gaps and the top
opportunities); each language's own detail is in `site/data/lang/<n>.json` (150
languages per file), loaded when one of its pages opens. Serve the folder
(`python -m http.server -d site`) or use GitHub Pages; opened straight from disk,
only small builds work, because then the detail is embedded.

## Layout

| Path | What it is |
| --- | --- |
| `config/language_overrides.csv` | Names, region overrides, map origins and notes for particular languages |
| `config/macrolanguages.csv` | Which macrolanguages are scored as one language, which members they absorb, and where macrolanguage labels go otherwise |
| `config/crosswalk.csv` | Source language codes → LTDI codes where the standard resolution gets them wrong |
| `config/written_standards.csv` | Spoken varieties and the standard language their speakers write |
| `config/language_names.csv` | Vendor language names → LTDI codes where LinguaMeta's English names don't match |
| `config/census_names.csv` | Census language names → LTDI codes where the Index's names don't match (several codes for a name the Index splits, `-` to leave one out) |
| `config/methodology.toml` | Indicators, goalposts, weights, tiers, floor |
| `config/services.csv` | Every service: technology, role (commercial, open, benchmark), name, provider, depth indicator |
| `ltdi/records.py` | The common record every collector emits, with provenance |
| `ltdi/collectors/` | One module per source |
| `data/records/` | Automated collector output |
| `data/manual/` | Lists read by hand where no page can be parsed (`*.lists.csv`: languages, notes, URL, date) |
| `site/` | Static site template and build output |

## Technology scores

Each technology starts from a presence score: 0.25 for being offered at all,
plus 0.75 times the share of the commercial services checked that offer it
(one of four scores 0.44; all four score 1.0). An open model alone scores 0.25.
Counting by share keeps scores comparable as more services are added. A service
with depth indicators (features, voice types, partial translation) earns half its
share for offering the language and half for the depth it offers, so adding a
service never lowers a score. Published error rates and benchmark scores work as quality factors
on the service they measure (below). LLMs score availability in the official app language lists
for Gemini, Copilot and ChatGPT, times a quality factor from published benchmarks: 0.5 + 0.5 × the
measured quality, so a poor result halves the score and an unmeasured language counts in full (being
measured never lowers a score). A language measured by a benchmark but in no app list counts at the
0.25 base for availability. Language identification counts open models, and voice assistants and
locale data count, at half weight: few languages have a voice assistant, and locale data is a
prerequisite rather than a product.

## Ranks and tiers

Each dimension has a floor of 0.05 so a language with nothing recorded in one still has a score.
Ranks use the unfloored values as a tie-break: languages are ordered by LTDI, then by the mean of their
unfloored dimension scores, so any language with something recorded ranks above every language with
nothing. Languages still level share a rank ("=1,914"), and the page shows the score before the floor
where the floor lifts it.

Tiers are in `[tiers]` in `config/methodology.toml`. The top three are set by score (Very high from
0.9, High from 0.75, Medium from 0.6). Below Medium, where scores are close and small differences
mean little, the tier is a stage, by what's recorded for the language: Low (some support from a
commercial or regional service), Very low (open tools only), Data only, and None recorded.

Regional providers (Yandex, Baidu, Alibaba Cloud's Qwen-MT, Naver Papago, Sarvam AI, Lelapa AI,
GhanaNLP's Khaya, Sunbird AI) count together as one extra commercial service, and only for the
languages one of them offers, at the best credit among them. So a regional provider can raise a
language's score and close a gap, but never lowers the score of a language it doesn't serve.

## Sources

Vendor pages are read by `ltdi/collectors/vendors.py`: by language code where the page gives one, otherwise
by name, resolved through LinguaMeta's English names plus `config/language_names.csv`. The collector prints
any name it can't resolve.

| Dimension | Indicator | Source | Method |
| --- | --- | --- | --- |
| Reported, not scored | Main script encoded | Unicode CLDR script metadata | automated |
| Data | Web text (words) | FineWeb-2 language distribution; scaled by 1 − 0.5 × FineWeb-2's share of the language's documents from Bible-related sites (most documents for 1,252 languages) | automated |
| Data | Parallel text with English (sentence pairs) | OPUS, all corpora for the pair; web-mined corpora up to 20M pairs count at the share of distinct lines in a random sample that GlotLID identifies as the language (or a member, macrolanguage or indistinguishable neighbour) (`ltdi/collectors/opus_lid.py`, run on GitHub Actions) | automated |
| Data | Annotated text (treebank words) | Universal Dependencies, latest release | automated |
| Data | Wikipedia articles and active editors | Meta-Wiki's List of Wikipedias (refreshed from each edition's statistics); articles count up to 1,000 per active editor (at least 10,000), since editions far beyond that are mostly bot-generated | automated |
| Data | Open transcribed speech (hours) | Summed across Common Voice 27.0, FLEURS, YODAS2, WAXAL (automated) and Shrutilipi, Kathbath, IndicVoices, Vaani, NaijaVoices, Multilingual LibriSpeech (`config/speech_datasets.csv`, from each paper or card) | automated and curated |
| Data | Datasets on the Hugging Face Hub | Hub API: the whole dataset listing, read once, by language tag; a dataset tagged with more than 20 languages counts 20 ÷ its languages for each | automated |
| Data | Public benchmarks covering the language (nine tracked; six or more is full marks) | FLORES-200, Belebele, FLEURS, Global-MMLU, MMMLU, INCLUDE, XNLI, MGSM, IrokoBench | automated |
| Tech | Keyboard | Gboard, Apple iOS, SwiftKey; Keyman (open); depth: Apple's four keyboard feature lists | automated |
| Tech | Speech input | Google Cloud STT, Azure AI Speech, iOS dictation, Amazon Transcribe; Whisper, MMS and Omnilingual ASR (open); depth: Whisper large-v3 FLEURS WER, Omnilingual ASR's published character error rate per language, Azure speech-to-text features | automated |
| Tech | Text-to-speech | Google Cloud TTS, Azure AI Speech, Amazon Polly, OpenAI API text-to-speech; MMS-TTS (open); depth: number of Google voice types | automated |
| Tech | Machine translation | Google Cloud Translation, Azure Translator, DeepL; NLLB-200 (open); depth: DeepL and Azure Translator per-language features | automated |
| Tech | LLMs | Availability: Gemini, Copilot and ChatGPT app language lists (ChatGPT's transcribed by hand from OpenAI's help page, `ltdi/collectors/openai_docs.py`). Quality: Anthropic's Global-MMLU (relative to English), OpenAI's MMMLU (absolute accuracy), and AfroBench's GPT-4o and Gemini 1.5 Pro translation from English into 56 African languages (FLORES-200 chrF, scaled from 25 to 50) | automated; Anthropic's scores read by hand |
| Tech | Interface language | iOS system languages, Windows display languages, Microsoft 365 display languages; Firefox (open, volunteer-translated); depth: full or partial translation on Windows and Microsoft 365 | automated |
| Tech | Text recognition (OCR) | Google Cloud Vision, Azure AI Vision, iOS Live Text; Tesseract (open); depth: Google's supported vs experimental, Azure handwriting | automated |
| Tech | Spelling and grammar | Microsoft 365 proofing tools; LibreOffice Hunspell dictionaries and LanguageTool (open) | automated |
| Tech | Voice assistant (half weight) | Google Assistant (speakers and displays), Siri, Alexa | automated |
| Tech | Regional providers | Translation: Yandex, Baidu, Alibaba Cloud (Qwen-MT), Naver Papago, Sarvam AI, Lelapa AI, GhanaNLP Khaya, Sunbird AI. Speech recognition: Yandex SpeechKit, Sarvam, Lelapa, Khaya, Sunbird. Text-to-speech: Yandex SpeechKit, Sarvam, Khaya, Sunbird | read by hand from each provider's language list (`ltdi/collectors/regional.py`) |
| Tech | Language identification (half weight) | GlotLID v3 and CLD3, both open; the open models are the product here | automated |
| Tech | Locale data (half weight) | Unicode CLDR coverage level: basic, moderate or modern | automated |

## Spoken varieties and their written standard

Many languages are mostly spoken, and their speakers read and write a standard
language: Egyptian Arabic and Modern Standard Arabic, Wu and Mandarin, Marwari
and Hindi, Swiss German and German. `config/written_standards.csv` lists them
(92 so far). Such a variety is scored, ranked and tiered on what exists for it
alone. A second, effective score takes the standard's value, where higher, for
written data (web text, parallel text, treebanks, Wikipedia), locale data and the
text technologies (keyboard, translation, LLMs, interface language, text
recognition, proofing), as set in `[written_standard]` in
`config/methodology.toml`, since most of the variety's speakers can use them.
The language page shows the effective score beside its own, and marks each
value counted "through" the standard. Opportunities for technologies take the
effective values (no one needs a Kölsch keyboard to type German), but data
opportunities and starter kits use the variety's own, so its gaps show where
they really are.

Two are different: Dari, whose written form is Persian as written in Afghanistan,
and Southern Pashto, whose speakers write standard Pashto. Sources label their
text and tools `fa` and `ps`, so an "own" score would measure labelling rather
than gaps. Marked `shares_written_form` in `config/written_standards.csv`, they
are scored and ranked with the standard's written resources as their own, with
their speech resources still their own.

## Map

The charts page's map shows each language as a dot, or, under **Tier areas**, the areas where
languages are spoken today shaded by tier: Glottography's digitisation of Asher & Moseley's *Atlas of
the World's Languages* (2007), contemporary version (CC BY 4.0), the same source as the glossodesy
project in its traditional version. About 2,300 scored languages have an area. Areas overlap, so the
land shares in the legend count the best-covered language in each place; the basemap's Equal Earth
projection keeps areas true, so pixel shares are land shares.

## Charts and regions

Languages are grouped into Africa, South Asia, Rest of Asia, Europe, Americas
and Oceania, from the UN M49 region of the country with the most speakers
(South Asia is M49 Southern Asia), with overrides in `config/language_overrides.csv`.
Every view on the site can be filtered by region, country and tier; a language counts in every region and
country where it's spoken, with its speakers there.
The Charts view can also be filtered by provider. A provider's view counts its
own services only: the map and the region chart show the share of that
provider's services (and published benchmarks) covering each language, the
coverage bars show its services one technology at a time, and history appears
where a source has one (DeepL; Meta's NLLB-200 and Belebele; OpenAI's Whisper).
Shares aren't comparable across providers, since the number of services tracked
differs (one for DeepL, fifteen for Google).

The opportunities list can be filtered by provider too: it then shows only
opportunities whose technology includes a service from that provider that
doesn't yet cover the language, and names the service on each card.

The Map tab shows where each language is spoken (Glottography's language areas) or a dot for each
of LinguaMeta's ~6,450 individual languages with a location, placed in the country with most speakers
(or the origin country given in `config/language_overrides.csv`). Scored languages are coloured by tier;
the rest are white. It has the region, country and tier
filters but not the provider filter. Each language's page has a small map of its area, or its dot.
Areas are Glottography's digitisation of Asher & Moseley's *Atlas of the World's Languages* (2007,
contemporary version), except where Glottography's digitisation of Wikipedia's list of official languages
by country (2024) fits the language's countries clearly better (`ltdi/areas.py`): English, Swahili, Korean,
Lao, Kyrgyz and Guarani. The fit is scored against LinguaMeta's countries and speakers, so a whole-country
area for a minority language (Hindi across India, Bolivia's 36 official languages across Bolivia) scores
low and isn't used. Glottography's official-language data has no area for English in the Philippines.
The basemap is Natural Earth (via world-atlas) in the Equal Earth projection.

## Writing sample

Each language's page shows Article 1 of the Universal Declaration of Human Rights in the language, where
there's a translation: 437 languages, from the UDHR in XML project (`ltdi/collectors/udhr.py`; Eric Muller's
continuation of Unicode's "UDHR in Unicode", repository eric-muller/udhr, pinned commit), which puts the
translations collected by the UN human rights office and others into one form. Only its "reasonably
complete" texts (stage 4) are used. Where several texts map to one language (dialects, scripts, older
orthographies), the one shown is in the language's main script, then tagged for the language itself rather
than a variety, then the plainest. It isn't scored.

Where Lingua Libre has recordings, the page also plays a few words spoken by one speaker
(`ltdi/collectors/lingualibre.py`, run on GitHub Actions since Wikimedia's sites aren't reachable from every
network). Lingua Libre is Wikimedia's project for recording speakers saying words and sentences from lists;
the files are on Wikimedia Commons under CC BY-SA 4.0 and are played from there (Commons' MP3 versions), with
the speaker credited. Words with an English gloss (from the Wikidata lexemes many are recorded from) come
first, then everyday words rather than names, all from the speaker with most of them. Most languages' words
have no gloss, and the recordings are of words, not of the UDHR text.

## About page

The site's About tab sets out the Index's aims, how a language is scored, how many languages each source
covers (computed at build time by `coverage()` in `ltdi/build_site.py`, so it stays current), and the
caveats below in plain language. Keep it in step with this README when sources or methods change.

## Countries

A language's countries, and its speakers in each, are LinguaMeta's, which lists the languages traditionally
spoken in a country. Immigrant and diaspora languages come from national censuses
(`ltdi/collectors/census_languages.py`): the UN Statistics Division's census table of population by language
(each country's latest census; 86 countries and territories are used) and, for the United States, the Census
Bureau's American Community Survey 2017–2021 (over 500 languages spoken at home). A census count is used only
where LinguaMeta doesn't list the language in that country, or lists it without a count, and only at 1,000
speakers or more. It changes the country and region filters, the speakers counted in them and each country's
opportunities; LinguaMeta's own figures, each language's world total and the scores stay as they are. A
language's page names the censuses it takes figures from.

The Charts view shows how many languages each technology reaches today, how
coverage has grown since 2019, and where each language stands by region. The
history (`ltdi/collectors/history.py`) comes from sources with a public record:

| Series | Source of history |
| --- | --- |
| At least 10 hours of open transcribed speech | Every Common Voice release since 2019 |
| Full locale data | Every CLDR release's modern-coverage locales, dated from npm |
| Commercial translation | Git history of DeepL's docs language table, from May 2025 |
| Open translation model, open speech recognition model, reading benchmark | NLLB-200, Whisper and Belebele release dates, with today's language lists |

## Opportunities

`ltdi/opportunities.py` compares what each language has with what each technology
needs, and proposes one of five kinds of action:

| Type | Meaning | Cost |
| --- | --- | --- |
| Share or ship | The data or models exist; open them in a shared format, or launch the product | 1 |
| Measure | No public benchmark or error rate yet | 1 |
| Standardise | Foundational locale data (CLDR) is incomplete | 1 |
| Improve | Support exists but quality lags | 2 |
| Collect | The data really is scarce | 3 |

Priority = reach × gap × need / cost, where reach is log10(potential users) − 4
and need is 1 minus the language's current score for that technology.

Potential users can be counted three ways (the site lets you switch):

- **All speakers**, from LinguaMeta.
- **Users today**: speakers online, from World Bank internet-use data weighted by
  LinguaMeta's per-country speaker counts. Voice technologies count everyone
  online; text technologies count only those who can also read and write text on
  a phone (Global Findex), falling back to adult literacy.
- **Users in five years** (default): internet use projected on its recent trend
  (at most 4 points a year, slowing near saturation) times population growth,
  with a momentum boost of 1 + log2(growth in users) / 2, capped at 2.

`python -m ltdi.collectors connectivity` needs access to `api.worldbank.org`.

### For builders

Each opportunity also carries what a team needs to decide whether to act:

- **Teams** that could take it on (keyboards, speech, text-to-speech, translation,
  LLMs, text recognition, spelling and grammar, voice assistants, data collection,
  evaluation, standards and localisation, funding), so the site can filter
  by "what does your team work on?".
- **A plain-language reason**: who it would reach, now and in five years, and
  which open resources are ready.
- **A starter kit**: the open datasets and models available for that language,
  with sizes and licences, from `config/resources.csv`.
- **What's still missing**, in concrete terms.
- **Reach by country**, and the full ranking breakdown.

Every opportunity has its own shareable page at `#opp-<language>-<rule>`, for
example `#opp-sw-tts-share`. Wording names
platforms and open resources, never companies. Each opportunity is tagged with
the coalition workstream it fits.

## Known limitations

- Keyboard and text-to-speech depth still come from one vendor each (Apple, Google); speech, translation and LLMs have two.
- AI assistant app lists cover Gemini, Copilot and ChatGPT (ChatGPT's transcribed by hand); Meta AI's official list couldn't be read from here.
- Spelling and grammar has one commercial source, so it alone gives full presence. Google's assistant list covers
  speakers and displays; Gemini Live on phones has no full public language list yet. Siri's list is by country,
  so Portuguese, Russian and Japanese are inferred from Brazil, Russia and Japan.
- Open speech hours are a sum: YODAS2 counts hours of video with manually uploaded subtitles, not checked
  transcriptions; IndicVoices is its first release and Vaani a lower bound (later releases are larger);
  FLEURS is counted at a nominal 12 hours. NaijaVoices is non-commercial.
- OPUS counts overlap between corpora, and most sentence pairs are web-mined (the share is in each note).
- Web-crawled data for low-resource languages is often not in the language at all (Kreutzer et al. 2022,
  "Quality at a Glance", TACL). FineWeb-2 filters with GlotLID per language; Wikipedia articles are capped per
  active editor and mass-tagged Hugging Face datasets counted in part (above). OPUS's web-mined corpora are
  checked by language identification on a random sample of lines, which catches wrong-language and
  non-language text but not poor translations, so the count is still an upper bound.
- Hub dataset counts depend on how authors tag their datasets.
- Font support is checked but not scored (`ltdi/collectors/fonts.py`, `data/records/fonts.csv`): every Noto
  Regular font and Noto Sans CJK, against Hyperglot's orthographies (with its HarfBuzz shaping checks) or
  CLDR's exemplar characters. Noto displays 755 of the 764 languages with a documented character set; the
  other 9 fail on quirks in the reference data (a stray combining overline in Hyperglot's Japanese, "ჳ/უ̂"
  as one Laz letter) or on strict shaping thresholds, so the indicator would add nothing. For 1,205 more
  languages the letters come from a sample of their FineWeb-2 web text (`data/fineweb_chars.csv`, sampled
  on GitHub Actions by `ltdi/collectors/fineweb_chars.py`); Noto displays all of them (3 fail only on
  quoted Arabic). The samples also show letters from another script standing in for a language's own:
  Greek ε for ɛ (Bambara, Mossi, Fon, Fanti, Kabyle), Greek ͻ and Cyrillic Ԑ for ɔ and Ɛ (Twi), Cyrillic
  ӡ for ʒ (Aja), Cyrillic ә for ə (Tatar). About 5,100 languages remain with only their script checked.
- English isn't in FineWeb-2 and is recorded at a nominal value above the goalpost.
- LLM quality is measured for few languages: Anthropic's Global-MMLU list is still read by hand, for the original 25.
- LinguaMeta records no script for about 1,000 languages and no speaker count for about 1,900; Wikipedia's
  infoboxes fill 834 of those counts (most of the rest are extinct, or their article covers several languages). QQ gives
  scripts for about 690 more; another 71 are held in `config/qq_scripts_held.csv` until checked (several scripts, or a
  rare one): remove a row once checked, and put any correction in `config/language_overrides.csv` (scripts column). Without speakers, opportunities can't be ranked by reach.
- Published quality discounts a service where it's poor: Google Translate by FLORES-200 chrF++ from English
  (Robinson et al., WMT 2023: 25 or less counts it at half, 50 or more in full), the open NLLB-200 model by Meta's
  published FLORES-200 scores for the Dense 3.3B model (`data/sources/`), and Whisper by FLEURS word error rate.
  chrF++ isn't comparable across writing systems, so Chinese, Japanese and Korean results, and results in a script
  other than the language's own, are left out. Unmeasured services count in full.
- Speech locales name the variety spoken in a country, so for speech recognition, text-to-speech and voice
  assistants `ar-EG` counts for Egyptian Arabic, `ar-AE` for Gulf Arabic and `fa-AF` for Dari
  (`config/crosswalk_speech.csv`); text services keep `ar-XX` as Arabic. Saudi and Yemeni locales, which cover
  several varieties, stay Arabic.
- LinguaMeta's endangerment levels sometimes belong to a minority variety rather than the whole language (Latvian's
  is Latgalian's); `config/endangerment_overrides.csv` corrects the clear cases (Slovenian, Armenian, Latvian, Swati),
  and gives a level for some widely used languages LinguaMeta doesn't assess (reviewed by the project lead).
  Where LinguaMeta gives no level, Glottolog's current one is used (`ltdi/glottolog.py`, release pinned), unless
  its assessment names a different variety; a macrolanguage with none takes its most-spoken absorbed member's.
- A language listed as extinct but with speakers recorded is "Revitalizing" (Cornish, Manx, Wampanoag), or takes
  Glottolog's level where that isn't extinct; second-language-only languages (N'Ko) get no level.
- A language is extinct when LinguaMeta's endangerment level says so and no speaker count is recorded (a few languages
  marked extinct have revival speakers). Extinct languages keep their pages but are left out of the ranking, totals and charts.
- Most massively multilingual datasets on the Hub tag hundreds of languages each, so almost every language has a few.
- Wikipedia article counts include bot-generated stubs: Urdu (708K) outranks Hindi (172K).
- Reach uses national averages, which overstate connectivity for rural and minority-language speakers (Quechua in Peru).
- Immigrant languages are counted only where a census asks about language and reports it (above). Many countries
  with large immigrant communities have no usable census figures: France, Germany, Spain, Italy, the Netherlands,
  Sweden, Norway and Denmark, the Gulf states, Japan, South Korea, Brazil
  and Nigeria, among others, either don't ask about language or don't report it to the UN. Their views show only
  the languages LinguaMeta lists for them. Estimating these from migration statistics would be possible, but the
  numbers would be modelled rather than counted, so it isn't done.
- Censuses ask different questions (mother tongue, language spoken at home, main language; some count a person in
  each language they name), so census counts aren't comparable between countries. Some are old (the UK's is the 2011
  census), and some tables group languages: "Chinese" not further specified is shared among the Chinese languages the
  census names, or counted as Mandarin where it names none, although in some countries many are Cantonese speakers.
  Tables that don't count speakers are left out: the Philippines (households), Rwanda (literacy), Sri Lanka,
  Russia and Ireland (ability to speak), Ghana (ethnic groups).

## Licence

The code is under the [MIT licence](LICENSE). The data the Index publishes (`data/`, the site's data
files and the scores) is under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/),
which QQ's licence requires of data derived from it. Each upstream source keeps its own terms;
[NOTICE](NOTICE) lists them.
