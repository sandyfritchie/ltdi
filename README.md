# Language Technology Development Index (LTDI)

How well technology supports each of the world's languages, and how much data
exists to build more. Modelled on the UN's Human Development Index: three
dimension indices, each 0–1, combined with a geometric mean so a gap anywhere
pulls the score down.

    LTDI = (writing × data × technology) ^ 1/3

Builds on van Esch, Ritchie et al. (2024),
[Connecting Language Technologies with Rich, Diverse Data Sources Covering Thousands of Languages](https://aclanthology.org/2024.lrec-main.331/),
with language metadata from [LinguaMeta](https://github.com/google-research/url-nlp/tree/main/linguameta).

## Status: vertical slice

25 languages, ten technologies and about 50 indicators, scored end to end with a static site.
The point of the slice is to test the method before scaling up.

## Pipeline

```
python -m ltdi.backbone        # LinguaMeta metadata for the languages in config/slice_languages.csv
python -m ltdi.collectors      # automated collectors -> data/records/*.csv (open_tools reads three repos with git)
python -m ltdi.collectors wikipedia   # needs open network access; run locally
python -m ltdi.collectors.history     # coverage history -> data/history.csv (clones two repos)
python -m ltdi.geo             # map: a point for every LinguaMeta language + Natural Earth basemap
python -m ltdi.score           # records + config/methodology.toml -> data/scores.json
python -m ltdi.build_site      # data/scores.json -> site/index.html
```

No dependencies beyond the Python 3.11+ standard library.

## Layout

| Path | What it is |
| --- | --- |
| `config/slice_languages.csv` | Languages in scope, with region overrides and notes |
| `config/crosswalk.csv` | Source language labels → LTDI codes; all rollup rules live here |
| `config/methodology.toml` | Indicators, goalposts, weights, tiers, floor |
| `ltdi/records.py` | The common record every collector emits, with provenance |
| `ltdi/collectors/` | One module per source |
| `data/records/` | Automated collector output |
| `data/manual/` | Values read from vendor pages by hand, with URL and date |
| `site/` | Static site template and build output |

## Sources in the slice

| Dimension | Indicator | Source | Method |
| --- | --- | --- | --- |
| Writing | Main script encoded | Unicode CLDR script metadata | automated |
| Writing | Locale data coverage | Unicode CLDR | automated |
| Data | Web text (words) | FineWeb-2 language distribution | automated |
| Data | Transcribed speech (hours) | Mozilla Common Voice 27.0 | automated |
| Data | MT evaluation set | FLORES-200 | automated |
| Data | Reading-comprehension benchmark | Belebele | automated |
| Data | Wikipedia articles and active editors | Wikimedia API | automated (run locally) |
| Tech | Keyboard | Gboard, Apple iOS; depth: Apple's four keyboard feature lists | manual |
| Tech | Speech input | Google Cloud STT, Azure Speech, Apple dictation; Whisper (open); depth: Whisper large-v3 FLEURS WER, Azure speech-to-text features | manual; Whisper automated |
| Tech | Text-to-speech | Google Cloud TTS; depth: number of voice types | manual |
| Tech | Machine translation | Google Cloud Translation, Azure Translator, DeepL; NLLB-200 (open); depth: DeepL and Azure Translator per-language features | manual; DeepL and NLLB automated |
| Tech | LLMs | Anthropic's Global-MMLU (relative to English) and OpenAI's MMMLU (absolute accuracy) | manual; OpenAI automated |
| Tech | Interface language | iOS system languages, Windows display languages, Microsoft 365 display languages; Firefox (open, volunteer-translated); depth: full or partial translation on Windows and Microsoft 365 | manual; Firefox automated |
| Tech | Text recognition (OCR) | Google Cloud Vision, Azure AI Vision, iOS Live Text; Tesseract (open); depth: Google's supported vs experimental, Azure handwriting | manual; Tesseract automated |
| Tech | Spelling and grammar | Microsoft 365 proofing tools; LibreOffice Hunspell dictionaries and LanguageTool (open) | manual; open tools automated |
| Tech | Voice assistant | Google Assistant (speakers and displays), Siri | manual |
| Tech | Language identification (half weight) | GlotLID v3 and CLD3, both open; the open models are the product here | automated |

## Charts and regions

Languages are grouped into Africa, South Asia, Rest of Asia, Europe, Americas
and Oceania, from the UN M49 region of the country with the most speakers
(South Asia is M49 Southern Asia), with overrides in `config/slice_languages.csv`.
Every view on the site can be filtered by region.

The Charts view opens with a map: a dot for each of LinguaMeta's ~6,450
individual languages with a location, placed in the country with most speakers
(or the origin country given in `config/slice_languages.csv`). Scored languages
are coloured by tier from dark blue (very high) to dark orange (low); the rest are white.
The basemap is Natural Earth (via world-atlas) in the Equal Earth projection.

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

## Known limitations of the slice

- Keyboard and text-to-speech depth still come from one vendor each (Apple, Google); speech, translation and LLMs have two.
- Spelling and grammar has one commercial source, so it alone gives full presence. Google's assistant list covers
  speakers and displays; Gemini Live on phones has no full public language list yet. Siri's list is by country,
  so Portuguese, Russian and Japanese are inferred from Brazil, Russia and Japan.
- Common Voice is one speech source among many, so it under-credits Hindi and over-credits Kinyarwanda.
- English isn't in FineWeb-2 and is recorded at a nominal value above the goalpost.
- LLM support is measured for 12 of the 25 languages, by at most two benchmarks.
- Wikipedia article counts include bot-generated stubs: Urdu (708K) outranks Hindi (172K).
- Reach uses national averages, which overstate connectivity for rural and minority-language speakers (Quechua in Peru).
