# What changed

One entry per edition: method changes (a new `methodology_version`) and the data changes that moved
scores most. `python tools/edition_diff.py <previous edition's commit>` separates the two, by scoring
the previous edition's records with the new method; its largest moves are the starting point for each
entry.

## 2026-11 (methodology 1.0)

The first version. README.md describes the method in full; in brief:

- **Two dimensions.** LTDI = √(data × technology): open data (web text, parallel text, treebanks,
  Wikipedia, transcribed speech, dictionaries, datasets and benchmarks) and technology support
  (keyboards, speech input, text-to-speech, translation, LLMs, voice assistants, and more).
- **Major services.** Every service sold worldwide with a published language list counts as a major
  service; regional providers count together as one more, where one of them offers a language. Lists
  of an app's language setting (ChatGPT, Claude) count where they name a language and are left out
  where they don't.
- **Published quality.** Measured error rates and translation scores scale a service's credit from
  half (poor) to full (good); being measured never lowers a language below its unmeasured peers.
- **Spoken varieties** are scored on their own resources, with a second score through their written
  standard beside it.
- **Tiers.** Very high, High and Medium by score; below Medium, stages by what exists: Commercial,
  Open only, Data only, None recorded.
