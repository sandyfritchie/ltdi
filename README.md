# Language Technology Development Index (LTDI)

How well technology supports each of the world's languages, and how much data
exists to build more. Modelled on the UN's Human Development Index: three
dimension indices, each 0–1, combined with a geometric mean so a gap anywhere
pulls the score down.

    LTDI = (writing × data × technology) ^ 1/3

Builds on van Esch, Ritchie et al. (2024),
[Connecting Language Technologies with Rich, Diverse Data Sources Covering Thousands of Languages](https://aclanthology.org/2024.lrec-main.331/),
with language metadata from [LinguaMeta](https://github.com/google-research/url-nlp/tree/main/linguameta),
including its endangerment levels (UNESCO's scale), and scripts from [QQ](https://github.com/WPoelman/qwanqwa) (Poelman, Chen & de Lhoneux,
[arXiv:2603.00620](https://arxiv.org/abs/2603.00620)) where LinguaMeta has none. QQ's data is CC BY-SA 4.0, so
LTDI data derived from it carries the same licence.

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
python -m ltdi.score           # records + config/methodology.toml -> data/scores.json
python -m ltdi.build_site      # data/scores.json -> site/index.html + site/data/lang/*.json
```

No dependencies beyond the Python 3.11+ standard library.

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
service never lowers a score. Depth that describes the technology as a whole
(a published error rate) is averaged with presence. LLMs average availability in AI assistant apps with
measured benchmark quality. Language identification counts open models, at half weight.

## Sources

Vendor pages are read by `ltdi/collectors/vendors.py`: by language code where the page gives one, otherwise
by name, resolved through LinguaMeta's English names plus `config/language_names.csv`. The collector prints
any name it can't resolve.

| Dimension | Indicator | Source | Method |
| --- | --- | --- | --- |
| Writing | Main script encoded | Unicode CLDR script metadata | automated |
| Writing | Locale data coverage | Unicode CLDR | automated |
| Data | Web text (words) | FineWeb-2 language distribution | automated |
| Data | Parallel text with English (sentence pairs) | OPUS, all corpora for the pair | automated |
| Data | Annotated text (treebank words) | Universal Dependencies, latest release | automated |
| Data | Wikipedia articles and active editors | Meta-Wiki's List of Wikipedias (refreshed from each edition's statistics) | automated |
| Data | Open transcribed speech (hours) | Summed across Common Voice 27.0, FLEURS, YODAS2, WAXAL (automated) and Shrutilipi, Kathbath, IndicVoices, Vaani, NaijaVoices, Multilingual LibriSpeech (`config/speech_datasets.csv`, from each paper or card) | automated and curated |
| Data | Datasets on the Hugging Face Hub | Hub API: the whole dataset listing, read once, by language tag | automated |
| Data | Public benchmarks covering the language (of 9) | FLORES-200, Belebele, FLEURS, Global-MMLU, MMMLU, INCLUDE, XNLI, MGSM, IrokoBench | automated |
| Tech | Keyboard | Gboard, Apple iOS, SwiftKey; Keyman (open); depth: Apple's four keyboard feature lists | automated |
| Tech | Speech input | Google Cloud STT, Azure Speech, Apple dictation, Amazon Transcribe; Whisper and MMS (open); depth: Whisper large-v3 FLEURS WER, Azure speech-to-text features | automated |
| Tech | Text-to-speech | Google Cloud TTS, Azure Speech, Amazon Polly; MMS-TTS (open); depth: number of Google voice types | automated |
| Tech | Machine translation | Google Cloud Translation, Azure Translator, DeepL; NLLB-200 (open); depth: DeepL and Azure Translator per-language features | automated |
| Tech | LLMs | Availability: Gemini and Copilot app language lists. Quality: Anthropic's Global-MMLU (relative to English) and OpenAI's MMMLU (absolute accuracy) | automated; Anthropic's scores read by hand |
| Tech | Interface language | iOS system languages, Windows display languages, Microsoft 365 display languages; Firefox (open, volunteer-translated); depth: full or partial translation on Windows and Microsoft 365 | automated |
| Tech | Text recognition (OCR) | Google Cloud Vision, Azure AI Vision, iOS Live Text; Tesseract (open); depth: Google's supported vs experimental, Azure handwriting | automated |
| Tech | Spelling and grammar | Microsoft 365 proofing tools; LibreOffice Hunspell dictionaries and LanguageTool (open) | automated |
| Tech | Voice assistant | Google Assistant (speakers and displays), Siri, Alexa | automated |
| Tech | Language identification (half weight) | GlotLID v3 and CLD3, both open; the open models are the product here | automated |

## Spoken varieties and their written standard

Many languages are mostly spoken, and their speakers read and write a standard
language: Egyptian Arabic and Modern Standard Arabic, Wu and Mandarin, Marwari
and Hindi, Swiss German and German. `config/written_standards.csv` lists them
(92 so far). Such a variety takes its standard's value, where higher, for the
writing dimension, written data (web text, parallel text, treebanks, Wikipedia)
and the text technologies (keyboard, translation, LLMs, interface language,
text recognition, proofing), as set in `[written_standard]` in
`config/methodology.toml`. Speech technologies, speech data, benchmarks and
language identification stay the variety's own, so its gaps show where they
really are. The language page says which language it's written in, and each
inherited value is noted.

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
Every view on the site can be filtered by region.
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

The Charts view opens with a map: a dot for each of LinguaMeta's ~6,450
individual languages with a location, placed in the country with most speakers
(or the origin country given in `config/language_overrides.csv`). Scored languages
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

## Known limitations

- Keyboard and text-to-speech depth still come from one vendor each (Apple, Google); speech, translation and LLMs have two.
- AI assistant app lists cover Gemini and Copilot; ChatGPT's and Meta AI's official lists couldn't be read from here.
- Spelling and grammar has one commercial source, so it alone gives full presence. Google's assistant list covers
  speakers and displays; Gemini Live on phones has no full public language list yet. Siri's list is by country,
  so Portuguese, Russian and Japanese are inferred from Brazil, Russia and Japan.
- Open speech hours are a sum: YODAS2 counts hours of video with manually uploaded subtitles, not checked
  transcriptions; IndicVoices is its first release and Vaani a lower bound (later releases are larger);
  FLEURS is counted at a nominal 12 hours. NaijaVoices is non-commercial.
- OPUS counts overlap between corpora, and most sentence pairs are web-mined (the share is in each note).
- Hub dataset counts depend on how authors tag their datasets.
- English isn't in FineWeb-2 and is recorded at a nominal value above the goalpost.
- LLM quality is measured for few languages: Anthropic's Global-MMLU list is still read by hand, for the original 25.
- LinguaMeta records no script for about 1,000 languages and no speaker count for about 1,900; Wikipedia's
  infoboxes fill 834 of those counts (most of the rest are extinct, or their article covers several languages). QQ gives
  scripts for about 690 more; another 73 are held in `config/qq_scripts_held.csv` until checked (several scripts, or a
  rare one). Without a script the writing dimension sits at its floor; without speakers, opportunities can't be ranked by reach.
- LinguaMeta's endangerment levels sometimes belong to a minority variety rather than the whole language (Latvian's
  is Latgalian's); `config/endangerment_overrides.csv` corrects the clear cases (Slovenian, Armenian, Latvian, Swati),
  and gives a level for some widely used languages LinguaMeta doesn't assess.
  Where LinguaMeta gives no level, Glottolog's current one is used (`ltdi/glottolog.py`, release pinned), unless
  its assessment names a different variety; a macrolanguage with none takes its most-spoken absorbed member's.
- A language is extinct when LinguaMeta's endangerment level says so and no speaker count is recorded (a few languages
  marked extinct have revival speakers). Extinct languages keep their pages but are left out of the ranking, totals and charts.
- Most massively multilingual datasets on the Hub tag hundreds of languages each, so almost every language has a few.
- Wikipedia article counts include bot-generated stubs: Urdu (708K) outranks Hindi (172K).
- Reach uses national averages, which overstate connectivity for rural and minority-language speakers (Quechua in Peru).
