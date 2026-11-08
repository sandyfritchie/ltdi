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

25 languages, about 20 indicators, scored end to end with a static site.
The point of the slice is to test the method before scaling up.

## Pipeline

```
python -m ltdi.backbone        # LinguaMeta metadata for the languages in config/slice_languages.csv
python -m ltdi.collectors      # automated collectors -> data/records/*.csv
python -m ltdi.collectors wikipedia   # needs open network access; run locally
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

## Known limitations of the slice

- Keyboard and text-to-speech depth still come from one vendor each (Apple, Google); speech, translation and LLMs have two.
- Common Voice is one speech source among many, so it under-credits Hindi and over-credits Kinyarwanda.
- English isn't in FineWeb-2 and is recorded at a nominal value above the goalpost.
- LLM support is measured for 12 of the 25 languages, by at most two benchmarks.
- Wikipedia article counts include bot-generated stubs: Urdu (708K) outranks Hindi (172K).
